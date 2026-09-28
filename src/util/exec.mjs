// Child-process helpers.
//
// Two rules learned the hard way while bringing these providers up on Windows:
//
//  1. Never spawn a bare command name. Bun-compiled hosts (Cline ships one)
//     spawn via libuv's uv_spawn, which does NOT apply Windows PATHEXT
//     resolution. `codex` on PATH usually resolves to an extensionless npm
//     shim plus `codex.cmd`, and *neither* is spawnable by name. Resolving an
//     absolute path ourselves is the only portable way.
//
//  2. Always bound the wait. A wedged child must surface as a timeout with the
//     tail of its stderr, not as a hang that looks like a slow model.

import { spawn } from "node:child_process";

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

/**
 * Run a command and buffer its output.
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
 */
export function run(command, args = [], options = {}) {
	const {
		cwd,
		env = process.env,
		timeoutMs = 120_000,
		input,
		rejectOnNonZero = true,
	} = options;

	return new Promise((resolve, reject) => {
		let child;
		try {
			child = spawn(command, args, {
				cwd,
				env,
				// Both CLIs emit UTF-8 JSON on stdout. Without an explicit
				// encoding Windows pipes decode as latin-1 and mangle any
				// non-ASCII model output.
				stdio: ["pipe", "pipe", "pipe"],
				windowsHide: true,
			});
		} catch (error) {
			reject(new ExecError(`Failed to spawn ${command}: ${error.message}`, { command }));
			return;
		}

		let stdout = "";
		let stderr = "";
		let timedOut = false;
		let settled = false;

		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
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
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			// ENOENT here is the exact failure this package exists to prevent.
			reject(
				new ExecError(`Failed to spawn ${command}: ${error.message}`, {
					code: error.code,
					stderr,
					command,
				}),
			);
		});

		child.on("close", (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (timedOut) {
				reject(
					new ExecError(`Timed out after ${timeoutMs}ms: ${command}`, {
						stdout,
						stderr,
						timedOut: true,
						command,
					}),
				);
				return;
			}
			if (code !== 0 && rejectOnNonZero) {
				reject(
					new ExecError(
						`Exited ${code}: ${command}${stderr ? `\n${stderr.trim()}` : ""}`,
						{ code, stdout, stderr, command },
					),
				);
				return;
			}
			resolve({ stdout, stderr, code });
		});

		if (input !== undefined && child.stdin) {
			child.stdin.end(input);
		} else if (child.stdin) {
			child.stdin.end();
		}
	});
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
