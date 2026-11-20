// Executable resolution for dispatch targets.
//
// Rule of this repository: start a target only by an ABSOLUTE path, with no
// shell. On Windows a bare name such as `codex` resolves to an npm shim
// (`codex.cmd`) that Node cannot start by name. The helpers here find a real
// executable, or a way to start the same program without the shim.
//
// Several copies of one target can exist on a machine (live evidence, H3: three
// Codex copies, of two versions). `diagnose` collects the candidates of a
// target and takes the one with the highest version. The variable
// HARNESS_DISPATCH_<ID>_PATH overrides the whole search.

import { accessSync, constants, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { findAllOnPath, findSpawnableOnPath } from "../detect/cli.mjs";

const isWindows = process.platform === "win32";

/** Versions that were read in this process. One `--version` run for each program. */
export const PROCESS_VERSION_CACHE = new Map();

function isExecutableFile(candidate) {
	try {
		if (!statSync(candidate).isFile()) return false;
		accessSync(candidate, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function homeOf(env) {
	return env.USERPROFILE || env.HOME || homedir();
}

/**
 * Per-user install folders that hold real executables. The home folder comes
 * from the given environment, not from the real account, so that a test can
 * point it at an empty folder.
 */
function userFolders(name, env) {
	const home = homeOf(env);
	const folders = [join(home, ".local", "bin")];
	if (name === "claude") folders.push(join(home, ".claude", "local"));
	if (isWindows) folders.push(join(home, "AppData", "Local", "Programs", name));
	return folders;
}

/**
 * Every way to start a program by its name, most preferred first.
 *
 * Order: each real executable on PATH; then, with `npmShim`, the entry file of
 * each npm `.cmd` shim; then `extraDirs` (for installs that do not edit PATH,
 * such as `%LOCALAPPDATA%\agy\bin`); then the per-user install folders. A
 * program that two sources name is listed one time.
 *
 * @returns {{ command: string, prefixArgs: string[], via: string }[]}
 */
export function resolveAll(name, env = process.env, { extraDirs = [], npmShim = false } = {}) {
	const found = [];
	for (const entry of findAllOnPath(name, env)) {
		if (entry.spawnable) found.push({ command: entry.path, prefixArgs: [], via: "path" });
	}
	if (npmShim) found.push(...resolveNpmShims(name, env));
	for (const dir of [...extraDirs, ...userFolders(name, env)]) {
		const candidate = join(dir, isWindows ? `${name}.exe` : name);
		if (isExecutableFile(candidate)) found.push({ command: candidate, prefixArgs: [], via: "known-folder" });
	}
	return dedupe(found);
}

/**
 * Find a way to start a program by its name: the first of `resolveAll`.
 *
 * @returns {{ command: string, prefixArgs: string[], via: string } | undefined}
 */
export function resolveNamed(name, env = process.env, options = {}) {
	// The PATH search stops at the first real executable, as before.
	const onPath = findSpawnableOnPath(name, env);
	if (onPath) return { command: onPath, prefixArgs: [], via: "path" };
	return resolveAll(name, env, options)[0];
}

/**
 * Candidates for Codex: the generic list, and the copies that the Codex
 * Desktop app keeps at `%LOCALAPPDATA%\OpenAI\Codex\bin\<hash>\codex.exe`.
 * The app copy can be newer than the npm copy.
 */
export function codexCandidates(env = process.env) {
	const found = resolveAll("codex", env, { npmShim: true });
	if (isWindows) {
		const local = env.LOCALAPPDATA || join(homeOf(env), "AppData", "Local");
		const root = join(local, "OpenAI", "Codex", "bin");
		let folders = [];
		try {
			folders = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
		} catch {
			// The folder does not exist: no Desktop copy.
		}
		for (const folder of folders) {
			const candidate = join(root, folder, "codex.exe");
			if (isExecutableFile(candidate)) found.push({ command: candidate, prefixArgs: [], via: "codex-desktop" });
		}
	}
	return dedupe(found);
}

/** Remove a candidate that has the same command and arguments as an earlier one. */
function dedupe(candidates) {
	const seen = new Set();
	return candidates.filter((candidate) => {
		const key = [candidate.command, ...candidate.prefixArgs].join("\0");
		const normal = isWindows ? key.toLowerCase() : key;
		if (seen.has(normal)) return false;
		seen.add(normal);
		return true;
	});
}

/**
 * The JavaScript entry file that an npm `.cmd` shim starts.
 *
 * npm writes the same text for each package, for example:
 *   "%dp0%\node_modules\@openai\codex\bin\codex.js" %*
 * This is a pure function: it reads no file.
 */
export function parseCmdShim(text, cmdDir) {
	const match = /"%~?dp0%?[\\/]*([^"]*?\.(?:mjs|cjs|js))"/i.exec(String(text));
	return match ? join(cmdDir, ...match[1].split(/[\\/]+/)) : undefined;
}

/**
 * Every package that npm installed as `<name>.cmd`, started without the shim.
 * The command is this Node program. The first argument is the package entry.
 * This is the official launcher of the package, so no copy of a binary is
 * needed.
 */
export function resolveNpmShims(name, env = process.env) {
	const found = [];
	for (const entry of findAllOnPath(name, env)) {
		if (entry.suffix.toLowerCase() !== ".cmd") continue;
		try {
			const entryFile = parseCmdShim(readFileSync(entry.path, "utf8"), dirname(entry.path));
			if (entryFile && existsSync(entryFile)) {
				found.push({ command: process.execPath, prefixArgs: [entryFile], via: "npm-shim" });
			}
		} catch {
			// An unreadable shim is skipped.
		}
	}
	return found;
}

/** The first entry of `resolveNpmShims`, or undefined. */
export function resolveNpmShim(name, env = process.env) {
	return resolveNpmShims(name, env)[0];
}

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/;

/**
 * Compare two version texts by the rules of semantic versioning: the numbers
 * first, as numbers; a pre-release is lower than the same release; build
 * metadata is ignored. A text that is not a version is lower than any version.
 *
 * @returns {-1 | 0 | 1}
 */
export function compareVersions(a, b) {
	const left = VERSION_PATTERN.exec(String(a ?? ""));
	const right = VERSION_PATTERN.exec(String(b ?? ""));
	if (!left || !right) return left ? 1 : right ? -1 : 0;
	for (let i = 1; i <= 3; i++) {
		const difference = Number(left[i]) - Number(right[i]);
		if (difference !== 0) return difference > 0 ? 1 : -1;
	}
	if (!left[4] && !right[4]) return 0;
	if (!left[4]) return 1;
	if (!right[4]) return -1;
	const leftIds = left[4].split(".");
	const rightIds = right[4].split(".");
	for (let i = 0; i < Math.max(leftIds.length, rightIds.length); i++) {
		const x = leftIds[i];
		const y = rightIds[i];
		if (x === undefined) return -1;
		if (y === undefined) return 1;
		const xNumber = /^\d+$/.test(x);
		const yNumber = /^\d+$/.test(y);
		if (xNumber && yNumber && Number(x) !== Number(y)) return Number(x) > Number(y) ? 1 : -1;
		if (xNumber !== yNumber) return xNumber ? -1 : 1;
		if (!xNumber && x !== y) return x > y ? 1 : -1;
	}
	return 0;
}

/** The name of the override variable of a target, for example HARNESS_DISPATCH_CODEX_PATH. */
export function overrideName(adapter) {
	return `HARNESS_DISPATCH_${adapter.id.toUpperCase()}_PATH`;
}

/**
 * Resolve one target.
 *
 * 1. The override variable, when set: an absolute path, used as given.
 * 2. Else the candidates of the adapter (`candidates(env)`, or the one result
 *    of `resolve(env)`). With more than one, each gets `--version` one time for
 *    each cache, and the highest version wins. A candidate that cannot answer
 *    is skipped. A tie goes to the earlier candidate.
 *
 * @param {object} [options]
 * @param {Function} [options.exec]  `execute` or a test double, for the version probe.
 * @param {Map} [options.versionCache]  Versions already read. Default: the process cache.
 * @returns {Promise<{ state: "ok", command: string, prefixArgs: string[], via: string, version?: string | null }
 *   | { state: "usage" | "not-installed" | "not-startable", message: string }>}
 */
export async function diagnose(adapter, env = process.env, { exec, versionCache = PROCESS_VERSION_CACHE } = {}) {
	const variable = overrideName(adapter);
	const override = env[variable];
	if (typeof override === "string" && override !== "") {
		if (!isAbsolute(override)) {
			return { state: "usage", message: `${variable} must be an absolute path. Got a relative path.` };
		}
		if (!isExecutableFile(override)) {
			return { state: "not-installed", message: `${variable} names a file that does not exist or cannot run.` };
		}
		if (isWindows && /\.(?:cmd|bat)$/i.test(override)) {
			return { state: "not-startable", message: `${variable} names a shell script. Name a real executable.` };
		}
		return { state: "ok", command: override, prefixArgs: [], via: "env" };
	}

	const candidates = adapter.candidates ? adapter.candidates(env) : [adapter.resolve(env)].filter(Boolean);
	if (candidates.length === 0) {
		// A shim that we cannot read is "installed, but not startable".
		if (findAllOnPath(adapter.cli, env).length > 0) {
			return {
				state: "not-startable",
				message: `${adapter.name} is installed, but only as a shim that this tool cannot start without a shell.`,
			};
		}
		return { state: "not-installed", message: `${adapter.name} is not installed. Program name: ${adapter.cli}.` };
	}
	if (candidates.length === 1 || !exec) return { state: "ok", ...candidates[0] };

	const probes = await Promise.all(candidates.map((candidate) => readVersion(candidate, exec, adapter.versionArgs, versionCache)));
	let best = -1;
	for (let i = 0; i < candidates.length; i++) {
		if (!probes[i].startable) continue;
		if (best < 0 || compareVersions(probes[i].version, probes[best].version) > 0) best = i;
	}
	if (best < 0) return { state: "ok", ...candidates[0] };
	return { state: "ok", ...candidates[best], version: probes[best].version };
}

/**
 * Ask a target for its version. This is not a model call.
 * With a `cache`, one program is asked one time for each cache.
 *
 * @param {object} found  The `ok` result of `diagnose`, or a candidate.
 * @param {Function} exec  `execute` or a test double.
 * @param {string[]} [versionArgs]
 * @param {Map} [cache]
 */
export async function readVersion(found, exec, versionArgs = ["--version"], cache) {
	const key = [found.command, ...found.prefixArgs, ...versionArgs].join("\0");
	if (cache?.has(key)) return cache.get(key);
	const pending = probeVersion(found, exec, versionArgs);
	// A pending promise is cached, so that two callers at once run one probe.
	cache?.set(key, pending);
	return pending;
}

async function probeVersion(found, exec, versionArgs) {
	const result = await exec(found.command, [...found.prefixArgs, ...versionArgs], { timeoutMs: 20_000, killTree: true });
	if (result.spawnError || result.timedOut) return { startable: false, version: null };
	const match = /(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/.exec(`${result.stdout}\n${result.stderr}`);
	return { startable: result.code === 0, version: match ? match[1] : null };
}
