// Unit tests for the small pure modules: guard, envelope, request, parse, resolve.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildEnvelope, errorEnvelope, exitCodeFor, normalizeUsage, truncateText } from "../../src/dispatch/envelope.mjs";
import { checkDepth, readDepth, withDepth } from "../../src/dispatch/guard.mjs";
import { looksUnauthenticated, parseJsonLines, parseJsonLoose, redact, tailText } from "../../src/dispatch/parse.mjs";
import { validateRequest } from "../../src/dispatch/request.mjs";
import { parseCmdShim, resolveNamed, resolveNpmShim } from "../../src/dispatch/resolve.mjs";

const isWindows = process.platform === "win32";

// ------------------------------------------------------------------ guard

test("depth guard: default depth 0 and maximum 1", () => {
	assert.deepEqual(readDepth({}), { depth: 0, max: 1, valid: true });
	assert.equal(checkDepth({}).allowed, true);
	assert.equal(checkDepth({ HARNESS_DISPATCH_DEPTH: "1" }).allowed, false);
	assert.equal(checkDepth({ HARNESS_DISPATCH_DEPTH: "1", HARNESS_DISPATCH_MAX_DEPTH: "3" }).allowed, true);
	assert.equal(checkDepth({ HARNESS_DISPATCH_DEPTH: "3", HARNESS_DISPATCH_MAX_DEPTH: "3" }).allowed, false);
});

test("depth guard: a broken depth value fails closed", () => {
	for (const bad of ["abc", "-1", "1.5", "9999999999"]) {
		const result = checkDepth({ HARNESS_DISPATCH_DEPTH: bad });
		assert.equal(result.allowed, false, `depth "${bad}" must refuse`);
	}
	// A broken maximum falls back to the default.
	assert.equal(readDepth({ HARNESS_DISPATCH_MAX_DEPTH: "x" }).max, 1);
});

test("withDepth adds 1 and keeps the other variables", () => {
	const env = { A: "1", HARNESS_DISPATCH_DEPTH: "2" };
	assert.deepEqual(withDepth(env), { A: "1", HARNESS_DISPATCH_DEPTH: "3" });
	assert.equal(withDepth({}).HARNESS_DISPATCH_DEPTH, "1");
	assert.equal(env.HARNESS_DISPATCH_DEPTH, "2", "the input is not changed");
});

// --------------------------------------------------------------- envelope

test("envelope has the fields and the order of the contract", () => {
	const envelope = buildEnvelope({ harness: "codex", text: "hi" });
	assert.deepEqual(Object.keys(envelope), [
		"schema", "ok", "harness", "model", "effort", "access", "session_id", "text", "structured",
		"truncated", "usage", "cost_usd", "duration_ms", "exit_code", "error", "log_file",
	]);
	assert.equal(envelope.schema, "harness-dispatch/1");
	assert.deepEqual(Object.keys(envelope.usage), ["input_tokens", "output_tokens", "cache_read_tokens", "reasoning_tokens", "total_tokens"]);
	assert.equal(envelope.ok, true);
	assert.equal(envelope.exit_code, 0);
});

test("a usage field that the target does not report is null, never estimated", () => {
	assert.deepEqual(normalizeUsage({ input_tokens: 5 }), { input_tokens: 5, output_tokens: null, cache_read_tokens: null, reasoning_tokens: null, total_tokens: null });
	assert.equal(normalizeUsage({ input_tokens: "5" }).input_tokens, null);
	assert.equal(normalizeUsage(undefined).total_tokens, null);
});

test("error codes map to the exit codes of the contract", () => {
	const table = {
		"target-error": 1, timeout: 1, "bad-output": 1, "not-authenticated": 1,
		usage: 2, "prompt-too-long": 2, "not-installed": 3, "not-startable": 3, "depth-exceeded": 4,
	};
	for (const [code, exit] of Object.entries(table)) {
		const envelope = errorEnvelope(code, "x");
		assert.equal(envelope.exit_code, exit, code);
		assert.equal(envelope.ok, false);
		assert.equal(exitCodeFor({ code }), exit);
	}
	assert.equal(exitCodeFor(null), 0);
});

