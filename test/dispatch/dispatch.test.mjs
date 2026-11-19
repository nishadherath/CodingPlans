// dispatch() tests with an injected spawn function. No real target runs.
//
// The fake `exec` records its calls. The fake environment holds a temporary
// PATH folder with a file named like the target executable, so that
// resolution finds a target without any real CLI.

import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { dispatch, doctor, listModels, listTargets } from "../../src/dispatch/index.mjs";
import { fixture, makeRequest, makeResult } from "./helpers.mjs";

const isWindows = process.platform === "win32";

/** A temp folder with a stand-in executable for each name. Returns { dir, env, cleanup }. */
function sandbox(names = ["claude", "codex", "agy"]) {
	const dir = mkdtempSync(join(tmpdir(), "hd-dispatch-test-"));
	for (const name of names) {
		const file = join(dir, isWindows ? `${name}.exe` : name);
		writeFileSync(file, "stand-in");
		if (!isWindows) chmodSync(file, 0o755);
	}
	const tmpRoot = join(dir, "tmp");
	return {
		dir,
		tmpRoot,
		env: { PATH: dir, HOME: dir, USERPROFILE: dir },
		cleanup: () => rmSync(dir, { recursive: true, force: true }),
	};
}

/** A fake exec that returns the given results in order and records each call. */
function fakeExec(...results) {
	const calls = [];
	const exec = async (command, args, options) => {
		calls.push({ command, args, options });
		const next = results.length > 1 ? results.shift() : results[0];
		return typeof next === "function" ? next(command, args, options) : next;
	};
	exec.calls = calls;
	return exec;
}

test("success: the envelope carries answer, usage and the log file", async () => {
	const box = sandbox();
	try {
		const exec = fakeExec(makeResult({ stdout: fixture("claude", "synthetic-success.json") }));
		const envelope = await dispatch(makeRequest({ cwd: box.dir, model: "sonnet" }), { env: box.env, exec, tmpRoot: box.tmpRoot });
		assert.equal(envelope.ok, true);
		assert.equal(envelope.harness, "claude");
		assert.equal(envelope.text, "OK");
		assert.equal(envelope.model, "claude-sonnet-5-5", "the reported model wins over the requested one");
		assert.equal(envelope.access, "read");
		assert.equal(envelope.exit_code, 0);
		assert.equal(envelope.error, null);
		assert.equal(envelope.usage.cache_read_tokens, 3000);
		assert.equal(envelope.cost_usd, 0.0123);
		assert.equal(statSync(envelope.log_file).isFile(), true);
		assert.match(readFileSync(envelope.log_file, "utf8"), /=== stdout ===[\s\S]*OK[\s\S]*=== stderr ===/);

		// The spawn arguments: an absolute command, an array, the depth variable, a tree kill.
		const call = exec.calls[0];
		assert.ok(call.command.startsWith(box.dir));
		assert.deepEqual(call.args.slice(0, 2), ["-p", "--output-format"]);
		assert.equal(call.options.input, "Say OK.");
		assert.equal(call.options.killTree, true);
		assert.equal(call.options.timeoutMs, 600_000);
		assert.equal(call.options.cwd, box.dir);
		assert.equal(call.options.env.HARNESS_DISPATCH_DEPTH, "1");
	} finally {
		box.cleanup();
	}
});

test("non-zero exit gives target-error and keeps the log", async () => {
	const box = sandbox();
	try {
		const exec = fakeExec(makeResult({ code: 3, stderr: "something broke" }));
		const envelope = await dispatch(makeRequest({ cwd: box.dir }), { env: box.env, exec, tmpRoot: box.tmpRoot });
		assert.equal(envelope.ok, false);
		assert.equal(envelope.error.code, "target-error");
		assert.equal(envelope.exit_code, 1);
		assert.match(readFileSync(envelope.log_file, "utf8"), /something broke/);
	} finally {
		box.cleanup();
	}
});

