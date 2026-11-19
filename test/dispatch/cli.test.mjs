// CLI tests: argument rules, the one-JSON-line rule on stdout, and the exit
// codes. `main` runs in this process with fake streams. A few tests start the
// real `bin/` script and the bundle. No test calls a model.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { main, parseArgs } from "../../src/dispatch/cli.mjs";
import { fixture, makeResult, repoRoot } from "./helpers.mjs";

const isWindows = process.platform === "win32";

/** Run `main` with fake streams. Returns { code, stdout, stderr }. */
async function hd(argv, { stdin = "", isTTY = false, env = {}, deps = {}, cwd } = {}) {
	let stdout = "";
	let stderr = "";
	const input = Readable.from(stdin === "" ? [] : [Buffer.from(stdin)]);
	input.isTTY = isTTY;
	const code = await main(argv, {
		stdout: { write: (text) => (stdout += text) },
		stderr: { write: (text) => (stderr += text) },
		stdin: input,
		env,
		cwd,
		deps,
	});
	return { code, stdout, stderr };
}

/** The output must be exactly one JSON object and one newline. */
function oneJson(stdout) {
	assert.ok(stdout.endsWith("\n"), "ends with a newline");
	assert.equal(stdout.trimEnd().split("\n").length, 1, "one line");
	return JSON.parse(stdout);
}

test("usage errors give exit code 2 and one JSON line on stdout", async () => {
	const bad = [
		[],
		["frobnicate"],
		["run"],
		["run", "--to", "nope", "--prompt", "x"],
		["run", "--to", "claude", "--prompt", "x", "--wat"],
		["run", "--to", "claude", "--prompt"],
		["run", "--to", "claude", "--prompt", "x", "--timeout", "abc"],
		["run", "--to", "claude", "--prompt", "x", "--effort", "wild"],
		["run", "--to", "claude", "--prompt", "x", "--access", "root"],
		["run", "--to", "claude", "--prompt", "x", "--prompt-file", "f"],
		["run", "--to", "claude", "--prompt", "x", "--prompt", "y"],
		["run", "--to", "claude", "stray"],
		["run", "--to", "claude", "--prompt-file", "no-such-file.txt"],
		["run", "--to", "claude", "--prompt", "x", "--schema", "no-such-schema.json"],
		["list", "--to", "claude"],
		["doctor", "--to", "nope"],
		["models"],
		["models", "--to", "nope"],
	];
	for (const argv of bad) {
		const result = await hd(argv, { env: { PATH: "" } });
		assert.equal(result.code, 2, `argv: ${argv.join(" ")}`);
		const envelope = oneJson(result.stdout);
		assert.equal(envelope.ok, false);
		assert.equal(envelope.error.code, "usage");
		assert.equal(envelope.exit_code, 2);
		assert.ok(result.stderr.startsWith("hd: "), "the reason goes to stderr");
	}
});

test("an empty prompt, or no prompt on a terminal, is a usage error", async () => {
	assert.equal((await hd(["run", "--to", "claude", "--prompt", "  "])).code, 2);
	assert.equal((await hd(["run", "--to", "claude"], { isTTY: true })).code, 2);
	assert.equal((await hd(["run", "--to", "claude"], { stdin: "" })).code, 2, "an empty stdin is an empty prompt");
});

test("flags accept --name=value", () => {
	assert.deepEqual(parseArgs(["run", "--to=codex", "--prompt=a=b"]).flags, { to: "codex", prompt: "a=b" });
});

