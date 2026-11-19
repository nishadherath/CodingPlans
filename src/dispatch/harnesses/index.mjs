// The registry of dispatch targets.
//
// A new target is one new adapter file in this folder and one line here.

import antigravity from "./antigravity.mjs";
import claude from "./claude.mjs";
import codex from "./codex.mjs";

export const HARNESSES = [claude, codex, antigravity];

export const TARGET_IDS = HARNESSES.map((harness) => harness.id);

/** The adapter with this id, or undefined. */
export function getHarness(id) {
	return HARNESSES.find((harness) => harness.id === id);
}
