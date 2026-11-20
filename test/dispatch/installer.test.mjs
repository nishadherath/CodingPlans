// Installer tests. Every test passes --home with a temporary folder. No test
// writes to the real home folder.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ALIASES, MARKER, TARGETS, parseArgs, plan } from "../../scripts/install-skill.mjs";
import { repoRoot } from "./helpers.mjs";

const script = join(repoRoot, "scripts", "install-skill.mjs");

function tempHome() {
	return mkdtempSync(join(tmpdir(), "hd-install-test-"));
}

function install(args) {
	return spawnSync(process.execPath, [script, ...args], { encoding: "utf8", timeout: 60_000 });
}

/** A recursive listing of a folder, to prove that a dry run changed nothing. */
function listing(dir) {
	return readdirSync(dir, { recursive: true }).sort();
}

test("the folder table matches the contract", () => {
	const byId = Object.fromEntries(TARGETS.map((t) => [t.id, t.skills?.join("/")]));
	assert.deepEqual(byId, {
		claude: ".claude/skills",
		codex: ".codex/skills",
		antigravity: ".gemini/config/skills",
		agents: ".agents/skills",
	});
	assert.deepEqual(ALIASES, { zcode: "agents", opencode: "agents", cline: "agents", deepseek: "agents" });
});

test("the default plan has at most four steps and no old own folder", () => {
	const home = tempHome();
	try {
		for (const dir of [".claude", ".codex", ".gemini", ".agents", ".zcode", ".config/opencode"]) mkdirSync(join(home, dir), { recursive: true });
		const steps = plan({ home, targets: [], uninstall: false });
		assert.deepEqual(steps.map((s) => s.id), ["claude", "codex", "antigravity", "agents"]);
		assert.ok(steps.every((s) => s.action === "copy"));
		assert.ok(steps.every((s) => !/\.zcode|opencode/.test(s.dest)), "no step for the own folder of ZCode or OpenCode");

		const result = install(["--home", home]);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout.split("\n").filter((l) => /would copy/.test(l)).length, 4);
		assert.doesNotMatch(result.stdout, /\.zcode|\.config[/\\]opencode/);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("each harness id of the shared folder resolves to the target agents", () => {
	const home = tempHome();
	try {
		for (const id of ["zcode", "opencode", "cline", "deepseek", "agents"]) {
			const steps = plan({ home, targets: [id], uninstall: false });
			assert.equal(steps.length, 1, id);
			assert.equal(steps[0].id, "agents", id);
			assert.equal(steps[0].dest, join(home, ".agents", "skills", "harness-dispatch"), id);
			assert.equal(steps[0].action, "copy", id);
		}
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("ids that share a folder give one step, and the plan names the harnesses", () => {
	const home = tempHome();
	try {
		const result = install(["--home", home, "--target", "cline", "--target", "zcode", "--target", "deepseek"]);
		assert.equal(result.status, 0, result.stderr);
		const lines = result.stdout.split("\n").filter((l) => /would copy/.test(l));
		assert.equal(lines.length, 1);
		assert.match(lines[0], /\.agents/);
		assert.match(lines[0], /ZCode, OpenCode, Cline, DeepSeek Harness/);
		assert.doesNotMatch(result.stdout, /not supported|unsupported/i);

		const mixed = plan({ home, targets: ["cline", "claude", "agents", "opencode"], uninstall: false });
		assert.deepEqual(mixed.map((s) => s.id), ["claude", "agents"], "one step for each folder, in table order");
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("dry run prints the plan and changes nothing", () => {
	const home = tempHome();
	try {
		mkdirSync(join(home, ".claude"));
		const before = listing(home);
		const result = install(["--home", home, "--target", "claude", "--target", "codex"]);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /Dry run/);
		assert.match(result.stdout, /would copy\s+claude/);
		assert.match(result.stdout, /would copy\s+codex/);
		assert.match(result.stdout, /No file was changed/);
		assert.deepEqual(listing(home), before);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("--apply copies the skill and writes the marker", () => {
	const home = tempHome();
	try {
		const result = install(["--home", home, "--target", "claude", "--apply"]);
		assert.equal(result.status, 0, result.stderr);
		const dest = join(home, ".claude", "skills", "harness-dispatch");
		assert.equal(existsSync(join(dest, "SKILL.md")), true);
		assert.equal(readFileSync(join(dest, "scripts", "hd.mjs"), "utf8"), readFileSync(join(repoRoot, "skill", "harness-dispatch", "scripts", "hd.mjs"), "utf8"));
		assert.equal(JSON.parse(readFileSync(join(dest, MARKER), "utf8")).skill, "harness-dispatch");

		// A second run replaces the earlier install.
		const again = install(["--home", home, "--target", "claude", "--apply"]);
		assert.equal(again.status, 0, again.stderr);
		assert.match(again.stdout, /replaced/);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("a folder that the installer did not make is never replaced or removed", () => {
	const home = tempHome();
	try {
		const dest = join(home, ".codex", "skills", "harness-dispatch");
		mkdirSync(dest, { recursive: true });
		writeFileSync(join(dest, "mine.txt"), "operator file");

		const copy = install(["--home", home, "--target", "codex", "--apply"]);
		assert.equal(copy.status, 1, "a refused step is exit code 1");
		assert.match(copy.stdout, /did not make it/);
		assert.equal(readFileSync(join(dest, "mine.txt"), "utf8"), "operator file");
		assert.equal(existsSync(join(dest, "SKILL.md")), false);

		const remove = install(["--home", home, "--target", "codex", "--uninstall", "--apply"]);
		assert.equal(remove.status, 1);
		assert.equal(existsSync(join(dest, "mine.txt")), true);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("--uninstall removes an install that the installer made, also through a harness id", () => {
	const home = tempHome();
	try {
		install(["--home", home, "--target", "cline", "--apply"]);
		const dest = join(home, ".agents", "skills", "harness-dispatch");
		assert.equal(existsSync(dest), true);

		const dry = install(["--home", home, "--target", "zcode", "--uninstall"]);
		assert.match(dry.stdout, /would remove/);
		assert.equal(existsSync(dest), true, "a dry run removes nothing");

		const real = install(["--home", home, "--target", "opencode", "--uninstall", "--apply"]);
		assert.equal(real.status, 0, real.stderr);
		assert.equal(existsSync(dest), false);
		assert.equal(existsSync(join(home, ".agents", "skills")), true, "the parent folder stays");
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("without --target, only harnesses whose home folder exists are used", () => {
	const home = tempHome();
	try {
		mkdirSync(join(home, ".claude"));
		mkdirSync(join(home, ".gemini"));
		const steps = plan({ home, targets: [], uninstall: false });
		const byId = Object.fromEntries(steps.map((s) => [s.id, s.action]));
		assert.equal(byId.claude, "copy");
		assert.equal(byId.antigravity, "copy");
		assert.equal(byId.codex, "skip");
		assert.equal(byId.agents, "skip");
		assert.deepEqual(Object.keys(byId), ["claude", "codex", "antigravity", "agents"]);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("cline is supported: it installs the shared folder", () => {
	const home = tempHome();
	try {
		const result = install(["--home", home, "--target", "cline", "--apply"]);
		assert.equal(result.status, 0, result.stderr);
		assert.doesNotMatch(result.stdout, /not supported|unsupported/i);
		assert.equal(existsSync(join(home, ".agents", "skills", "harness-dispatch", "SKILL.md")), true);
		assert.deepEqual(listing(home).filter((p) => /zcode|opencode|\.cline/.test(p)), [], "no own folder of another harness");
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("bad arguments give exit code 2", () => {
	assert.equal(install(["--target", "nope"]).status, 2);
	assert.match(install(["--target", "nope"]).stderr, /Unknown target "nope".*deepseek/);
	assert.equal(install(["--wat"]).status, 2);
	assert.equal(install(["--home"]).status, 2);
	assert.ok(parseArgs(["--target", "claude", "--target", "codex"]).options.targets.length === 2, "--target can be repeated");
});
