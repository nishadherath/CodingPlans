// Smoke tests for the legacy `coding-plans` command.
//
// Why these exist: defects D1 (a wrong import path) and D2 (a catch parameter
// that hid the logger) made the command fail on every start, and no test
// loaded `bin/` or `dist/`. One process start for each entry point finds both.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function start(script, args) {
	return spawnSync(process.execPath, [join(root, script), ...args], { encoding: "utf8", timeout: 30_000 });
}

for (const script of ["bin/coding-plans.mjs", "dist/cli.mjs"]) {
	test(`${script} help exits 0 and prints the usage`, () => {
		const result = start(script, ["help"]);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /Usage:/);
	});

	test(`${script} reports a thrown error through the logger (D2)`, () => {
		// `--plan` without a value throws inside plan resolution. The handler must
		// print the error and exit 1, not fail with "error is not a function".
		const result = start(script, ["doctor", "--plan"]);
		assert.equal(result.status, 1);
		assert.doesNotMatch(`${result.stdout}${result.stderr}`, /is not a function/);
		assert.match(`${result.stdout}${result.stderr}`, /Unknown plan/);
	});
}