test("timeout gives the timeout error and exit code 1", async () => {
	const box = sandbox();
	try {
		const exec = fakeExec(makeResult({ code: null, signal: "SIGKILL", timedOut: true }));
		const envelope = await dispatch(makeRequest({ cwd: box.dir, timeoutSec: 7 }), { env: box.env, exec, tmpRoot: box.tmpRoot });
		assert.equal(envelope.error.code, "timeout");
		assert.equal(envelope.exit_code, 1);
		assert.match(envelope.error.message, /7 seconds/);
		assert.equal(exec.calls[0].options.timeoutMs, 7000);
	} finally {
		box.cleanup();
	}
});

test("output that is not JSON gives bad-output", async () => {
	const box = sandbox();
	try {
		const exec = fakeExec(makeResult({ stdout: "I am not JSON" }));
		const envelope = await dispatch(makeRequest({ cwd: box.dir }), { env: box.env, exec, tmpRoot: box.tmpRoot });
		assert.equal(envelope.error.code, "bad-output");
		assert.equal(envelope.exit_code, 1);
		assert.equal(envelope.text, "");
	} finally {
		box.cleanup();
	}
});

test("a parseOutput that throws gives bad-output", async () => {
	const box = sandbox();
	try {
		// A Symbol cannot become text. The Claude adapter throws when it joins stderr.
		const exec = fakeExec(makeResult({ stderr: Symbol("x") }));
		const envelope = await dispatch(makeRequest({ cwd: box.dir }), { env: box.env, exec, tmpRoot: box.tmpRoot });
		assert.equal(envelope.error.code, "bad-output");
	} finally {
		box.cleanup();
	}
});

test("dispatch never rejects, even when exec breaks its contract", async () => {
	const box = sandbox();
	try {
		const envelope = await dispatch(makeRequest({ cwd: box.dir }), { env: box.env, exec: async () => null, tmpRoot: box.tmpRoot });
		assert.equal(envelope.ok, false);
		assert.equal(envelope.exit_code, 1);
	} finally {
		box.cleanup();
	}
});

test("depth guard: refuses before any spawn, exit code 4", async () => {
	const box = sandbox();
	try {
		const exec = fakeExec(makeResult());
		const envelope = await dispatch(makeRequest({ cwd: box.dir }), { env: { ...box.env, HARNESS_DISPATCH_DEPTH: "1" }, exec, tmpRoot: box.tmpRoot });
		assert.equal(envelope.error.code, "depth-exceeded");
		assert.equal(envelope.exit_code, 4);
		assert.equal(exec.calls.length, 0, "the target must not start");

		// A higher maximum allows one more level, and the child gets depth 2.
		const ok = fakeExec(makeResult({ stdout: fixture("claude", "synthetic-success.json") }));
		const allowed = await dispatch(makeRequest({ cwd: box.dir }), { env: { ...box.env, HARNESS_DISPATCH_DEPTH: "1", HARNESS_DISPATCH_MAX_DEPTH: "2" }, exec: ok, tmpRoot: box.tmpRoot });
		assert.equal(allowed.ok, true);
		assert.equal(ok.calls[0].options.env.HARNESS_DISPATCH_DEPTH, "2");
	} finally {
		box.cleanup();
	}
});

test("target not installed: exit code 3, no spawn", async () => {
	const box = sandbox([]);
	try {
		const exec = fakeExec(makeResult());
		const envelope = await dispatch(makeRequest({ cwd: box.dir }), { env: box.env, exec, tmpRoot: box.tmpRoot });
		assert.equal(envelope.error.code, "not-installed");
		assert.equal(envelope.exit_code, 3);
		assert.equal(exec.calls.length, 0);
		assert.equal(envelope.log_file, null);
	} finally {
		box.cleanup();
	}
});

test("only a shim on PATH: not-startable, exit code 3", { skip: !isWindows && "shim rule is a Windows rule" }, async () => {
	const box = sandbox([]);
	try {
		writeFileSync(join(box.dir, "claude.cmd"), "@echo shim");
		const exec = fakeExec(makeResult());
		const envelope = await dispatch(makeRequest({ cwd: box.dir }), { env: box.env, exec, tmpRoot: box.tmpRoot });
		assert.equal(envelope.error.code, "not-startable");
		assert.equal(envelope.exit_code, 3);
	} finally {
		box.cleanup();
	}
});

