// Executable resolution for dispatch targets.
//
// Rule of this repository: start a target only by an ABSOLUTE path, with no
// shell. On Windows a bare name such as `codex` resolves to an npm shim
// (`codex.cmd`) that Node cannot start by name. The helpers here find a real
// executable, or a way to start the same program without the shim.

import { accessSync, constants, existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { findAllOnPath, findSpawnableOnPath } from "../detect/cli.mjs";

const isWindows = process.platform === "win32";

function isExecutableFile(candidate) {
	try {
		if (!statSync(candidate).isFile()) return false;
		accessSync(candidate, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/**
 * Per-user install folders that hold real executables. The home folder comes
 * from the given environment, not from the real account, so that a test can
 * point it at an empty folder.
 */
function userFolders(name, env) {
	const home = env.USERPROFILE || env.HOME || homedir();
	const folders = [join(home, ".local", "bin")];
	if (name === "claude") folders.push(join(home, ".claude", "local"));
	if (isWindows) folders.push(join(home, "AppData", "Local", "Programs", name));
	return folders;
}

/**
 * Find a way to start a program by its name.
 *
 * Order: a real executable on PATH; then, with `npmShim`, the entry file of an
 * npm `.cmd` shim; then `extraDirs` (for installs that do not edit PATH, such
 * as `%LOCALAPPDATA%\agy\bin`); then the per-user install folders.
 *
 * @returns {{ command: string, prefixArgs: string[], via: string } | undefined}
 */
export function resolveNamed(name, env = process.env, { extraDirs = [], npmShim = false } = {}) {
	const onPath = findSpawnableOnPath(name, env);
	if (onPath) return { command: onPath, prefixArgs: [], via: "path" };
	if (npmShim) {
		const shim = resolveNpmShim(name, env);
		if (shim) return shim;
	}
	for (const dir of [...extraDirs, ...userFolders(name, env)]) {
		const candidate = join(dir, isWindows ? `${name}.exe` : name);
		if (isExecutableFile(candidate)) return { command: candidate, prefixArgs: [], via: "known-folder" };
	}
	return undefined;
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
 * Start a package that npm installed as `<name>.cmd`, without the shim.
 * The command is this Node program. The first argument is the package entry.
 * This is the official launcher of the package, so no copy of a binary is
 * needed.
 */
export function resolveNpmShim(name, env = process.env) {
	for (const entry of findAllOnPath(name, env)) {
		if (entry.suffix.toLowerCase() !== ".cmd") continue;
		try {
			const entryFile = parseCmdShim(readFileSync(entry.path, "utf8"), dirname(entry.path));
			if (entryFile && existsSync(entryFile)) {
				return { command: process.execPath, prefixArgs: [entryFile], via: "npm-shim" };
			}
		} catch {
			// An unreadable shim is skipped.
		}
	}
	return undefined;
}

/**
 * Resolve one target.
 *
 * @returns {{ state: "ok", command: string, prefixArgs: string[], via: string }
 *   | { state: "not-installed" | "not-startable", message: string }}
 */
export function diagnose(adapter, env = process.env) {
	const found = adapter.resolve(env);
	if (found) return { state: "ok", ...found };
	// A shim that we cannot read is "installed, but not startable".
	if (findAllOnPath(adapter.cli, env).length > 0) {
		return {
			state: "not-startable",
			message: `${adapter.name} is installed, but only as a shim that this tool cannot start without a shell.`,
		};
	}
	return { state: "not-installed", message: `${adapter.name} is not installed. Program name: ${adapter.cli}.` };
}

/**
 * Ask a target for its version. This is not a model call.
 *
 * @param {object} found  The `ok` result of `diagnose`.
 * @param {Function} exec  `execute` or a test double.
 */
export async function readVersion(found, exec, versionArgs = ["--version"]) {
	const result = await exec(found.command, [...found.prefixArgs, ...versionArgs], { timeoutMs: 20_000, killTree: true });
	if (result.spawnError || result.timedOut) return { startable: false, version: null };
	const match = /(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/.exec(`${result.stdout}\n${result.stderr}`);
	return { startable: result.code === 0, version: match ? match[1] : null };
}
