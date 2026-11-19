// Shared helpers for the dispatch tests. This file is not a test.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const repoRoot = join(here, "..", "..");

/** Text of a fixture file: fixture("claude", "synthetic-success.json"). */
export function fixture(harness, name) {
	return readFileSync(join(repoRoot, "test", "fixtures", harness, name), "utf8");
}

/** A request with the defaults that validateRequest gives. */
export function makeRequest(overrides = {}) {
	return {
		to: "claude",
		prompt: "Say OK.",
		model: null,
		effort: null,
		access: "read",
		cwd: repoRoot,
		resume: null,
		schema: null,
		timeoutSec: 600,
		maxChars: 20000,
		out: null,
		...overrides,
	};
}

/** An adapter context with a fixed temp path, so that the tests can compare. */
export function makeCtx(overrides = {}) {
	return { env: {}, tempFile: (name) => `TMP/${name}`, ...overrides };
}

/** The result shape of `execute`. */
export function makeResult(overrides = {}) {
	return { code: 0, signal: null, stdout: "", stderr: "", timedOut: false, spawnError: null, durationMs: 5, ...overrides };
}
