// Process tests for `execute`: output, stdin, timeout, and the tree kill.
//
// These tests start Node child processes (the current Node program). They make
// no model call.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { execute, run } from "../../src/util/exec.mjs";

const node = process.execPath;

function alive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/** Wait until a file exists, at most `limitMs`. */
async function waitForFile(file, limitMs = 10_000) {
	const end = Date.now() + limitMs;
	while (Date.now() < end) {
		if (existsSync(file)) return true;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	return false;
}

test("execute captures stdout, stderr and the exit code", async () => {
	const result = await execute(node, ["-e", "console.log('out'); console.error('err'); process.exit(3)"]);
	assert.equal(result.code, 3);
	assert.equal(result.stdout.trim(), "out");
	assert.equal(result.stderr.trim(), "err");
	assert.equal(result.timedOut, false);
	assert.equal(result.spawnError, null);
});

test("execute sends stdin and decodes UTF-8", async () => {
	const result = await execute(node, ["-e", "process.stdin.pipe(process.stdout)"], { input: "héllo ✓" });
	assert.equal(result.stdout, "héllo ✓");
});

test("execute does not crash when the child never reads stdin", async () => {
	const big = "x".repeat(5_000_000);
	const result = await execute(node, ["-e", "process.exit(0)"], { input: big });
	assert.equal(result.code, 0);
});

test("execute reports a missing program in spawnError and does not reject", async () => {
	const result = await execute(join(tmpdir(), "hd-no-such-program-xyz"), []);
	assert.ok(result.spawnError);
	assert.equal(result.spawnError.code, "ENOENT");
	assert.equal(result.code, null);
});

test("execute: a timeout stops the whole process tree", async () => {
	const dir = mkdtempSync(join(tmpdir(), "hd-exec-test-"));
	try {
		const pidFile = join(dir, "grandchild.pid");
		// The child starts a grandchild that lives until it is killed.
		// On Windows, Node puts a Node parent and its normal children in one
		// kill-on-close job, so a normal grandchild dies with its parent and proves
		// nothing. A detached grandchild leaves that job. Only `taskkill /T` finds
		// it, by the parent process id. On POSIX a normal grandchild is in the
		// process group of the child, and a signal to the group reaches it.
		const detached = process.platform === "win32";
		const grandchild = `require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(()=>{}, 1000);`;
		const child = `const {spawn}=require('child_process'); spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], {stdio:'ignore', detached:${detached}}); setInterval(()=>{}, 1000);`;
		const started = Date.now();
		const result = await execute(node, ["-e", child], { timeoutMs: 1500, killTree: true });
		assert.equal(result.timedOut, true);
		assert.ok(Date.now() - started < 20_000, "the call must not wait for the grandchild");
		assert.ok(await waitForFile(pidFile), "the grandchild must have started");
		const grandchildPid = Number(readFileSync(pidFile, "utf8"));
		// Give the kill a moment to take effect.
		for (let i = 0; i < 40 && alive(grandchildPid); i++) await new Promise((resolve) => setTimeout(resolve, 100));
		assert.equal(alive(grandchildPid), false, "the grandchild is still running: the tree was not killed");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("run keeps its legacy behaviour: rejects on non-zero, timeout and spawn failure", async () => {
	await assert.rejects(run(node, ["-e", "process.exit(2)"]), (error) => error.name === "ExecError" && error.code === 2 && /Exited 2/.test(error.message));
	const soft = await run(node, ["-e", "process.exit(2)"], { rejectOnNonZero: false });
	assert.equal(soft.code, 2);
	await assert.rejects(run(node, ["-e", "setInterval(()=>{},1000)"], { timeoutMs: 300 }), (error) => error.timedOut === true && /Timed out after 300ms/.test(error.message));
	await assert.rejects(run(join(tmpdir(), "hd-no-such-program-xyz")), (error) => /Failed to spawn/.test(error.message));
});

// H2: "C:\Windows" in a JS string is "C:Windows". Without SystemRoot and
// windir, the tree kill must still use an absolute taskkill path.
test("taskkillPath falls back to C:\Windows when SystemRoot and windir are missing", async () => {
	const { taskkillPath } = await import("../../src/util/exec.mjs");
	assert.equal(taskkillPath({}), join("C:\Windows", "System32", "taskkill.exe"));
	assert.equal(taskkillPath({ SystemRoot: "D:\Win" }), join("D:\Win", "System32", "taskkill.exe"));
});