test("error messages never hold an account email or a secret", () => {
	const envelope = errorEnvelope("target-error", "Logged in as person@example.com with sk-abcdefghijklmnopqrstuvwxyz");
	assert.doesNotMatch(envelope.error.message, /person@example\.com|sk-abcdef/);
	assert.match(envelope.error.message, /\[email\]/);
});

test("truncateText cuts to max-chars, and keeps surrogate pairs whole", () => {
	assert.deepEqual(truncateText("abcdef", 3), { text: "abc", truncated: true });
	assert.deepEqual(truncateText("abc", 3), { text: "abc", truncated: false });
	const cut = truncateText("a\u{1F600}b", 2); // the pair would be cut in the middle
	assert.equal(cut.text, "a");
	assert.equal(cut.truncated, true);
});

// ------------------------------------------------------------------ parse

test("parseJsonLoose accepts JSON with a status line before it", () => {
	assert.deepEqual(parseJsonLoose('{"a":1}'), { a: 1 });
	assert.deepEqual(parseJsonLoose('Starting...\n{"a":1}\n'), { a: 1 });
	assert.deepEqual(parseJsonLoose('noise {"a":{"b":2}} noise'), { a: { b: 2 } });
	assert.equal(parseJsonLoose("plain"), undefined);
	assert.equal(parseJsonLoose(""), undefined);
	assert.equal(parseJsonLoose("42"), undefined);
});

test("parseJsonLines skips lines that are not objects", () => {
	assert.deepEqual(parseJsonLines('banner\n{"a":1}\n{broken\n{"b":2}\n'), [{ a: 1 }, { b: 2 }]);
});

test("redact and tailText", () => {
	assert.equal(redact("mail a.b@c.io now"), "mail [email] now");
	assert.match(redact("Bearer abcdefghijklmnopqrstuvwxyz0123"), /Bearer \[secret\]/);
	assert.equal(tailText("x".repeat(10), 4), "...xxxx");
	assert.equal(tailText("a\n\n b"), "a b");
});

test("looksUnauthenticated", () => {
	assert.equal(looksUnauthenticated("Please run /login"), true);
	assert.equal(looksUnauthenticated("Error: 401 Unauthorized"), true);
	assert.equal(looksUnauthenticated("the build failed"), false);
});

// ---------------------------------------------------------------- request

const check = (raw) => validateRequest({ prompt: "p", ...raw }, { targets: ["claude", "codex"], cwd: process.cwd() });

test("validateRequest applies the defaults of the contract", () => {
	const { request } = check({ to: "claude" });
	assert.equal(request.access, "read");
	assert.equal(request.timeoutSec, 600);
	assert.equal(request.maxChars, 20000);
	assert.equal(request.cwd, process.cwd());
	assert.equal(request.model, null);
});

test("validateRequest rejects bad input with a usage error", () => {
	const bad = [
		{ to: undefined },
		{ to: "nope" },
		{ to: "claude", prompt: "   " },
		{ to: "claude", access: "root" },
		{ to: "claude", effort: "wild" },
		{ to: "claude", timeout: "0" },
		{ to: "claude", timeout: "abc" },
		{ to: "claude", timeout: "99999999" },
		{ to: "claude", maxChars: "-5" },
		{ to: "claude", model: "--effort" },
		{ to: "claude", resume: "" },
	];
	for (const raw of bad) {
		const result = check(raw);
		assert.equal(result.error?.code, "usage", JSON.stringify(raw));
		assert.ok(result.error.message.length > 0);
	}
});

test("there is no access value that removes all permission checks", () => {
	for (const access of ["bypass", "full", "danger", "yolo", "none"]) {
		assert.equal(check({ to: "claude", access }).error?.code, "usage");
	}
});

// ---------------------------------------------------------------- resolve

