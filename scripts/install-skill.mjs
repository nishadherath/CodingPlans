#!/usr/bin/env node
// Install the harness-dispatch skill into the skill folders of coding agent
// harnesses.
//
// Safe by default:
//   - The default is a DRY RUN. A change needs --apply.
//   - A folder that this installer did not make is never replaced or removed.
//     The marker file `.harness-dispatch-install.json` proves who made it.
//   - Without --target, only harnesses whose home folder exists are used.
//   - --home <dir> replaces the home folder. The tests use it.
//
// Rule for agent sessions: do not run this script with --apply on the real
// home folder. The operator does that after acceptance.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_NAME = "harness-dispatch";
export const MARKER = ".harness-dispatch-install.json";

/**
 * Skill folders. Each folder gets one install step.
 * `root` is the folder that shows the harness is present.
 * `serves` names the harnesses that read the folder. The plan prints it, so
 * the operator sees why the folder exists.
 *
 * Proof (stage H5, 2026-11-21): ZCode, OpenCode, Cline and DeepSeek Harness
 * each read the shared folder `~/.agents/skills`. So they have no folder of
 * their own here. A second copy in the own folder of ZCode or OpenCode only
 * made the harness find the skill two times. Antigravity does not read the
 * shared folder.
 */
export const TARGETS = [
	{ id: "claude", skills: [".claude", "skills"], root: [".claude"], serves: ["Claude Code"] },
	{ id: "codex", skills: [".codex", "skills"], root: [".codex"], serves: ["Codex"] },
	{ id: "antigravity", skills: [".gemini", "config", "skills"], root: [".gemini"], serves: ["Antigravity"] },
	{ id: "agents", skills: [".agents", "skills"], root: [".agents"], serves: ["ZCode", "OpenCode", "Cline", "DeepSeek Harness"] },
];

/**
 * Harness ids that resolve to the folder of another target. The operator can
 * name the harness, and the installer picks the folder that the harness reads.
 */
export const ALIASES = { zcode: "agents", opencode: "agents", cline: "agents", deepseek: "agents" };

/** Every id that `--target` accepts. */
const KNOWN_IDS = [...TARGETS.map((t) => t.id), ...Object.keys(ALIASES)];

const HELP = `Install the harness-dispatch skill.

Usage:
  node scripts/install-skill.mjs [--target <id>]... [--home <dir>] [--apply] [--uninstall]

  --target <id>   One of: ${KNOWN_IDS.join(", ")}. Can be repeated.
                  The ids zcode, opencode, cline and deepseek select the shared
                  folder of the target "agents". These harnesses read it.
                  Default: each folder whose harness home folder exists.
  --home <dir>    Use this home folder. Default: your home folder.
  --apply         Make the changes. Without it, the script only prints them.
  --uninstall     Remove folders that this installer made.
`;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Parse argv. Returns { options } or { error }. */
export function parseArgs(argv) {
	const options = { targets: [], home: undefined, apply: false, uninstall: false, help: false };
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i];
		if (token === "--apply") options.apply = true;
		else if (token === "--uninstall") options.uninstall = true;
		else if (token === "--help" || token === "-h") options.help = true;
		else if (token === "--target" || token === "--home") {
			const value = argv[++i];
			if (value === undefined) return { error: `The flag ${token} needs a value.` };
			if (token === "--home") options.home = value;
			else if (KNOWN_IDS.includes(value)) options.targets.push(value);
			else return { error: `Unknown target "${value}". Known targets: ${KNOWN_IDS.join(", ")}.` };
		} else return { error: `Unknown argument "${token}".` };
	}
	return { options };
}

const exists = (path) => {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
};

/**
 * Decide what to do for each target. This function reads the file system and
 * changes nothing.
 *
 * One folder gets one step. Two ids that resolve to the same folder (for
 * example `zcode` and `cline`) give one step.
 *
 * @returns {Array<{ id: string, action: string, dest: string, serves: string[], note: string }>}
 *   action: copy | replace | remove | skip | none
 */