test("a spawn error gives not-startable", async () => {
	const box = sandbox();
	try {
		const exec = fakeExec(makeResult({ code: null, spawnError: Object.assign(new Error("x"), { code: "ENOENT" }) }));
		const envelope = await dispatch(makeRequest({ cwd: box.dir }), { env: box.env, exec, tmpRoot: box.tmpRoot });
		assert.equal(envelope.error.code, "not-startable");
		assert.match(envelope.error.message, /ENOENT/);
	} finally {
		box.cleanup();
	}
});

// H2: a quote-heavy agy prompt under 24,000 characters can still pass the
// 32,767-character Windows command line after escaping. The OS refuses the
// start. That is a usage problem of the caller, not a missing target.
test("a command line that is too long for the OS gives prompt-too-long, not not-startable", async () => {
	const box = sandbox();
	try {
		for (const code of ["ENAMETOOLONG", "E2BIG"]) {
			const exec = fakeExec(makeResult({ code: null, spawnError: Object.assign(new Error("x"), { code }) }));
			const envelope = await dispatch(makeRequest({ to: "antigravity", cwd: box.dir }), { env: box.env, exec, tmpRoot: box.tmpRoot });
			assert.equal(envelope.error.code, "prompt-too-long", code);
			assert.equal(envelope.exit_code, 2, code);
		}
	} finally {
		box.cleanup();
	}
});

test("prompt-too-long for antigravity: exit code 2, no spawn", async () => {
	const box = sandbox();
	try {
		const exec = fakeExec(makeResult());
		const envelope = await dispatch(makeRequest({ to: "antigravity", cwd: box.dir, prompt: "x".repeat(24001) }), { env: box.env, exec, tmpRoot: box.tmpRoot });
		assert.equal(envelope.error.code, "prompt-too-long");
		assert.equal(envelope.exit_code, 2);
		assert.equal(exec.calls.length, 0);
	} finally {
		box.cleanup();
	}
});

test("capability checks give usage errors", async () => {
	const box = sandbox();
	try {
		const exec = fakeExec(makeResult());
		const deps = { env: box.env, exec, tmpRoot: box.tmpRoot };
		const effort = await dispatch(makeRequest({ to: "codex", cwd: box.dir, effort: "max" }), deps);
		assert.equal(effort.error.code, "usage");
		const missing = await dispatch(makeRequest({ cwd: join(box.dir, "no-such-folder") }), deps);
		assert.equal(missing.error.code, "usage");
		assert.equal(exec.calls.length, 0);
	} finally {
		box.cleanup();
	}
});

test("text longer than max-chars is cut and flagged", async () => {
	const box = sandbox();
	try {
		const long = JSON.stringify({ type: "result", is_error: false, result: "a".repeat(100), session_id: "s" });
		const exec = fakeExec(makeResult({ stdout: long }));
		const envelope = await dispatch(makeRequest({ cwd: box.dir, maxChars: 10 }), { env: box.env, exec, tmpRoot: box.tmpRoot });
		assert.equal(envelope.text.length, 10);
		assert.equal(envelope.truncated, true);
		assert.match(readFileSync(envelope.log_file, "utf8"), /a{100}/, "the full output stays in the log");
	} finally {
		box.cleanup();
	}
});

test("codex: the -o temp file is read, then deleted", async () => {
	const box = sandbox();
	try {
		const exec = fakeExec((command, args) => {
			const out = args[args.indexOf("-o") + 1];
			writeFileSync(out, "Answer from the file\n");
			return makeResult({ stdout: fixture("codex", "synthetic-events.jsonl") });
		});
		const envelope = await dispatch(makeRequest({ to: "codex", cwd: box.dir }), { env: box.env, exec, tmpRoot: box.tmpRoot });
		assert.equal(envelope.ok, true);
		assert.equal(envelope.text, "Answer from the file");
		assert.equal(envelope.session_id, "0199a213-81c0-7800-8aa1-bbab2a035a53");
		const out = exec.calls[0].args[exec.calls[0].args.indexOf("-o") + 1];
		assert.equal(existsSync(out), false, "temp file deleted");
		const leftovers = readdirSync(join(box.tmpRoot, "harness-dispatch")).filter((name) => name.startsWith("run-"));
		assert.deepEqual(leftovers, [], "temp folder deleted");
		assert.equal(existsSync(envelope.log_file), true, "log kept");
	} finally {
		box.cleanup();
	}
});

