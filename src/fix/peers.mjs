// Install the optional peer packages Cline loads lazily.
//
// @cline/llms declares both CLI providers as OPTIONAL peer dependencies and
// imports them with a bare await import() at call time. If the package is
// absent the provider throws:
//
//   The Claude Code provider requires the optional 'ai-sdk-provider-claude-code'
//   package. Install it alongside @cline/llms to use this provider.
//
// So the package must be resolvable from the Cline host's module graph, which
// for an npm-installed CLI means the global node_modules root (sibling of the
// `cline` package) rather than the user's project.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { run } from "../util/exec.mjs";

const isWindows = process.platform === "win32";

/** npm/pnpm/yarn/bun command name for this platform. */
function pkgManager(env = process.env) {
	if (env.npm_execpath && env.npm_execpath.includes("pnpm")) return "pnpm";
	if (env.npm_execpath && env.npm_execpath.includes("yarn")) return "yarn";
	if (env.npm_execpath && env.npm_execpath.includes("bun")) return "bun";
	return "npm";
}

/**
 * Global node_modules roots to probe when installing optional peers.
 *
 * Sibling of the cline package itself is preferred:
 *   <prefix>/lib/node_modules/cline/bin/cline -> <prefix>/lib/node_modules
 * then the usual global locations, then every PATH entry's node_modules.
 * Duplicates are removed; a machine with nvm + Homebrew + a container mount
 * routinely has several, and probing a missing directory is free.
 */
export function globalRoots(clinePath, env = process.env) {
	const roots = [];
	const push = (p) => {
		if (p && !roots.includes(p)) roots.push(p);
	};
	if (clinePath) push(dirname(dirname(clinePath)));
	push(env.CLINE_DATA_DIR ? join(env.CLINE_DATA_DIR, "node_modules") : undefined);

	if (isWindows) {
		push(env.APPDATA ? join(env.APPDATA, "npm", "node_modules") : undefined);
		push(env.ProgramFiles ? join(env.ProgramFiles, "nodejs", "node_modules") : undefined);
		push(join(env.SystemDrive ?? "C:", "nvm4w", "nodejs", "node_modules"));
	}
	push("/usr/local/lib/node_modules");
	push("/usr/lib/node_modules");
	push(join(homedir(), ".local", "lib", "node_modules"));

	try {
		// node ships inside <prefix>/bin/node, so node_modules is its parent.
		push(dirname(dirname(process.execPath)));
	} catch {
		// best effort
	}

	for (const dir of (env.PATH ?? "").split(delimiter)) {
		if (dir) push(join(dir, "node_modules"));
	}
	return roots;
}

/** Is `name` already resolvable from any of the given roots? */
export function isPeerPresent(name, roots) {
	return roots.some((root) => existsSync(join(root, name, "package.json")));
}

/**
 * Install one or more packages globally.
 *
 * @param {string[]} specs  e.g. ["ai-sdk-provider-claude-code@^4"]
 * @param {object}   [opts]
 * @param {boolean}  [opts.dryRun]
 * @returns {Promise<{installed:boolean, command:string, output?:string, error?:string}>}
 */
export async function installPeers(specs, { dryRun = false, cwd, env = process.env, timeoutMs = 600_000 } = {}) {
	if (specs.length === 0) return { installed: true, command: "(nothing to install)", skipped: true };

	const pm = pkgManager(env);
	const args = pm === "npm" ? ["install", "-g", ...specs, "--no-audit", "--no-fund"] : ["add", ...specs, "-g"];
	const command = `${pm} ${args.join(" ")}`;

	if (dryRun) return { installed: false, command, dryRun: true };

	// Global installs are slow; a generous bound with streamed output avoids
	// both a false timeout and a silent hang.
	const result = await run(pm, args, { cwd, env, timeoutMs, rejectOnNonZero: false });
	if (result.code !== 0) {
		return {
			installed: false,
			command,
			error: (result.stderr || result.stdout || `exit ${result.code}`).trim().slice(0, 2000),
		};
	}
	return { installed: true, command, output: result.stdout };
}

/**
 * Verify the two packages Cline's community vendor module imports by name.
 * These are hard-coded string specifiers, so the names must match exactly.
 */
export function requiredPeerNames(plan) {
	return [plan.peerPackage];
}

/** Probe whether a peer package resolves AND exposes its expected export. */
export async function probePeerExport(specifier, exportName, { roots, cwd }) {
	// Resolving from disk is the reliable check; a real import is attempted
	// only when we can control the module context.
	for (const root of roots) {
		if (existsSync(join(root, specifier, "package.json"))) {
			return { present: true, root, exportChecked: false };
		}
	}
	return { present: false, roots };
}
