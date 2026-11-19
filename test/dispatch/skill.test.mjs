// SKILL.md tests: the calling agent copies commands from this file, so each
// command must run as written once the folder placeholder is replaced.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TARGETS } from "../../scripts/install-skill.mjs";
import { repoRoot } from "./helpers.mjs";

const skill = readFileSync(join(repoRoot, "skill", "harness-dispatch", "SKILL.md"), "utf8");
const SCRIPT = 'node "<folder of this file>/scripts/hd.mjs"';

test("SKILL.md has at most 120 lines (contract section 9)", () => {
	assert.ok(skill.trimEnd().split(/\r?\n/).length <= 120);
});

// H2: the examples said `node hd.mjs ...`, which fails outside the scripts folder.
test("each node command in SKILL.md names the full script path", () => {
	const commands = skill.split(/\r?\n/).filter((line) => /^\s*node\s/.test(line));
	assert.ok(commands.length >= 5, "the examples are present");
	for (const line of commands) assert.ok(line.trim().startsWith(SCRIPT), line);
});

// H2: a harness that does not tell the agent the skill folder still needs a way to find hd.mjs.
test("SKILL.md names each install folder of the installer as a fallback", () => {
	for (const target of TARGETS.filter((t) => !t.unsupported)) {
		assert.ok(skill.includes(`~/${target.skills.join("/")}`), target.id);
	}
});