test("parseCmdShim finds the entry file of an npm shim", () => {
	const shim = '@ECHO off\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n';
	assert.equal(parseCmdShim(shim, join("C:", "tools")), join("C:", "tools", "node_modules", "@openai", "codex", "bin", "codex.js"));
	assert.equal(parseCmdShim('"%~dp0\\x\\y.mjs" %*', "D"), join("D", "x", "y.mjs"));
	assert.equal(parseCmdShim("@echo nothing", "D"), undefined);
});

test("resolveNpmShim starts the package entry with the current Node program", { skip: !isWindows && "needs .cmd handling of the Windows suffix table" }, () => {
	const dir = mkdtempSync(join(tmpdir(), "hd-resolve-test-"));
	try {
		mkdirSync(join(dir, "node_modules", "pkg", "bin"), { recursive: true });
		writeFileSync(join(dir, "node_modules", "pkg", "bin", "tool.js"), "// entry");
		writeFileSync(join(dir, "tool.cmd"), '"%_prog%"  "%dp0%\\node_modules\\pkg\\bin\\tool.js" %*');
		const found = resolveNpmShim("tool", { PATH: dir });
		assert.equal(found.command, process.execPath);
		assert.deepEqual(found.prefixArgs, [join(dir, "node_modules", "pkg", "bin", "tool.js")]);
		assert.equal(found.via, "npm-shim");
		// A shim whose entry file is missing is not used.
		rmSync(join(dir, "node_modules"), { recursive: true });
		assert.equal(resolveNpmShim("tool", { PATH: dir }), undefined);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("a real executable on PATH beats the shim route", { skip: !isWindows && "Windows suffix rule" }, () => {
	const dir = mkdtempSync(join(tmpdir(), "hd-resolve-test-"));
	try {
		writeFileSync(join(dir, "tool.exe"), "binary");
		writeFileSync(join(dir, "tool.cmd"), "@echo shim");
		const found = resolveNamed("tool", { PATH: dir, USERPROFILE: dir }, { npmShim: true });
		assert.equal(found.command, join(dir, "tool.exe"));
		assert.equal(found.via, "path");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("resolveNamed uses the extra folders and the home of the given environment", () => {
	const dir = mkdtempSync(join(tmpdir(), "hd-resolve-test-"));
	try {
		const name = isWindows ? "agy.exe" : "agy";
		mkdirSync(join(dir, "extra"));
		writeFileSync(join(dir, "extra", name), "x", { mode: 0o755 });
		const found = resolveNamed("agy", { PATH: join(dir, "empty"), USERPROFILE: dir, HOME: dir }, { extraDirs: [join(dir, "extra")] });
		assert.equal(found.command, join(dir, "extra", name));

		mkdirSync(join(dir, ".local", "bin"), { recursive: true });
		writeFileSync(join(dir, ".local", "bin", name), "x", { mode: 0o755 });
		const viaHome = resolveNamed("agy", { PATH: join(dir, "empty"), USERPROFILE: dir, HOME: dir });
		assert.equal(viaHome.command, join(dir, ".local", "bin", name));

		assert.equal(resolveNamed("agy", { PATH: join(dir, "empty"), USERPROFILE: join(dir, "nobody"), HOME: join(dir, "nobody") }), undefined);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("resolveNamed ignores a relative PATH entry", () => {
	// Acceptance defect D8: PATH "." gave a relative command, and spawn then
	// searched the working directory of the target.
	const name = `hd-relpath-${process.pid}`;
	const file = join(process.cwd(), isWindows ? `${name}.exe` : name);
	writeFileSync(file, "x", isWindows ? undefined : { mode: 0o755 });
	try {
		const home = mkdtempSync(join(tmpdir(), "hd-core-"));
		try {
			assert.equal(resolveNamed(name, { PATH: ".", USERPROFILE: home, HOME: home }), undefined);
			const found = resolveNamed(name, { PATH: process.cwd(), USERPROFILE: home, HOME: home });
			assert.equal(found?.command, file);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	} finally {
		rmSync(file, { force: true });
	}
});
