// Child-process helpers.
//
// Three rules learned the hard way while bringing these providers up on Windows:
//
//  1. Never spawn a bare command name. Bun-compiled hosts (Cline ships one)
//     spawn via libuv's uv_spawn, which does NOT apply Windows PATHEXT
//     resolution. `codex` on PATH usually resolves to an extensionless npm
//     shim plus `codex.cmd`, and *neither* is spawnable by name. Resolving an
//     absolute path ourselves is the only portable way.
//
//  2. Always bound the wait. A wedged child must surface as a timeout with the
//     tail of its stderr, not as a hang that looks like a slow model.
//
//  3. A timeout must stop the whole process tree. A coding agent CLI starts
//     helpers (npm launchers, shells, language servers). Killing only the
//     direct child leaves them running and they keep the output pipes open.
//     `killTree` and `execute` implement this rule for the dispatch engine.

import { spawn } from "node:child_process";
import { join } from "node:path";

export class ExecError extends Error {
	constructor(message, { code, stdout = "", stderr = "", timedOut = false, command = "" } = {}) {
		super(message);
		this.name = "ExecError";
		this.code = code;
		this.stdout = stdout;
		this.stderr = stderr;
		this.timedOut = timedOut;
		this.command = command;
	}
}

/** Absolute path of taskkill.exe. The fallback needs "\\": "C:\W" is "C:W" in JS. */
export function taskkillPath(env = process.env) {
	return join(env.SystemRoot ?? env.windir ?? "C:\\Windows", "System32", "taskkill.exe");
}

/**
 * Stop a child and every process that it started.
 *
 * Windows: `taskkill /T /F` walks the tree. The absolute path is used so that
 * the call does not depend on PATH. POSIX: the child must have been started
 * with `detached: true` (its own process group). Then one signal to the
 * negative pid reaches the whole group.
 *
 * @param {import("node:child_process").ChildProcess} child
 * @param {object}  [options]
 * @param {boolean} [options.group]  The child leads its own POSIX process group.
 */
export function killTree(child, { group = false, platform = process.platform, env = process.env } = {}) {
	const pid = child.pid;
	if (!pid) return;
	const fallback = () => {
		try {
			child.kill("SIGKILL");
		} catch {
			// The child is already gone.
		}
	};
	if (platform === "win32") {
		try {
			const killer = spawn(taskkillPath(env), ["/PID", String(pid), "/T", "/F"], {
				stdio: "ignore",
				windowsHide: true,
			});
			killer.on("error", fallback);
			// A non-zero code means taskkill could not stop the tree. Stop the
			// direct child at least.
			killer.on("close", (code) => {
				if (code !== 0) fallback();
			});
			killer.unref();
		} catch {
			fallback();
		}
		return;
	}
	try {
		if (group) process.kill(-pid, "SIGKILL");
		else child.kill("SIGKILL");
	} catch {
		fallback();
	}
}

/**
 * Run a command, buffer its output and NEVER reject.
 *
 * The result always has the same shape. A failure to start is reported in
 * `spawnError`; a timeout is reported in `timedOut`. The dispatch engine
 * needs this because each outcome maps to a different error code.
 *
 * @param {string}   command      Absolute path of an executable.
 * @param {string[]} args
 * @param {object}   [options]
 * @param {string}   [options.cwd]
 * @param {object}   [options.env]       Replaces process.env when provided.
 * @param {number}   [options.timeoutMs=120000]
 * @param {string}   [options.input]     Written to stdin, then stdin closes.
 * @param {boolean}  [options.killTree=false]  On timeout, stop the whole tree.
 * @param {number}   [options.graceMs=3000]    After a tree kill, the longest wait
 *                                             for the output pipes to close.
 * @returns {Promise<{code: number|null, signal: string|null, stdout: string,
 *   stderr: string, timedOut: boolean, spawnError: Error|null, durationMs: number}>}
 */
