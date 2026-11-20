// Part 1 of the live verification (handoff H3): tests for the new error codes,
// the denied-action field, the version-based choice of an executable, and the
// path override. Each test fails on the code before Part 1.
//
// No test starts a real target. Files are stand-ins in temporary folders and
// the version probe is an injected function.

import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { buildEnvelope, errorEnvelope, exitCodeFor } from "../../src/dispatch/envelope.mjs";
import { dispatch, listTargets } from "../../src/dispatch/index.mjs";
import { deniedActions, failureCode, looksUsageLimited } from "../../src/dispatch/parse.mjs";
import { compareVersions, diagnose } from "../../src/dispatch/resolve.mjs";
import codexAdapter from "../../src/dispatch/harnesses/codex.mjs";
import { fixture, makeRequest, makeResult } from "./helpers.mjs";

const isWindows = process.platform === "win32";
const exeName = (name) => (isWindows ? `${name}.exe` : name);

/** A temporary folder that the test removes in `cleanup`. */
function tempDir() {
	const dir = mkdtempSync(join(tmpdir(), "hd-part1-"));
	return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Write a stand-in executable. Returns its absolute path. */
function stand(dir, name = "codex") {
	mkdirSync(dir, { recursive: true });
	const file = join(dir, exeName(name));
	writeFileSync(file, "stand-in");
	if (!isWindows) chmodSync(file, 0o755);
	return file;
}

/**
 * A version probe. `versions` maps a path to a version text. Any other path
 * fails. `calls` records the commands that were probed.
 */
function versionProbe(versions) {
	const calls = [];
	const exec = async (command, args) => {
		calls.push([command, ...args].join(" "));
		const key = Object.keys(versions).find((path) => [command, ...args].join(" ").includes(path));
		if (!key || versions[key] === null) return makeResult({ code: 1, stderr: "cannot run" });
		return makeResult({ stdout: `codex-cli ${versions[key]}\n` });
	};
	exec.calls = calls;
	return exec;
}

// ------------------------------------------------- item 2 and 3: codes, fields

test("new error codes map to exit code 1", () => {
	assert.equal(exitCodeFor({ code: "permission-denied" }), 1);
	assert.equal(exitCodeFor({ code: "usage-limit" }), 1);
	assert.equal(errorEnvelope("usage-limit", "x").exit_code, 1);
});

test("the envelope has `denied_actions`, after `error`, an empty array by default", () => {
	const envelope = buildEnvelope({ harness: "codex", text: "hi" });
	assert.deepEqual(envelope.denied_actions, []);
	const keys = Object.keys(envelope);
	assert.equal(keys[keys.indexOf("error") + 1], "denied_actions");
	assert.deepEqual(buildEnvelope({ denied_actions: ["command: Bash", 5, ""] }).denied_actions, ["command: Bash"]);
	assert.deepEqual(errorEnvelope("usage", "x").denied_actions, []);
});

test("deniedActions turns agy records into text", () => {
	assert.deepEqual(deniedActions([{ action: "command", display_name: "Bash" }, { action: "write" }, "raw", null, {}]), ["command: Bash", "write", "raw"]);
	assert.deepEqual(deniedActions(undefined), []);
	assert.deepEqual(deniedActions("not an array"), []);
});

test("usage-limit text is recognised, and it is checked before the sign-in text", () => {
	for (const text of [
		"You’ve hit your usage limit. Visit https://chatgpt.com/settings/usage to purchase more credits or try again at 12:10 PM.",
		"Claude AI usage limit reached",
		"429 Too Many Requests",
		"rate limit exceeded",
		"You have exceeded your current quota",
	]) {
		assert.equal(looksUsageLimited(text), true, text);
		assert.equal(failureCode(text), "usage-limit", text);
	}
	assert.equal(looksUsageLimited("the build failed"), false);
	assert.equal(failureCode("Please run /login"), "not-authenticated");
	assert.equal(failureCode("segmentation fault"), "target-error");
});

// ---------------------------------------------------------- item 4: versions

test("compareVersions: numeric, and a pre-release is lower than the same release", () => {
	assert.equal(compareVersions("0.167.0", "0.154.0"), 1);
	assert.equal(compareVersions("0.9.0", "0.10.0"), -1, "numeric, not text");
	assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
	assert.equal(compareVersions("0.167.0-alpha.4.1", "0.167.0"), -1);
	assert.equal(compareVersions("0.167.0-alpha.4.1", "0.154.0"), 1, "a newer pre-release beats an older release");
	assert.equal(compareVersions("0.167.0-alpha.10", "0.167.0-alpha.9"), 1);
	assert.equal(compareVersions("0.167.0-alpha.4.1", "0.167.0-alpha.4"), 1);
	assert.equal(compareVersions("0.167.0-beta", "0.167.0-alpha"), 1);
	assert.equal(compareVersions("1.0.0+build5", "1.0.0"), 0, "build metadata is ignored");
	assert.equal(compareVersions(null, "0.1.0"), -1);
	assert.equal(compareVersions("0.1.0", "garbage"), 1);
	assert.equal(compareVersions(null, null), 0);
});

test("diagnose selects the candidate with the highest version, not the first on PATH", async () => {
	const box = tempDir();
	try {
		const old = stand(join(box.dir, "a"));
		const newer = stand(join(box.dir, "b"));
		const env = { PATH: [join(box.dir, "a"), join(box.dir, "b")].join(delimiter), HOME: box.dir, USERPROFILE: box.dir };
		const exec = versionProbe({ [old]: "0.154.0", [newer]: "0.167.0-alpha.4.1" });
		const found = await diagnose(codexAdapter, env, { exec, versionCache: new Map() });
		assert.equal(found.state, "ok");
		assert.equal(found.command, newer);
		assert.equal(found.version, "0.167.0-alpha.4.1");
	} finally {
		box.cleanup();
	}
});

test("diagnose keeps the earlier candidate when the versions are equal", async () => {
	const box = tempDir();
	try {
		const first = stand(join(box.dir, "a"));
		const second = stand(join(box.dir, "b"));
		const env = { PATH: [join(box.dir, "a"), join(box.dir, "b")].join(delimiter), HOME: box.dir, USERPROFILE: box.dir };
		const found = await diagnose(codexAdapter, env, { exec: versionProbe({ [first]: "1.2.3", [second]: "1.2.3" }), versionCache: new Map() });
		assert.equal(found.command, first);
	} finally {
		box.cleanup();
	}
});

test("diagnose skips a candidate that cannot answer --version", async () => {
	const box = tempDir();
	try {
		const good = stand(join(box.dir, "a"));
		const broken = stand(join(box.dir, "b"));
		const env = { PATH: [join(box.dir, "a"), join(box.dir, "b")].join(delimiter), HOME: box.dir, USERPROFILE: box.dir };
		const found = await diagnose(codexAdapter, env, { exec: versionProbe({ [good]: "0.154.0", [broken]: null }), versionCache: new Map() });
		assert.equal(found.command, good);
	} finally {
		box.cleanup();
	}
});

test("each candidate gets --version one time for each cache", async () => {
	const box = tempDir();
	try {
		const a = stand(join(box.dir, "a"));
		const b = stand(join(box.dir, "b"));
		const env = { PATH: [join(box.dir, "a"), join(box.dir, "b")].join(delimiter), HOME: box.dir, USERPROFILE: box.dir };
		const exec = versionProbe({ [a]: "0.1.0", [b]: "0.2.0" });
		const versionCache = new Map();
		await diagnose(codexAdapter, env, { exec, versionCache });
		await diagnose(codexAdapter, env, { exec, versionCache });
		assert.equal(exec.calls.length, 2, "two candidates, one probe each, two calls to diagnose");
	} finally {
		box.cleanup();
	}
});

test("one candidate needs no probe in diagnose", async () => {
	const box = tempDir();
	try {
		const only = stand(join(box.dir, "a"));
		const exec = versionProbe({ [only]: "0.1.0" });
		const found = await diagnose(codexAdapter, { PATH: join(box.dir, "a"), HOME: box.dir, USERPROFILE: box.dir }, { exec, versionCache: new Map() });
		assert.equal(found.command, only);
		assert.equal(exec.calls.length, 0);
	} finally {
		box.cleanup();
	}
});

test("the Codex Desktop binary under LOCALAPPDATA is a candidate and wins by version", { skip: !isWindows && "the folder exists on Windows only" }, async () => {
	const box = tempDir();
	try {
		const onPath = stand(join(box.dir, "bin"));
		const fromHome = stand(join(box.dir, ".local", "bin"));
		const desktop = stand(join(box.dir, "AppData", "Local", "OpenAI", "Codex", "bin", "9e1da79431da526b"));
		stand(join(box.dir, "AppData", "Local", "OpenAI", "Codex", "bin", "fc32aa0651e37f32"), "rg");
		const env = { PATH: join(box.dir, "bin"), HOME: box.dir, USERPROFILE: box.dir, LOCALAPPDATA: join(box.dir, "AppData", "Local") };
		const exec = versionProbe({ [onPath]: "0.154.0", [fromHome]: "0.154.0", [desktop]: "0.167.0-alpha.4.1" });
		const found = await diagnose(codexAdapter, env, { exec, versionCache: new Map() });
		assert.equal(found.command, desktop);
		assert.equal(found.version, "0.167.0-alpha.4.1");
	} finally {
		box.cleanup();
	}
});

test("the npm shim entry is a candidate too", { skip: !isWindows && "needs the .cmd shim of Windows" }, async () => {
	const box = tempDir();
	try {
		const entryDir = join(box.dir, "bin", "node_modules", "pkg", "bin");
		mkdirSync(entryDir, { recursive: true });
		writeFileSync(join(entryDir, "tool.js"), "// entry");
		writeFileSync(join(box.dir, "bin", "codex.cmd"), '"%_prog%"  "%dp0%\\node_modules\\pkg\\bin\\tool.js" %*');
		const higher = stand(join(box.dir, "other"));
		const env = { PATH: [join(box.dir, "bin"), join(box.dir, "other")].join(delimiter), HOME: box.dir, USERPROFILE: box.dir };
		const exec = versionProbe({ "tool.js": "0.154.0", [higher]: "0.160.0" });
		const found = await diagnose(codexAdapter, env, { exec, versionCache: new Map() });
		assert.equal(found.command, higher);
		const low = await diagnose(codexAdapter, env, { exec: versionProbe({ "tool.js": "0.170.0", [higher]: "0.160.0" }), versionCache: new Map() });
		assert.equal(low.via, "npm-shim");
	} finally {
		box.cleanup();
	}
});

// ----------------------------------------------------------- item 5: override

test("HARNESS_DISPATCH_<ID>_PATH wins over the search", async () => {
	const box = tempDir();
	try {
		const onPath = stand(join(box.dir, "a"));
		const chosen = stand(join(box.dir, "chosen"));
		const env = { PATH: join(box.dir, "a"), HOME: box.dir, USERPROFILE: box.dir, HARNESS_DISPATCH_CODEX_PATH: chosen };
		const exec = versionProbe({ [onPath]: "9.9.9", [chosen]: "0.0.1" });
		const found = await diagnose(codexAdapter, env, { exec, versionCache: new Map() });
		assert.equal(found.state, "ok");
		assert.equal(found.command, chosen);
		assert.equal(found.via, "env");
		assert.equal(exec.calls.length, 0, "an override is not compared by version");
	} finally {
		box.cleanup();
	}
});

test("a relative override is a usage error, and a missing file is not-installed", async () => {
	const box = tempDir();
	try {
		const env = { PATH: "", HOME: box.dir, USERPROFILE: box.dir };
		const relative = await diagnose(codexAdapter, { ...env, HARNESS_DISPATCH_CODEX_PATH: join("rel", "codex") }, {});
		assert.equal(relative.state, "usage");
		assert.match(relative.message, /HARNESS_DISPATCH_CODEX_PATH/);
		const missing = await diagnose(codexAdapter, { ...env, HARNESS_DISPATCH_CODEX_PATH: join(box.dir, "nowhere", exeName("codex")) }, {});
		assert.equal(missing.state, "not-installed");
		assert.match(missing.message, /HARNESS_DISPATCH_CODEX_PATH/);
	} finally {
		box.cleanup();
	}
});

test("dispatch: a relative override gives exit code 2 and starts nothing", async () => {
	const box = tempDir();
	try {
		const calls = [];
		const exec = async (...call) => (calls.push(call), makeResult());
		const env = { PATH: "", HOME: box.dir, USERPROFILE: box.dir, HARNESS_DISPATCH_CODEX_PATH: "codex" };
		const envelope = await dispatch(makeRequest({ to: "codex", cwd: box.dir }), { env, exec, tmpRoot: join(box.dir, "tmp") });
		assert.equal(envelope.error.code, "usage");
		assert.equal(envelope.exit_code, 2);
		assert.equal(calls.length, 0);
	} finally {
		box.cleanup();
	}
});

test("dispatch: the override path is the command that starts", async () => {
	const box = tempDir();
	try {
		const chosen = stand(join(box.dir, "chosen"));
		const calls = [];
		const exec = async (command, args) => (calls.push({ command, args }), makeResult({ stdout: fixture("codex", "synthetic-events.jsonl") }));
		const env = { PATH: "", HOME: box.dir, USERPROFILE: box.dir, HARNESS_DISPATCH_CODEX_PATH: chosen };
		const envelope = await dispatch(makeRequest({ to: "codex", cwd: box.dir }), { env, exec, tmpRoot: join(box.dir, "tmp") });
		assert.equal(envelope.ok, true);
		assert.equal(calls[0].command, chosen);
	} finally {
		box.cleanup();
	}
});

test("hd list shows the selected path and its version", async () => {
	const box = tempDir();
	try {
		const old = stand(join(box.dir, "a"));
		const newer = stand(join(box.dir, "b"));
		const env = { PATH: [join(box.dir, "a"), join(box.dir, "b")].join(delimiter), HOME: box.dir, USERPROFILE: box.dir };
		const exec = versionProbe({ [old]: "0.154.0", [newer]: "0.167.0-alpha.4.1" });
		const list = await listTargets({ env, exec, versionCache: new Map() });
		const entry = list.targets.find((target) => target.id === "codex");
		assert.equal(entry.executable, newer);
		assert.equal(entry.version, "0.167.0-alpha.4.1");
		assert.equal(entry.startable, true);
	} finally {
		box.cleanup();
	}
});

// ------------------------------------ item 2 and 3 through dispatch (envelope)

test("dispatch: an Antigravity run with a denied action is permission-denied", async () => {
	const box = tempDir();
	try {
		stand(box.dir, "agy");
		const exec = async () => makeResult({
			stdout: fixture("antigravity", "real-denied-action.stdout.json"),
			stderr: fixture("antigravity", "real-denied-action.stderr.txt"),
		});
		const env = { PATH: box.dir, HOME: box.dir, USERPROFILE: box.dir };
		const envelope = await dispatch(makeRequest({ to: "antigravity", cwd: box.dir }), { env, exec, tmpRoot: join(box.dir, "tmp") });
		assert.equal(envelope.ok, false);
		assert.equal(envelope.error.code, "permission-denied");
		assert.equal(envelope.exit_code, 1);
		assert.deepEqual(envelope.denied_actions, ["command: Bash"]);
		assert.match(envelope.error.message, /command: Bash/);
		assert.match(envelope.error.message, /allow rule/);
		assert.doesNotMatch(envelope.error.message, /dangerously/i, "the message never suggests a bypass flag");
		assert.equal(envelope.session_id, "381f1e41-f48e-4f5c-91df-f2df6f80ef9f");
	} finally {
		box.cleanup();
	}
});

test("dispatch: a Codex usage limit gives usage-limit with exit code 1", async () => {
	const box = tempDir();
	try {
		stand(box.dir, "codex");
		const exec = async () => makeResult({ code: 1, stdout: fixture("codex", "real-usage-limit.stdout.jsonl") });
		const env = { PATH: box.dir, HOME: box.dir, USERPROFILE: box.dir };
		const envelope = await dispatch(makeRequest({ to: "codex", cwd: box.dir }), { env, exec, tmpRoot: join(box.dir, "tmp") });
		assert.equal(envelope.error.code, "usage-limit");
		assert.equal(envelope.exit_code, 1);
		assert.match(envelope.error.message, /12:10 PM/);
		assert.deepEqual(envelope.denied_actions, []);
	} finally {
		box.cleanup();
	}
});

// ------------------------------------------------------------ item 8: SKILL.md

test("SKILL.md lists the new codes, the allow-rule note, the override and what read means", async () => {
	const { readFileSync } = await import("node:fs");
	const skill = readFileSync(join(import.meta.dirname, "..", "..", "skill", "harness-dispatch", "SKILL.md"), "utf8");
	for (const needle of ["`permission-denied`", "`usage-limit`", "`denied_actions`", "command(node)", "HARNESS_DISPATCH_<ID>_PATH", "Access `read` means"]) {
		assert.ok(skill.includes(needle), needle);
	}
	assert.match(skill, /Do not dispatch to that target again/);
	assert.doesNotMatch(skill, /Codex does not accept `--effort max`/);
});
