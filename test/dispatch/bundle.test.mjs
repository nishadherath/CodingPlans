// Bundle tests: the committed bundles are current, and the skill script works.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { repoRoot } from "./helpers.mjs";

const bundle = join(repoRoot, "skill", "harness-dispatch", "scripts", "hd.mjs");

test("the committed bundles are current (build-dist --check)", () => {
	const result = spawnSync(process.execPath, [join(repoRoot, "scripts", "build-dist.mjs"), "--check"], { encoding: "utf8" });
	assert.equal(result.status, 0, `Run \`npm run build:dist\`. ${result.stderr}`);
});

test("bundle smoke test: `hd list` exits 0 and prints one valid JSON object", () => {
	const result = spawnSync(process.execPath, [bundle, "list"], { encoding: "utf8", timeout: 120_000, input: "" });
	assert.equal(result.status, 0, result.stderr);
	const report = JSON.parse(result.stdout);
	assert.equal(report.schema, "harness-dispatch/1");
	assert.equal(report.ok, true);
	assert.deepEqual(report.targets.map((target) => target.id), ["claude", "codex", "antigravity"]);
	for (const target of report.targets) {
		assert.equal(typeof target.installed, "boolean");
		assert.ok("executable" in target && "version" in target);
	}
});

test("bundle and bin give the same answer to the same bad request", () => {
	const args = ["run", "--to", "claude", "--prompt", "x", "--effort", "wild"];
	const viaBundle = spawnSync(process.execPath, [bundle, ...args], { encoding: "utf8", input: "" });
	const viaBin = spawnSync(process.execPath, [join(repoRoot, "bin", "harness-dispatch.mjs"), ...args], { encoding: "utf8", input: "" });
	assert.equal(viaBundle.status, viaBin.status);
	assert.equal(viaBundle.stdout, viaBin.stdout);
});

test("importing the bundle does not run it", async () => {
	const module = await import(pathToFileURL(bundle).href);
	assert.equal(typeof module.main, "function");
	assert.equal(typeof module.parseArgs, "function");
});

test("the bundle has no import of a project file and no dependency", () => {
	const source = spawnSync(process.execPath, ["-e", `const s=require('fs').readFileSync(${JSON.stringify(bundle)},'utf8'); const bad=[...s.matchAll(/^import .* from "([^"]+)"/gm)].map(m=>m[1]).filter(x=>!x.startsWith('node:')); console.log(JSON.stringify(bad));`], { encoding: "utf8" });
	assert.deepEqual(JSON.parse(source.stdout), []);
});