export function execute(command, args = [], options = {}) {
	const { cwd, env = process.env, timeoutMs = 120_000, input, killTree: tree = false, graceMs = 3000 } = options;
	// Without its own process group a POSIX child cannot be stopped as a tree.
	const group = tree && process.platform !== "win32";

	return new Promise((resolve) => {
		const startedAt = Date.now();
		let stdout = "";
		let stderr = "";
		let timedOut = false;
		let settled = false;
		let timer;
		let grace;

		const finish = (code, signal, spawnError = null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			clearTimeout(grace);
			resolve({ code, signal, stdout, stderr, timedOut, spawnError, durationMs: Date.now() - startedAt });
		};

		let child;
		try {
			child = spawn(command, args, {
				cwd,
				env,
				stdio: ["pipe", "pipe", "pipe"],
				windowsHide: true,
				detached: group,
			});
		} catch (error) {
			finish(null, null, error);
			return;
		}

		timer = setTimeout(() => {
			timedOut = true;
			if (tree) killTree(child, { group });
			else child.kill("SIGKILL");
			// A grandchild that survives can keep the pipes open. Do not wait for it.
			grace = setTimeout(() => {
				child.stdout?.destroy();
				child.stderr?.destroy();
				finish(null, "SIGKILL");
			}, graceMs);
		}, timeoutMs);

		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (d) => {
			stdout += d;
		});
		child.stderr?.on("data", (d) => {
			stderr += d;
		});

		child.on("error", (error) => {
			// ENOENT here is the exact failure this package exists to prevent.
			// An error after a successful start (a failed kill) is not fatal.
			if (child.pid === undefined) finish(null, null, error);
		});
		child.on("close", (code, signal) => finish(code, signal));

		// The child can exit before it reads stdin. EPIPE must not crash the process.
		child.stdin?.on("error", () => {});
		if (input !== undefined) child.stdin?.end(input);
		else child.stdin?.end();
	});
}

/**
 * Run a command and buffer its output. Rejects on spawn failure, timeout and
 * (by default) a non-zero exit. The legacy `coding-plans` code uses this.
 *
 * @param {string}   command      Absolute path, or a bare name when you have
 *                                 already proven it spawns.
 * @param {string[]} args
 * @param {object}   [options]
 * @param {string}   [options.cwd]
 * @param {object}   [options.env]   Replaces process.env when provided.
 * @param {number}   [options.timeoutMs=120000]
 * @param {boolean}  [options.input]  Written to stdin then closed. Required by
 *                                    both CLIs, which read a prompt from stdin.
 * @param {boolean}  [options.rejectOnNonZero=true]
 * @param {boolean}  [options.killTree=false]  See `execute`.
 */
export async function run(command, args = [], options = {}) {
	const { rejectOnNonZero = true, ...rest } = options;
	const result = await execute(command, args, rest);
	const { stdout, stderr } = result;

	if (result.spawnError) {
		throw new ExecError(`Failed to spawn ${command}: ${result.spawnError.message}`, {
			code: result.spawnError.code,
			stderr,
			command,
		});
	}
	if (result.timedOut) {
		throw new ExecError(`Timed out after ${rest.timeoutMs ?? 120_000}ms: ${command}`, {
			stdout,
			stderr,
			timedOut: true,
			command,
		});
	}
	if (result.code !== 0 && rejectOnNonZero) {
		throw new ExecError(`Exited ${result.code}: ${command}${stderr ? `
${stderr.trim()}` : ""}`, {
			code: result.code,
			stdout,
			stderr,
			command,
		});
	}
	return { stdout, stderr, code: result.code };
}

/** Run and swallow failures, returning null instead. For probe-style calls. */
export async function tryRun(command, args = [], options = {}) {
	try {
		return await run(command, args, { ...options, rejectOnNonZero: false });
	} catch {
		return null;
	}
}

/**
 * Spawn a long-lived child, streaming stdout lines to a callback.
 * Used for CLIs whose output only materialises after tens of seconds.
 */
export function stream(command, args = [], { onLine, onExit, cwd, env = process.env, timeoutMs = 180_000 } = {}) {
	return new Promise((resolve) => {
		const child = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
		let buffer = "";
		let stderr = "";
		let timedOut = false;

		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, timeoutMs);

		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk) => {
			buffer += chunk;
			let index;
			while ((index = buffer.indexOf("\n")) >= 0) {
				const line = buffer.slice(0, index).trim();
				buffer = buffer.slice(index + 1);
				if (line) onLine?.(line);
			}
		});
		child.stderr?.on("data", (d) => {
			stderr += d;
		});
		child.on("error", (error) => {
			clearTimeout(timer);
			resolve({ code: -1, stdout: "", stderr: stderr || error.message, spawnError: error });
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			if (buffer.trim()) onLine?.(buffer.trim());
			resolve({ code: timedOut ? -2 : code, stdout: "", stderr, timedOut });
		});
		child.stdin?.end();
	});
}
