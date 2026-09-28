// Cross-platform CLI detection.
//
// The central problem this module exists to solve:
//
//   A Cline host spawns the CLI by BARE NAME. On Windows that is `codex`, and
//   npm installs it as an extensionless shim (`codex`) plus `codex.cmd`.
//   Bun-compiled hosts spawn through libuv's uv_spawn, which does not perform
//   PATHEXT expansion, so BOTH of those fail with ENOENT. Only a real
//   `codex.exe` is spawnable by name.
//
// So detection must answer two different questions, and conflating them is how
// this class of bug survives testing:
//
//   (a) Is the CLI installed?          -> any artefact on disk
//   (b) Is it SPAWNABLE by bare name?  -> a real executable on PATH
//
// Claude Code ships a true `claude.exe` in ~/.local/bin, so (a) and (b) agree
// and everything works. Codex does not, and that asymmetry is the entire bug.

import { accessSync, constants, existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { run, tryRun } from "../util/exec.mjs";

const isWindows = process.platform === "win32";

/** Filename suffixes tried per platform, most-preferred first. */
function candidateSuffixes() {
	// Windows hosts need a real .exe; shims are a last resort and are reported
	// as "installed but not spawnable" rather than treated as success.
	return isWindows ? [".exe", ".cmd", ".bat", ""] : [""];
}

function pathEntries(env = process.env) {
	return (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean);
}

/** Absolute path of a bare-spawnable executable on PATH, or undefined. */
export function findSpawnableOnPath(name, env = process.env) {
	const suffixes = candidateSuffixes();
	for (const dir of pathEntries(env)) {
		for (const suffix of suffixes) {
			const candidate = join(dir, `${name}${suffix}`);
			try {
				if (!statSync(candidate).isFile()) continue;
				accessSync(candidate, constants.X_OK);
				// A .cmd/.bat shim is NOT spawnable by bare name from a
				// Bun/uv_spawn host. Only real executables count here.
				if (isWindows && suffix !== ".exe") continue;
				return candidate;
			} catch {
				// keep looking
			}
		}
	}
	return undefined;
}

/** Every artefact for `name` on PATH, spawnable or not. */
export function findAllOnPath(name, env = process.env) {
	const found = [];
	for (const dir of pathEntries(env)) {
		for (const suffix of candidateSuffixes()) {
			const candidate = join(dir, `${name}${suffix}`);
			try {
				if (statSync(candidate).isFile()) {
					found.push({
						path: candidate,
						suffix,
						spawnable: isWindows ? suffix === ".exe" : true,
					});
				}
			} catch {
				// keep looking
			}
		}
	}
	return found;
}

function isExecutableFile(candidate) {
	try {
		if (!statSync(candidate).isFile()) return false;
		accessSync(candidate, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/** Per-user install dirs that ship real executables. */
function userInstallDirs(name) {
	const home = homedir();
	const dirs = [join(home, ".local", "bin")];
	if (name === "claude") {
		dirs.push(join(home, ".claude", "local"));
		dirs.push(join(home, ".npm-global", "bin"));
	}
	if (isWindows) {
		dirs.push(join(home, "AppData", "Local", "Programs", "claude"));
		dirs.push(join(home, "AppData", "Local", "Programs", "codex"));
	}
	return dirs;
}

/** Look for a real executable in known per-user install dirs. */
export function findInUserDirs(name) {
	for (const dir of userInstallDirs(name)) {
		for (const suffix of candidateSuffixes()) {
			const candidate = join(dir, `${name}${suffix}`);
			// A .cmd/.bat shim is not usable by a Bun host, so only real
			// executables satisfy "spawnable" on Windows.
			if (isWindows && suffix !== ".exe") continue;
			if (isExecutableFile(candidate)) return candidate;
		}
	}
	return undefined;
}

/**
 * Vendor binary directories npm-style installs use, checked when the command
 * is not spawnable on PATH. Cline's own resolution logic anchors on
 * `<pkg>/node_modules/<vendor>/vendor/<triple>/bin/`, and we mirror that so
 * the installer can surface a path the user can wire up.
 */
function vendorBinaryGlobs() {
	return [
		join("node_modules", "@openai", "codex", "node_modules", "@openai", "codex-win32-x64", "vendor", "x86_64-pc-windows-msvc", "bin", "codex.exe"),
		join("node_modules", "@openai", "codex", "node_modules", "@openai", "codex-darwin-arm64", "vendor", "aarch64-apple-darwin", "bin", "codex"),
		join("node_modules", "@openai", "codex", "node_modules", "@openai", "codex-darwin-x64", "vendor", "x86_64-apple-darwin", "bin", "codex"),
		join("node_modules", "@openai", "codex", "node_modules", "@openai", "codex-linux-x64", "vendor", "x86_64-unknown-linux-gnu", "bin", "codex"),
		join("node_modules", "@openai", "codex", "node_modules", "@openai", "codex-linux-arm64", "vendor", "aarch64-unknown-linux-gnu", "bin", "codex"),
	];
}

/** Common global npm roots, used to hunt for a vendor binary. */
/**
 * Global node_modules roots worth probing.
 *
 * Deliberately cross-platform rather than host-conditional: the list is also
 * used to *report* where peers were searched, and a machine can legitimately
 * hold several layouts at once (nvm, Homebrew, a Windows node alongside POSIX
 * paths, a container mount). Probing a non-existent directory is free.
 */
function globalRoots(env = process.env) {
	const roots = [];
	const push = (p) => {
		if (p && !roots.includes(p)) roots.push(p);
	};
	if (isWindows) {
		push(env.APPDATA ? join(env.APPDATA, "npm", "node_modules") : undefined);
		push(env.ProgramFiles ? join(env.ProgramFiles, "nodejs", "node_modules") : undefined);
		push(join(env.SystemDrive ?? "C:", "nvm4w", "nodejs", "node_modules"));
	}
	push("/usr/local/lib/node_modules");
	push("/usr/lib/node_modules");
	push(join(homedir(), ".local", "lib", "node_modules"));
	try {
		// node ships inside e.g. <prefix>/bin/node, so node_modules is its parent.
		push(dirname(dirname(process.execPath)));
	} catch {
		// best effort
	}
	return roots;
}

function walkForBinary(root, name, depth) {
	if (depth < 0) return undefined;
	let entries;
	try {
		entries = readdirSync(root, { withFileTypes: true });
	} catch {
		return undefined;
	}
	for (const entry of entries) {
		const full = join(root, entry.name);
		if (entry.isDirectory()) {
			const hit = walkForBinary(full, name, depth - 1);
			if (hit) return hit;
		} else if (entry.name === `${name}.exe` || entry.name === name) {
			if (isExecutableFile(full)) return full;
		}
	}
	return undefined;
}

/** Look for the packaged vendor binary under global npm roots. */
export function findVendorBinary(name) {
	for (const root of globalRoots()) {
		for (const rel of vendorBinaryGlobs()) {
			const candidate = join(root, rel);
			// A vendor binary is a real executable even when not on PATH, so
			// it satisfies (a) and is directly usable once wired up.
			if (isExecutableFile(candidate)) return candidate;
		}
		// Fall back to a bounded walk for non-standard layouts.
		const direct = join(root, "node_modules", "@openai", "codex");
		if (existsSync(direct)) {
			const hit = walkForBinary(direct, name, 6);
			if (hit) return hit;
		}
	}
	return undefined;
}

/** Read a CLI's version string. Returns undefined when it cannot run. */
export async function probeVersion(executable, args = ["--version"], timeoutMs = 20_000) {
	const result = await tryRun(executable, args, { timeoutMs });
	if (!result) return undefined;
	const match = /(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/.exec(`${result.stdout}\n${result.stderr}`);
	return match ? match[1] : result.stdout.trim() || undefined;
}

/**
 * Full detection report for one CLI.
 *
 * `installed` and `spawnable` are deliberately distinct: the fixer acts on the
 * gap between them, and the doctor reports it as the headline diagnosis.
 */
export async function detectCli(name, { env = process.env, versionArgs = ["--version"] } = {}) {
	const onPathEntries = findAllOnPath(name, env);
	const onPathSpawnable = onPathEntries.find((e) => e.spawnable)?.path;
	const userDir = findInUserDirs(name);
	const vendorBinary = findVendorBinary(name);

	// Preference order mirrors Cline's own resolver: PATH, then per-user dir,
	// then the packaged vendor binary.
	const executable = onPathSpawnable ?? userDir ?? vendorBinary;
	const installed = Boolean(executable) || onPathEntries.length > 0;
	const spawnableByName = Boolean(onPathSpawnable);

	let reason;
	if (spawnableByName) reason = "found on PATH as a real executable";
	else if (userDir) reason = "real executable in a user install dir (needs PATH wiring)";
	else if (vendorBinary) reason = "packaged vendor binary found (needs PATH wiring)";
	else if (onPathEntries.length > 0) reason = "only non-executable shims on PATH";
	else reason = "not found";

	const version = executable ? await probeVersion(executable, versionArgs) : undefined;

	return {
		name,
		installed,
		spawnable: spawnableByName,
		executable,
		onPath: onPathEntries.map((e) => e.path),
		userDir,
		vendorBinary,
		version,
		reason,
	};
}

/** Confirm a CLI answers a trivial command. */
export async function canExecute(executable, timeoutMs = 20_000) {
	// A spawn ENOENT (bad arch, not an executable, a text file) surfaces as a
	// thrown ExecError, not a non-zero exit. That must read as "cannot run",
	// otherwise ensureSpawnable would wire up a binary that cannot execute.
	try {
		const result = await run(executable, ["--version"], { timeoutMs, rejectOnNonZero: false });
		return {
			ok: result.code === 0,
			spawnable: true,
			stdout: result.stdout,
			stderr: result.stderr,
			output: `${result.stdout}\n${result.stderr}`.trim(),
		};
	} catch (error) {
		return {
			ok: false,
			spawnable: false,
			stdout: error.stdout ?? "",
			stderr: error.stderr ?? "",
			output: (error.message ?? String(error)).trim(),
		};
	}
}

// MARKER_SPLIT_DETECT_CLI