test("the environment is not printed: the envelope has no env data", async () => {
	const box = sandbox();
	try {
		const exec = fakeExec(makeResult({ stdout: fixture("claude", "synthetic-success.json") }));
		const envelope = await dispatch(makeRequest({ cwd: box.dir }), { env: { ...box.env, SECRET_TOKEN: "sk-should-not-appear-123456789" }, exec, tmpRoot: box.tmpRoot });
		assert.doesNotMatch(JSON.stringify(envelope), /sk-should-not-appear/);
	} finally {
		box.cleanup();
	}
});

test("list and doctor use only version and auth probes", async () => {
	const box = sandbox();
	try {
		const exec = fakeExec((command, args) => {
			if (args[0] === "--version") return makeResult({ stdout: "9.8.7\n" });
			if (args.join(" ") === "auth status --json") return makeResult({ stdout: '{"loggedIn":true}' });
			if (args.join(" ") === "login status") return makeResult({ code: 1, stdout: "Not logged in" });
			return makeResult({ code: 9 });
		});
		const list = await listTargets({ env: box.env, exec });
		assert.deepEqual(list.targets.map((t) => [t.id, t.installed, t.version]), [["claude", true, "9.8.7"], ["codex", true, "9.8.7"], ["antigravity", true, "9.8.7"]]);

		const report = await doctor(undefined, { env: box.env, exec });
		const byId = Object.fromEntries(report.targets.map((t) => [t.id, t.authenticated]));
		assert.deepEqual(byId, { claude: true, codex: false, antigravity: null });
		assert.equal(report.ok, false);
		assert.equal(report.exit_code, 1);

		for (const call of exec.calls) {
			assert.ok(!call.args.includes("-p") && !call.args.includes("exec"), `a model-call argument in: ${call.args.join(" ")}`);
		}
	} finally {
		box.cleanup();
	}
});

test("doctor reports a missing target with exit code 3", async () => {
	const box = sandbox(["claude"]);
	try {
		const exec = fakeExec(makeResult({ stdout: "1.0.0" }));
		const report = await doctor("codex", { env: box.env, exec });
		assert.equal(report.targets[0].installed, false);
		assert.equal(report.exit_code, 3);
	} finally {
		box.cleanup();
	}
});

test("models: antigravity lists, claude says unsupported", async () => {
	const box = sandbox();
	try {
		const exec = fakeExec(makeResult({ stdout: fixture("antigravity", "models.txt") }));
		const agy = await listModels("antigravity", { env: box.env, exec });
		assert.equal(agy.models.length, 2);
		assert.deepEqual(exec.calls[0].args, ["models"]);
		const claude = await listModels("claude", { env: box.env, exec });
		assert.equal(claude.supported, false);
		assert.equal(claude.ok, true);
	} finally {
		box.cleanup();
	}
});

test("a PATH with several folders still resolves in order", async () => {
	const first = sandbox([]);
	const second = sandbox(["claude"]);
	try {
		const exec = fakeExec(makeResult({ stdout: fixture("claude", "synthetic-success.json") }));
		const env = { PATH: [first.dir, second.dir].join(delimiter), HOME: first.dir, USERPROFILE: first.dir };
		const envelope = await dispatch(makeRequest({ cwd: first.dir }), { env, exec, tmpRoot: first.tmpRoot });
		assert.equal(envelope.ok, true);
		assert.ok(exec.calls[0].command.startsWith(second.dir));
	} finally {
		first.cleanup();
		second.cleanup();
	}
});
