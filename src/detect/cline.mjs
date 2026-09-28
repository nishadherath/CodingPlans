// Locate the Cline host and the on-disk @cline/llms package.
//
// A Cline install is a compiled Bun binary that carries its own copy of
// @cline/llms. The optional peer packages must be resolvable from wherever
// that bundle resolves them, which is NOT necessarily the directory the user
// installed the CLI from. We therefore report both the host binary and the
// nearest on-disk @cline/llms so the peer install can be aimed correctly.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { tryRun } from "../util/exec.mjs";

const isWindows = process.platform === "win32";

function pathEntries(env = process.env) {
	return (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean);
}

// npm's `cline` package name, per platform/arch, holding the compiled binary.
function platformPackageName() {
	const platform = { win32: "windows", darwin: "darwin", linux: "linux" }[process.platform] ?? process.platform;
	// Deliberately unscoped so callers can join it under a node_modules root
	// without doubling the scope segment. The package really is
	// "@cline/cli-<platform>-<arch>"; build that at the call site.
	return `cli-${platform}-${process.arch}`;
}

/**
 * Locate the compiled Cline binary.
 *
 * This hits the SAME trap the package exists to fix, so it is worth spelling
 * out. `cline` on PATH is normally just npm shims:
 *
 *   C:\...\nodejs\cline          (extensionless)
 *   C:\...\nodejs\cline.cmd
 *   C:\...\nodejs\cline.ps1
 *
 * None of those is spawnable by bare name from a Bun/uv_spawn host, and
 * `cline.exe` is not on PATH at all — it lives inside the platform package:
 *
 *   node_modules/cline/node_modules/@cline/cli-<platform>-<arch>/bin/cline.exe
 *
 * So we probe PATH first, then walk the npm package layout.
 */
export async function detectCline({ env = process.env } = {}) {
	// 1. A real executable directly on PATH.
	for (const dir of pathEntries(env)) {
		for (const name of isWindows ? ["cline.exe"] : ["cline"]) {
			const candidate = join(dir, name);
			if (!existsSync(candidate)) continue;
			const result = await tryRun(candidate, ["--version"], { timeoutMs: 20_000 });
			if (result) {
				return { path: candidate, via: "path", version: (/(\d+\.\d+\.\d+)/.exec(result.stdout) ?? [])[1] };
			}
		}
	}

	// 2. The compiled binary inside an npm-installed platform package.
	// `pkg` is the unscoped leaf ("cli-<platform>-<arch>"); the scope segment is
	// supplied by the join below, so the package is
	// "<root>/node_modules/@cline/<pkg>".
	const pkg = platformPackageName();
	const sub = isWindows ? "cline.exe" : "cline";
	for (const root of clineSearchRoots(env)) {
		const candidates = [
			join(root, "node_modules", "@cline", pkg, "bin", sub),
			join(root, "cline", "node_modules", "@cline", pkg, "bin", sub),
			join(root, "node_modules", "cline", "node_modules", "@cline", pkg, "bin", sub),
			join(root, "node_modules", "cline", "bin", ".cline"),
			join(root, "bin", ".cline"),
		];
		for (const candidate of candidates) {
			if (!existsSync(candidate)) continue;
			const result = await tryRun(candidate, ["--version"], { timeoutMs: 20_000 });
			if (result) {
				return { path: candidate, via: "npm-package", version: (/(\d+\.\d+\.\d+)/.exec(result.stdout) ?? [])[1] };
			}
		}
	}

	// 3. A monorepo checkout with a built binary, or a CLINE_BIN_PATH override.
	if (env.CLINE_BIN_PATH && existsSync(env.CLINE_BIN_PATH)) {
		return { path: env.CLINE_BIN_PATH, via: "CLINE_BIN_PATH" };
	}

	return undefined;
}

/**
 * Directories that may hold a Cline install or an @cline/llms checkout.
 *
 * PATH-driven on purpose. Hard-coded prefixes (`/usr/local/lib`, a specific
 * nvm layout, `%APPDATA%\npm`) cover only the machines they were written on;
 * deriving candidates from every PATH entry plus the running node's own prefix
 * is what makes this work on an arbitrary machine (nvm, fnm, volta, asdf,
 * Homebrew, a distro package, a Windows install under any drive).
 */
function clineSearchRoots(env = process.env) {
	const roots = [];
	const push = (p) => {
		if (p && !roots.includes(p)) roots.push(p);
	};
	push(env.CLINE_DIR);
	push(env.CLINE_DATA_DIR ? dirname(env.CLINE_DATA_DIR) : undefined);

	// Every PATH entry, and its node_modules sibling.
	for (const dir of pathEntries(env)) {
		push(dir);
		push(join(dir, "node_modules"));
		push(join(dir, "node_modules", "cline"));
	}

	// The prefix of the node binary currently running this process.
	try {
		const prefix = dirname(dirname(process.execPath));
		push(prefix);
		push(join(prefix, "lib", "node_modules", "cline"));
		push(join(prefix, "node_modules", "cline"));
	} catch {
		// best effort
	}

	if (isWindows) {
		push(env.APPDATA ? join(env.APPDATA, "npm", "node_modules", "cline") : undefined);
		push(env.ProgramFiles ? join(env.ProgramFiles, "nodejs", "node_modules", "cline") : undefined);
	} else {
		push("/usr/local/lib/node_modules/cline");
		push("/usr/lib/node_modules/cline");
	}
	push(join(homedir(), ".local", "share", "cline"));
	push(join(homedir(), ".cline"));
	return roots;
}

/**
 * Locate an on-disk @cline/llms package.json.
 * Returns undefined when the host is a self-contained bundle (common), which
 * is itself a useful signal for the report.
 */
export function findLlmsPackage({ env = process.env, extraRoots = [] } = {}) {
	const candidates = [];
	for (const root of [...clineSearchRoots(env), ...extraRoots]) {
		candidates.push(join(root, "node_modules", "@cline", "llms", "package.json"));
		candidates.push(join(root, "sdk", "packages", "llms", "package.json"));
		candidates.push(join(root, "packages", "llms", "package.json"));
	}
	for (const candidate of candidates) {
		if (existsSync(candidate)) return candidate;
	}
	return undefined;
}

/** Read declared optional peer dependencies from an @cline/llms manifest. */
export function readOptionalPeers(manifestPath) {
	if (!manifestPath) return {};
	try {
		const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));
		const meta = pkg.peerDependenciesMeta ?? {};
		const peers = pkg.peerDependencies ?? {};
		const optional = {};
		for (const [name, range] of Object.entries(peers)) {
			if (meta[name]?.optional) optional[name] = range;
		}
		return { version: pkg.version, optionalPeers: optional, name: pkg.name };
	} catch {
		return {};
	}
}

/** Read the Cline CLI's own version, for the report header. */
export async function clineVersion(clinePath) {
	if (!clinePath) return undefined;
	const result = await tryRun(clinePath, ["--version"], { timeoutMs: 20_000 });
	if (!result) return undefined;
	return (/(\d+\.\d+\.\d+)/.exec(result.stdout) ?? [])[1];
}