export function plan({ home, targets, uninstall }) {
	const explicit = targets.length > 0;
	const wanted = new Set(targets.map((id) => ALIASES[id] ?? id));
	const selected = explicit ? TARGETS.filter((t) => wanted.has(t.id)) : TARGETS;
	return selected.map((target) => {
		const dest = join(home, ...target.skills, SKILL_NAME);
		const step = (action, note) => ({ id: target.id, action, dest, serves: target.serves, note });
		if (!explicit && !exists(join(home, ...target.root))) return step("skip", "harness folder not found");
		const present = existsSync(dest);
		const ours = present && existsSync(join(dest, MARKER));
		if (uninstall) {
			if (!present) return step("none", "nothing to remove");
			if (!ours) return step("skip", "exists, and this installer did not make it: left alone");
			return step("remove", "remove");
		}
		if (!present) return step("copy", "copy");
		if (!ours) return step("skip", "exists, and this installer did not make it: left alone");
		return step("replace", "replace the earlier install");
	});
}

/** Do the planned actions. Returns the list of results, with `error` on failure. */
export function apply(steps, source) {
	return steps.map((step) => {
		try {
			if (step.action === "remove") rmSync(step.dest, { recursive: true, force: true });
			else if (step.action === "copy" || step.action === "replace") {
				if (step.action === "replace") rmSync(step.dest, { recursive: true, force: true });
				mkdirSync(dirname(step.dest), { recursive: true });
				cpSync(source, step.dest, { recursive: true });
				writeFileSync(
					join(step.dest, MARKER),
					`${JSON.stringify({ tool: "harness-dispatch-installer", skill: SKILL_NAME, installed_at: new Date().toISOString() }, null, 2)}\n`,
				);
			}
			return { ...step, done: true };
		} catch (error) {
			return { ...step, done: false, error: error.message };
		}
	});
}

/** Run the installer. Returns the exit code: 0 done, 1 a step failed or was refused, 2 bad usage. */
export function main(argv, io = {}) {
	const out = io.stdout ?? ((text) => process.stdout.write(text));
	const err = io.stderr ?? ((text) => process.stderr.write(text));
	const parsed = parseArgs(argv);
	if (parsed.error) {
		err(`install-skill: ${parsed.error}\n`);
		return 2;
	}
	const { options } = parsed;
	if (options.help) {
		out(HELP);
		return 0;
	}

	const source = join(repoRoot, "skill", SKILL_NAME);
	if (!options.uninstall && !(existsSync(join(source, "SKILL.md")) && existsSync(join(source, "scripts", "hd.mjs")))) {
		err("install-skill: the skill folder is incomplete. Run `npm run build:dist` first.\n");
		return 1;
	}

	const home = resolve(options.home ?? homedir());
	const steps = plan({ home, targets: options.targets, uninstall: options.uninstall });
	const verb = { copy: "copy", replace: "replace", remove: "remove" };
	const past = { copy: "copied", replace: "replaced", remove: "removed" };
	// The plan names the harnesses that read each folder, so the operator sees the reason for it.
	const readers = (step) => `  (read by ${step.serves.join(", ")})`;

	if (!options.apply) {
		out(`Dry run. Home folder: ${home}\n`);
		for (const step of steps) {
			out(
				verb[step.action]
					? `  would ${verb[step.action]}  ${step.id}  ${step.dest}${readers(step)}\n`
					: `  ${step.action.padEnd(11)} ${step.id}  ${step.note}${readers(step)}\n`,
			);
		}
		out("No file was changed. Add --apply to make these changes.\n");
		// A dry run reports a conflict as exit code 0: nothing failed.
		return 0;
	}

	let code = 0;
	for (const result of apply(steps, source)) {
		if (result.error) {
			err(`  FAILED  ${result.id}  ${result.error}\n`);
			code = 1;
		} else if (past[result.action]) out(`  ${past[result.action].padEnd(8)} ${result.id}  ${result.dest}${readers(result)}\n`);
		else {
			out(`  ${result.action.padEnd(11)} ${result.id}  ${result.note}${readers(result)}\n`);
			if (result.action === "skip" && result.note.startsWith("exists")) code = 1;
		}
	}
	return code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	process.exitCode = main(process.argv.slice(2));
}
