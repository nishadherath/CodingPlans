// Part 3 of the live verification (handoff H3): Codex read hardening and the
// message for a quoted path override (D13). Each test fails on the code before
// part 3. No test starts a real target.
//
// Live evidence (2026-11-20): with the features below off and every enabled MCP
// server switched off, a read run saw no computer-use tool, no connected-app
// tool and no MCP server tool. The server list comes from `codex mcp list
// --json` (no model call). A read run with unknown servers is not a read run,
// so a failed list stops the run.

import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { dispatch } from "../../src/dispatch/index.mjs";
import codexAdapter from "../../src/dispatch/harnesses/codex.mjs";
import { diagnose } from "../../src/dispatch/resolve.mjs";
import { fixture, makeRequest, makeResult } from "./helpers.mjs";

const isWindows = process.platform === "win32";

function tempDir() {
	const dir = mkdtempSync(join(tmpdir(), "hd-part3-"));
	return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function stand(dir, name) {
	const file = join(dir, isWindows ? `${name}.exe` : name);
	writeFileSync(file, "stand-in");
	if (!isWindows) chmodSync(file, 0o755);
	return file;
}

const LIST_ARGS = ["mcp", "list", "--json", "--disable", "plugins", "--disable", "apps"];
const FEATURES = ["plugins", "apps", "computer_use", "browser_use", "browser_use_external", "in_app_browser", "hooks"];
const SERVERS = JSON.stringify([
	{ name: "cua_repl", enabled: true, disabled_reason: null, transport: { type: "stdio" }, startup_timeout_sec: null, tool_timeout_sec: null, auth_status: "unsupported" },
	{ name: "trail", enabled: true },
	{ name: "off_one", enabled: false, disabled_reason: "user" },
	{ name: "odd name", enabled: true },
	{ name: "no-flag" },
]);

/** A fake exec: the list call and the run call are told apart by the first argument. */
function codexExec({ list = makeResult({ stdout: SERVERS }), run = makeResult({ stdout: fixture("codex", "real-ok.stdout.jsonl") }) } = {}) {
	const calls = [];
	const exec = async (command, args, options) => {
		calls.push({ command, args, options });
		return args[0] === "mcp" ? list : run;
	};
	exec.calls = calls;
	return exec;
}

async function runCodex(box, request, exec) {
	stand(box.dir, "codex");
	const env = { PATH: box.dir, HOME: box.dir, USERPROFILE: box.dir };
	return dispatch(makeRequest({ to: "codex", cwd: box.dir, ...request }), { env, exec, tmpRoot: join(box.dir, "tmp") });
}

test("codex read: the servers are listed first, and each enabled one is switched off", async () => {
	const box = tempDir();
	try {
		const exec = codexExec();
		const envelope = await runCodex(box, {}, exec);
		assert.equal(envelope.ok, true);
		assert.equal(exec.calls.length, 2);
		assert.deepEqual(exec.calls[0].args, LIST_ARGS);
		assert.equal(exec.calls[0].options.killTree, true);
		assert.ok(exec.calls[0].options.timeoutMs <= 30_000, "a short time limit");
		const args = exec.calls[1].args;
		for (const feature of FEATURES) assert.ok(args.join(" ").includes(`--disable ${feature}`), feature);
		for (const flag of ["mcp_servers.cua_repl.enabled=false", "mcp_servers.trail.enabled=false", 'mcp_servers."odd name".enabled=false', "mcp_servers.no-flag.enabled=false"]) {
			assert.ok(args.includes(flag), flag);
			assert.equal(args[args.indexOf(flag) - 1], "-c");
		}
		assert.ok(!args.some((arg) => arg.includes("off_one")), "a server that is already off gets no override");
	} finally {
		box.cleanup();
	}
});

test("codex read: no servers means no override, and a resume is hardened too", async () => {
	const box = tempDir();
	try {
		const exec = codexExec({ list: makeResult({ stdout: "[]" }) });
		const envelope = await runCodex(box, { resume: "sess-1" }, exec);
		assert.equal(envelope.ok, true);
		const args = exec.calls[1].args;
		assert.deepEqual(args.slice(0, 2), ["exec", "resume"]);
		assert.ok(args.includes("--disable") && !args.some((arg) => arg.startsWith("mcp_servers")));
	} finally {
		box.cleanup();
	}
});

for (const [name, list] of [
	["a failed list call", makeResult({ code: 1, stderr: "boom" })],
	["a list that is not JSON", makeResult({ stdout: "No MCP servers configured." })],
	["a list that is not an array", makeResult({ stdout: '{"servers":[]}' })],
	["a server without a name", makeResult({ stdout: '[{"enabled":true}]' })],
	["a timeout", makeResult({ code: null, timedOut: true })],
	["a spawn error", makeResult({ code: null, spawnError: Object.assign(new Error("x"), { code: "ENOENT" }) })],
]) {
	test(`codex read fails closed on ${name}: no run starts`, async () => {
		const box = tempDir();
		try {
			const exec = codexExec({ list });
			const envelope = await runCodex(box, {}, exec);
			assert.equal(envelope.ok, false);
			assert.equal(envelope.error.code, "target-error");
			assert.equal(envelope.exit_code, 1);
			assert.match(envelope.error.message, /MCP servers could not be listed/);
			assert.equal(exec.calls.length, 1, "only the list call ran");
			assert.equal(exec.calls[0].args[0], "mcp");
		} finally {
			box.cleanup();
		}
	});
}

test("codex write: no list call, no disable flags, no server overrides", async () => {
	const box = tempDir();
	try {
		const exec = codexExec();
		const envelope = await runCodex(box, { access: "write" }, exec);
		assert.equal(envelope.ok, true);
		assert.equal(exec.calls.length, 1);
		assert.doesNotMatch(exec.calls[0].args.join(" "), /--disable|mcp_servers/);
	} finally {
		box.cleanup();
	}
});

test("a claude read run makes no list call", async () => {
	const box = tempDir();
	try {
		stand(box.dir, "claude");
		const calls = [];
		const exec = async (command, args) => (calls.push(args), makeResult({ stdout: fixture("claude", "real-ok.stdout.json") }));
		const env = { PATH: box.dir, HOME: box.dir, USERPROFILE: box.dir };
		const envelope = await dispatch(makeRequest({ to: "claude", cwd: box.dir }), { env, exec, tmpRoot: join(box.dir, "tmp") });
		assert.equal(envelope.ok, true);
		assert.equal(calls.length, 1);
	} finally {
		box.cleanup();
	}
});

test("the list call starts the program the same way as the run (npm shim entry first)", { skip: !isWindows && "needs the .cmd shim of Windows" }, async () => {
	const box = tempDir();
	try {
		const entryDir = join(box.dir, "bin", "node_modules", "pkg", "bin");
		mkdirSync(entryDir, { recursive: true });
		writeFileSync(join(entryDir, "tool.js"), "// entry");
		writeFileSync(join(box.dir, "bin", "codex.cmd"), '"%_prog%"  "%dp0%\\node_modules\\pkg\\bin\\tool.js" %*');
		const exec = codexExec({ list: makeResult({ stdout: "[]" }) });
		const env = { PATH: join(box.dir, "bin"), HOME: box.dir, USERPROFILE: box.dir };
		await dispatch(makeRequest({ to: "codex", cwd: box.dir }), { env, exec, tmpRoot: join(box.dir, "tmp") });
		assert.equal(exec.calls[0].command, process.execPath);
		assert.deepEqual(exec.calls[0].args.slice(1), LIST_ARGS, "the entry file comes first");
	} finally {
		box.cleanup();
	}
});

test("codex buildInvocation for read needs the server list (fail closed)", () => {
	const bare = { env: {}, tempFile: (name) => `TMP/${name}` };
	assert.throws(
		() => codexAdapter.buildInvocation(makeRequest({ to: "codex", cwd: "/work" }), bare),
		(error) => error.code === "target-error" && /MCP servers could not be listed/.test(error.message),
	);
	assert.doesNotThrow(() => codexAdapter.buildInvocation(makeRequest({ to: "codex", cwd: "/work", access: "write" }), bare));
});

// ------------------------------------------------------------ item 3 (D13)

test("an override value in quote characters is named in the message", async () => {
	for (const value of ['"C:\\tools\\codex.exe"', "'/usr/local/bin/codex'"]) {
		const found = await diagnose(codexAdapter, { PATH: "", HARNESS_DISPATCH_CODEX_PATH: value }, {});
		assert.equal(found.state, "usage", value);
		assert.match(found.message, /quote/i, value);
		assert.match(found.message, /HARNESS_DISPATCH_CODEX_PATH/);
	}
	const relative = await diagnose(codexAdapter, { PATH: "", HARNESS_DISPATCH_CODEX_PATH: "codex" }, {});
	assert.doesNotMatch(relative.message, /quote/i, "a plain relative path keeps the old message");
});

// ------------------------------------------------------ item 2 (D11, D12): text

test("SKILL.md and the contract say exactly what the live runs prove about read access", async () => {
	const { readFileSync } = await import("node:fs");
	const root = join(import.meta.dirname, "..", "..");
	const skill = readFileSync(join(root, "skill", "harness-dispatch", "SKILL.md"), "utf8");
	assert.ok(skill.trimEnd().split(/\r?\n/).length <= 120);
	const row = (name) => skill.split("\n").find((line) => line.startsWith(`| ${name} |`)) ?? "";
	assert.match(row("Claude Code"), /No shell tools, no edit tools, no MCP servers, no user, project or local settings, no hooks from them\. Managed settings still apply\./);
	assert.match(row("Codex"), /read-only sandbox with no approval/);
	assert.match(row("Codex"), /Plugins, connected apps, computer-use, browser features, hooks and configured MCP servers are off\./);
	assert.match(row("Codex"), /built-in web tool stays available/);
	assert.match(row("Antigravity"), /Every shell command is refused\. File tools are refused by plan mode\. MCP and browser tools were not tested in read mode\./);
	assert.match(skill, /do not put content from a source that you do not trust into a dispatch/);
	assert.doesNotMatch(skill, /Computer-use and connected-app tools stay available/, "the old claim is gone");
	const contract = readFileSync(join(root, "docs", "design", "harness-dispatch-contract.md"), "utf8");
	for (const needle of ["mcp list --json --disable plugins --disable apps", "Fail closed", "built-in web tool", "Managed settings and `--settings` still apply", "prepare(request"]) {
		assert.ok(contract.includes(needle), needle);
	}
});
