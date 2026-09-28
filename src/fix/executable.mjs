// Make a CLI spawnable by bare name, which is how Cline's hosts invoke it.
//
// Why a whole module is needed
// -----------------------------
// Cline's Codex provider calls createCodexExec(readOptions(config)) and passes
// no executable path. ai-sdk-provider-codex-cli then tries, in order:
//   1. createRequire(import.meta.url).resolve("@openai/codex/package.json")
//   2. bare "codex"
//
// Step 1 fails inside Cline's Bun-compiled binary: createRequire anchors on
// the virtual bunfs, where on-disk node_modules are invisible (the same trap
// is documented in Cline's own resolveClaudeExecutable). So it falls to step 2,
// and uv_spawn does not apply PATHEXT, so an npm shim is ENOENT.
//
// The fix is to put a REAL executable at a bare-spawnable PATH location. We
// prefer a symlink (cheap, stays current) and fall back to a copy on Windows
// and on filesystems without symlink permission.

import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { canExecute, findSpawnableOnPath, probeVersion } from "../detect/cli.mjs";

const isWindows = process.platform === "win32";

/** First PATH dir we are willing to write into, or a safe fallback. */
export function pickTargetDir(env = process.env) {
	const entries = (env.PATH ?? "").split(delimiter).filter(Boolean);

	// Prefer a dir that already holds a real, known-good executable: that is
	// proven to be on PATH and writable in practice. On the reference machine
	// this is ~/.local/bin, which is exactly where claude.exe already lives.
	const anchor = findSpawnableOnPath(isWindows ? "claude" : "claude", env);
	if (anchor) return dirname(anchor);

	// Otherwise the first existing, writable PATH entry.
	for (const dir of entries) {
		try {
			if (existsSync(dir)) return dir;
		} catch {
			// keep looking
		}
	}

	// Not on PATH anywhere: stage somewhere predictable and tell the user.
	const fallback = join(homedir(), ".local", "bin");
	mkdirSync(fallback, { recursive: true });
	return fallback;
}

function linkOrCopy(source, target) {
	try {
		unlinkSync(target);
	} catch {
		// nothing to remove
	}
	if (isWindows) {
		// Symlinks on Windows need Developer Mode or admin. A hard link is
		// cheap and needs neither, but cannot cross volumes, so try both.
		try {
			symlinkSync(source, target, "file");
			return "symlink";
		} catch {
			try {
				copyFileSync(source, target);
				return "copy";
			} catch {
				return null;
			}
		}
	}
	try {
		symlinkSync(source, target);
		return "symlink";
	} catch {
		try {
			copyFileSync(source, target);
			return "copy";
		} catch {
			return null;
		}
	}
}

/**
 * Ensure `name` resolves to a real executable on PATH.
 *
 * @returns {{
 *   changed: boolean,
 *   method: 'already-spawnable'|'symlink'|'copy'|'unavailable',
 *   target: string|undefined,
 *   source: string|undefined,
 *   note: string
 * }}
 */
export async function ensureSpawnable(name, { env = process.env, source, dryRun = false } = {}) {
	const existing = findSpawnableOnPath(name, env);
	if (existing) {
		return {
			changed: false,
			method: "already-spawnable",
			target: existing,
			source: existing,
			note: "already spawnable by name",
		};
	}

	const from = source;
	if (!from || !existsSync(from)) {
		return {
			changed: false,
			method: "unavailable",
			note: `no real ${name} executable found to link onto PATH`,
		};
	}

	// A source that is itself a symlink should be resolved first, otherwise we
	// would create a link to a link (and copy nothing useful on the copy path).
	let resolvedSource = from;
	try {
		if (lstatSync(from).isSymbolicLink()) {
			const link = readlinkSync(from);
			resolvedSource = join(dirname(from), link);
		}
	} catch {
		// keep the original
	}

	// Sanity-check the source actually runs before wiring it in. A corrupt,
	// wrong-arch, or non-executable file would otherwise be silently
	// advertised as a working install.
	const probe = await canExecute(resolvedSource);
	if (!probe.ok) {
		return {
			changed: false,
			method: "unavailable",
			source: resolvedSource,
			note: `candidate executable failed to run: ${(probe.output || "unknown error").slice(0, 200)}`,
		};
	}

	const targetDir = pickTargetDir(env);
	const target = join(targetDir, `${name}${isWindows ? ".exe" : ""}`);

	if (dryRun) {
		return { changed: false, method: "symlink", target, source: resolvedSource, note: "dry run" };
	}

	const method = linkOrCopy(resolvedSource, target);
	if (!method) {
		return { changed: false, method: "unavailable", source: resolvedSource, note: `could not write ${target}` };
	}

	// A copy of a large binary will drift from the version npm later installs;
	// record what we linked so `doctor` can flag staleness.
	if (method === "copy") {
		try {
			writeFileSync(`${target}.coding-plans.json`, JSON.stringify({ source: resolvedSource, linkedAt: new Date().toISOString() }, null, 2));
		} catch {
			// provenance is best-effort
		}
	}

	return { changed: true, method, target, source: resolvedSource, note: `linked ${name} -> ${resolvedSource}` };
}

/**
 * Report whether a previously-copied binary has drifted from its source.
 *
 * Only relevant for the `copy` strategy (Windows / no-symlink filesystems).
 * A symlink tracks its target automatically and is never stale.
 */
export async function checkStaleness(name, { env = process.env } = {}) {
	const target = join(pickTargetDir(env), `${name}${isWindows ? ".exe" : ""}`);
	const marker = `${target}.coding-plans.json`;
	if (!existsSync(marker) || !existsSync(target)) return { stale: false };

	try {
		const meta = JSON.parse(readFileSync(marker, "utf8"));
		if (!meta.source || !existsSync(meta.source)) {
			return { stale: true, reason: "source binary is gone", target, meta };
		}
		const [targetVersion, sourceVersion] = await Promise.all([
			probeVersion(target),
			probeVersion(meta.source),
		]);
		if (sourceVersion && targetVersion && sourceVersion !== targetVersion) {
			return {
				stale: true,
				reason: `linked copy is ${targetVersion} but source is ${sourceVersion}`,
				target,
				source: meta.source,
				meta,
			};
		}
		return { stale: false, target, meta };
	} catch (error) {
		return { stale: false, reason: error.message };
	}
}