test("a schema file that is not JSON is a usage error", async () => {
	const dir = mkdtempSync(join(tmpdir(), "hd-cli-test-"));
	try {
		writeFileSync(join(dir, "bad.json"), "{ not json");
		const result = await hd(["run", "--to", "claude", "--prompt", "x", "--schema", "bad.json"], { cwd: dir });
		assert.equal(result.code, 2);
		assert.match(oneJson(result.stdout).error.message, /not valid JSON/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("help and --version are plain text with exit code 0", async () => {
	const help = await hd(["help"]);
	assert.equal(help.code, 0);
	assert.match(help.stdout, /Usage:/);
	assert.match(help.stdout, /--access <read\|write>/);
	assert.doesNotMatch(help.stdout, /dangerously|bypass/i, "no bypass option is offered");
	const version = await hd(["--version"]);
	assert.equal(version.code, 0);
	assert.match(version.stdout, /^\d+\.\d+\.\d+\n$/);
});

test("the depth guard answers before stdin is read", async () => {
	const stdin = new Readable({
		read() {
			throw new Error("stdin must not be read");
		},
	});
	stdin.isTTY = false;
	let stdout = "";
	const code = await main(["run", "--to", "codex"], {
		stdout: { write: (text) => (stdout += text) },
		stderr: { write: () => {} },
		stdin,
		env: { HARNESS_DISPATCH_DEPTH: "1" },
	});
	assert.equal(code, 4);
	assert.equal(oneJson(stdout).error.code, "depth-exceeded");
});

test("run: prompt from stdin, file, and --out", async () => {
	const dir = mkdtempSync(join(tmpdir(), "hd-cli-test-"));
	try {
		const exe = join(dir, isWindows ? "claude.exe" : "claude");
		writeFileSync(exe, "stand-in");
		if (!isWindows) chmodSync(exe, 0o755);
		const calls = [];
		const exec = async (command, args, options) => {
			calls.push({ args, input: options.input });
			return makeResult({ stdout: fixture("claude", "synthetic-success.json") });
		};
		const env = { PATH: dir, HOME: dir, USERPROFILE: dir };
		const deps = { exec, tmpRoot: join(dir, "tmp") };

		const viaStdin = await hd(["run", "--to", "claude", "--cwd", dir], { stdin: "prompt from stdin", env, deps });
		assert.equal(viaStdin.code, 0, viaStdin.stderr);
		assert.equal(oneJson(viaStdin.stdout).text, "OK");
		assert.equal(calls[0].input, "prompt from stdin");

		writeFileSync(join(dir, "brief.txt"), "﻿prompt from file");
		const out = join(dir, "result.json");
		const viaFile = await hd(["run", "--to", "claude", "--prompt-file", "brief.txt", "--out", "result.json", "--access", "write", "--cwd", dir], { env, deps, cwd: dir });
		assert.equal(viaFile.code, 0, viaFile.stderr);
		assert.equal(calls[1].input, "prompt from file", "the byte order mark is removed");
		assert.ok(calls[1].args.includes("acceptEdits"));
		assert.equal(existsSync(out), true);
		assert.deepEqual(JSON.parse(readFileSync(out, "utf8")), oneJson(viaFile.stdout));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("a failed target gives exit code 1 and the error envelope", async () => {
	const dir = mkdtempSync(join(tmpdir(), "hd-cli-test-"));
	try {
		const exe = join(dir, isWindows ? "agy.exe" : "agy");
		writeFileSync(exe, "stand-in");
		if (!isWindows) chmodSync(exe, 0o755);
		const exec = async () => makeResult({ code: 1, stdout: fixture("antigravity", "synthetic-failure.json") });
		const result = await hd(["run", "--to", "antigravity", "--prompt", "x", "--cwd", dir], { env: { PATH: dir, HOME: dir, USERPROFILE: dir }, deps: { exec, tmpRoot: join(dir, "tmp") } });
		assert.equal(result.code, 1);
		const envelope = oneJson(result.stdout);
		assert.equal(envelope.error.code, "target-error");
		assert.equal(envelope.harness, "antigravity");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

// ------------------------------------------------------- real processes

function startReal(script, args, options = {}) {
	return spawnSync(process.execPath, [join(repoRoot, script), ...args], { encoding: "utf8", timeout: 60_000, input: "", ...options });
}

for (const script of ["bin/harness-dispatch.mjs", "skill/harness-dispatch/scripts/hd.mjs"]) {
	test(`${script}: a usage error exits 2 with one JSON line`, () => {
		const result = startReal(script, ["run", "--to", "bogus", "--prompt", "x"]);
		assert.equal(result.status, 2, result.stderr);
		assert.equal(oneJson(result.stdout).error.code, "usage");
	});

	test(`${script}: the depth guard exits 4 and starts no target`, () => {
		const result = startReal(script, ["run", "--to", "claude", "--prompt", "x"], { env: { ...process.env, HARNESS_DISPATCH_DEPTH: "1" } });
		assert.equal(result.status, 4, result.stderr);
		assert.equal(oneJson(result.stdout).error.code, "depth-exceeded");
	});

	test(`${script}: help exits 0`, () => {
		const result = startReal(script, ["help"]);
		assert.equal(result.status, 0);
		assert.match(result.stdout, /harness-dispatch/);
	});
}
