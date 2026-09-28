// Unit tests for the pure detection logic.
//
// These deliberately avoid spawning real CLIs: the behaviour under test is
// "does this file count as spawnable", which is decided entirely by the
// suffix table and PATH walk. Live CLI behaviour is covered by
// test/live.test.mjs (opt-in, costs money).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { findAllOnPath, findSpawnableOnPath } from "../src/detect/cli.mjs";
import { ensureSpawnable, pickTargetDir } from "../src/fix/executable.mjs";
import { PLANS, getPlan, listPlans } from "../src/plans.mjs";
import { globalRoots, isPeerPresent } from "../src/fix/peers.mjs";

const isWindows = process.platform === "win32";

function tmp() {
	return mkdtempSync(join(tmpdir(), "coding-plans-test-"));
}

test("plans declare the Cline provider contract", () => {
	assert.deepEqual(listPlans().map((p) => p.id), ["claude-code", "openai-codex-cli"]);
	for (const plan of listPlans()) {
		assert.equal(plan.cli, plan.cli.trim().toLowerCase());
		assert.ok(plan.peerPackage, `${plan.id} must declare its optional peer package`);
		assert.ok(plan.defaultModelId, `${plan.id} must declare a default model`);
		assert.ok(plan.docsUrl.startsWith("https://"));
		// Cline selects the handler by this exact id.
		assert.ok(["claude-code", "openai-codex-cli"].includes(plan.id));
	}
});

test("codex default model is not the one ChatGPT plans reject", () => {
	// Cline's built-in default is gpt-5.6-sol, which real ChatGPT accounts
	// reject. The plan must not inherit that.
	assert.notEqual(getPlan("openai-codex-cli").defaultModelId, "gpt-5.6-sol");
	assert.ok(getPlan("openai-codex-cli").modelCandidates.includes("gpt-5.5"));
});

test("only real executables count as spawnable", () => {
	const dir = tmp();
	try {
		if (isWindows) {
			// The exact failure mode: an npm-style shim pair.
			writeFileSync(join(dir, "codex"), "shim");
			writeFileSync(join(dir, "codex.cmd"), "@echo shim");
			const env = { PATH: dir };
			const all = findAllOnPath("codex", env);
			assert.ok(all.length >= 2, "both shims should be seen as present");
			assert.ok(all.every((e) => !e.spawnable), "no shim may count as spawnable");
			assert.equal(findSpawnableOnPath("codex", env), undefined);
		} else {
			writeFileSync(join(dir, "tool"), "#!/bin/sh\n", { mode: 0o755 });
			assert.ok(findSpawnableOnPath("tool", { PATH: dir }));
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("a real executable on PATH is spawnable", () => {
	const dir = tmp();
	try {
		const name = isWindows ? "codex.exe" : "codex";
		const file = join(dir, name);
		writeFileSync(file, "binary", isWindows ? undefined : { mode: 0o755 });
		const env = { PATH: dir };
		assert.equal(findSpawnableOnPath("codex", env), file);
		assert.ok(findAllOnPath("codex", env).some((e) => e.spawnable));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("PATH order is respected", () => {
	const a = tmp();
	const b = tmp();
	try {
		const name = isWindows ? "tool.exe" : "tool";
		writeFileSync(join(a, name), "a", isWindows ? undefined : { mode: 0o755 });
		writeFileSync(join(b, name), "b", isWindows ? undefined : { mode: 0o755 });
		assert.equal(findSpawnableOnPath("tool", { PATH: [a, b].join(delimiter) }), join(a, name));
		assert.equal(findSpawnableOnPath("tool", { PATH: [b, a].join(delimiter) }), join(b, name));
	} finally {
		rmSync(a, { recursive: true, force: true });
		rmSync(b, { recursive: true, force: true });
	}
});

test("ensureSpawnable is a no-op when already spawnable", async () => {
	const dir = tmp();
	try {
		const name = isWindows ? "codex.exe" : "codex";
		const file = join(dir, name);
		writeFileSync(file, "x", isWindows ? undefined : { mode: 0o755 });
		const result = await ensureSpawnable("codex", { env: { PATH: dir }, source: file });
		assert.equal(result.changed, false);
		assert.equal(result.method, "already-spawnable");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("ensureSpawnable refuses a source that cannot run", async () => {
	const dir = tmp();
	try {
		const bogus = join(dir, "not-a-binary");
		writeFileSync(bogus, "definitely not an executable");
		const result = await ensureSpawnable("codex", { env: { PATH: dir }, source: bogus });
		// A corrupt binary must never be advertised as a working install.
		assert.equal(result.method, "unavailable");
		assert.equal(result.changed, false);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("ensureSpawnable reports unavailable when there is no source", async () => {
	const dir = tmp();
	try {
		const result = await ensureSpawnable("codex", { env: { PATH: dir } });
		assert.equal(result.method, "unavailable");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("peer detection looks for a package.json, not just a directory", () => {
	const root = tmp();
	try {
		mkdirSync(join(root, "ai-sdk-provider-codex-cli"), { recursive: true });
		assert.equal(isPeerPresent("ai-sdk-provider-codex-cli", [root]), false);
		writeFileSync(join(root, "ai-sdk-provider-codex-cli", "package.json"), "{}");
		assert.equal(isPeerPresent("ai-sdk-provider-codex-cli", [root]), true);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("globalRoots are deduplicated and non-empty given a cline path", () => {
	const roots = globalRoots("/usr/local/lib/node_modules/cline/bin/cline");
	assert.ok(roots.length > 0);
	assert.equal(new Set(roots).size, roots.length);
	assert.ok(roots.includes("/usr/local/lib/node_modules"));
});
