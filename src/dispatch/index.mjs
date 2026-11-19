// Dispatch orchestration: run one task on one target and build the envelope.
//
// The flow of `dispatch`:
//   depth guard -> request checks -> resolve target -> buildInvocation
//   -> spawn (no shell, time limit, tree kill) -> write log -> parseOutput
//   -> envelope.
// Every outside effect goes through `deps`, so a test can inject a fake spawn
// function and a temporary folder. No test needs a real target.

import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute } from "../util/exec.mjs";
import { SCHEMA, buildEnvelope, errorEnvelope, DispatchError, truncateText } from "./envelope.mjs";
import { checkDepth, withDepth } from "./guard.mjs";
import { HARNESSES, getHarness } from "./harnesses/index.mjs";
import { diagnose, readVersion } from "./resolve.mjs";

/** The real effects. A test replaces any of them. */
export function defaultDeps() {
	return {
		env: process.env,
		exec: execute,
		now: () => Date.now(),
		tmpRoot: tmpdir(),
		randomId: () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
		isDirectory: (path) => {
			try {
				return statSync(path).isDirectory();
			} catch {
				return false;
			}
		},
	};
}

/** Read each temp file. A file that does not exist reads as null. */
function readTempFiles(paths) {
	const contents = {};
	for (const path of paths) {
		try {
			contents[path] = readFileSync(path, "utf8");
		} catch {
			contents[path] = null;
		}
	}
	return contents;
}

/**
 * Write the raw output of the target to the log file.
 * The file mode is 0600: the output can hold private code.
 * @returns {string|null} The path, or null when the write failed.
 */
function writeLog(deps, request, result) {
	try {
		const folder = join(deps.tmpRoot, "harness-dispatch");
		mkdirSync(folder, { recursive: true });
		const file = join(folder, `${request.to}-${deps.randomId()}.log`);
		writeFileSync(file, `=== stdout ===\n${result.stdout}\n=== stderr ===\n${result.stderr}\n`, { mode: 0o600 });
		return file;
	} catch {
		return null;
	}
}

/**
 * Run one task on one target.
 *
 * @param {object} request  A validated request (see request.mjs).
 * @param {object} [overrides]  Replacement effects (see defaultDeps).
 * @returns {Promise<object>} The result envelope. Never rejects.
 */
export async function dispatch(request, overrides = {}) {
	const deps = { ...defaultDeps(), ...overrides };
	const startedAt = deps.now();
	const base = { harness: request.to, model: request.model, effort: request.effort, access: request.access };
	const fail = (code, message, extra = {}) =>
		errorEnvelope(code, message, { ...base, ...extra, duration_ms: deps.now() - startedAt });

	// Rule 1 of section 8. This runs first, so a loop stops before any other work.
	const depth = checkDepth(deps.env);
	if (!depth.allowed) return fail("depth-exceeded", depth.message);

	const adapter = getHarness(request.to);
	if (!adapter) return fail("usage", `Unknown target "${request.to}".`, { harness: null });

	const caps = adapter.capabilities;
	if (request.resume && !caps.resume) return fail("usage", `${adapter.name} cannot resume a session.`);
	if (request.schema && !caps.schema) return fail("usage", `${adapter.name} cannot enforce a JSON Schema.`);
	if (request.effort && !caps.efforts.includes(request.effort)) {
		return fail("usage", `${adapter.name} accepts these effort levels: ${caps.efforts.join(", ")}.`);
	}
	if (!deps.isDirectory(request.cwd)) return fail("usage", `The working directory does not exist: ${request.cwd}`);

	const found = diagnose(adapter, deps.env);
	if (found.state !== "ok") return fail(found.state, found.message);

	// Temp files live in one folder for this run. The folder is deleted at the end.
	const runFolder = join(deps.tmpRoot, "harness-dispatch", `run-${deps.randomId()}`);
	const ctx = {
		env: deps.env,
		request,
		tempFile(name) {
			mkdirSync(runFolder, { recursive: true });
			return join(runFolder, name);
		},
	};

	try {
		let invocation;
		try {
			invocation = adapter.buildInvocation(request, ctx);
		} catch (error) {
			if (error instanceof DispatchError) return fail(error.code, error.message);
			throw error;
		}

		const result = await deps.exec(found.command, [...found.prefixArgs, ...invocation.args], {
			cwd: request.cwd,
			env: withDepth(deps.env),
			timeoutMs: request.timeoutSec * 1000,
			input: invocation.stdin ?? undefined,
			killTree: true,
		});
		const logFile = writeLog(deps, request, result);
		const duration = deps.now() - startedAt;
		const after = { log_file: logFile, duration_ms: duration };

		// The OS refuses a command line that is too long (Windows: 32,767
		// characters after quote escaping). The target exists, so this is not
		// exit code 3. The caller must shorten the prompt or the schema.
		if (["ENAMETOOLONG", "E2BIG"].includes(result.spawnError?.code)) {
			return fail("prompt-too-long", `The command line for ${adapter.name} is too long for this operating system (${result.spawnError.code}). Write a shorter brief, or a smaller schema.`, after);
		}
		if (result.spawnError) {
			return fail("not-startable", `${adapter.name} could not be started (${result.spawnError.code ?? "spawn error"}).`, after);
		}
		if (result.timedOut) {
			return fail("timeout", `${adapter.name} did not finish within ${request.timeoutSec} seconds. The process tree was stopped.`, after);
		}

		let parsed;
		try {
			parsed = adapter.parseOutput(result, {
				...ctx,
				invocation,
				tempContents: readTempFiles(invocation.tempFiles ?? []),
			});
		} catch (error) {
			return fail("bad-output", `The output of ${adapter.name} could not be read: ${error.message}`, after);
		}

		const cut = truncateText(parsed.text, request.maxChars);
		return buildEnvelope({
			...base,
			model: parsed.model ?? request.model,
			session_id: parsed.session_id,
			text: cut.text,
			structured: parsed.structured,
			truncated: cut.truncated,
			usage: parsed.usage ?? undefined,
			cost_usd: parsed.cost_usd,
			error: parsed.ok === true ? null : { code: parsed.error?.code ?? "target-error", message: parsed.error?.message ?? "The target failed." },
			...after,
		});
	} catch (error) {
		// A defect in this tool, or an exec double that broke its contract.
		return fail("target-error", `Internal error of hd: ${error?.message ?? error}`);
	} finally {
		try {
			rmSync(runFolder, { recursive: true, force: true });
		} catch {
			// A temp folder that cannot be deleted is not a failure of the task.
		}
	}
}

/** `list`: each target, its executable and its version. No model call. */
export async function listTargets(overrides = {}) {
	const deps = { ...defaultDeps(), ...overrides };
	const targets = [];
	for (const adapter of HARNESSES) {
		const found = diagnose(adapter, deps.env);
		const entry = { id: adapter.id, name: adapter.name, cli: adapter.cli, installed: found.state !== "not-installed", startable: false, executable: null, via: null, version: null };
		if (found.state === "ok") {
			const probe = await readVersion(found, deps.exec, adapter.versionArgs);
			Object.assign(entry, { startable: probe.startable, executable: found.command, via: found.via, version: probe.version });
		}
		targets.push(entry);
	}
	return { schema: SCHEMA, ok: true, command: "list", targets };
}

/**
 * `doctor`: installed, startable, signed in. No model call.
 * `authenticated` is true, false, or null (unknown: the target has no check).
 * The exit code follows the worst target: 3 not available, 1 not signed in.
 */
export async function doctor(selection, overrides = {}) {
	const deps = { ...defaultDeps(), ...overrides };
	const adapters = selection ? [getHarness(selection)] : HARNESSES;
	const checks = [];
	for (const adapter of adapters) {
		const found = diagnose(adapter, deps.env);
		const check = { id: adapter.id, installed: found.state !== "not-installed", startable: false, authenticated: null, version: null, notes: [] };
		if (found.state !== "ok") {
			check.notes.push(found.message);
			checks.push(check);
			continue;
		}
		const probe = await readVersion(found, deps.exec, adapter.versionArgs);
		check.startable = probe.startable;
		check.version = probe.version;
		if (!probe.startable) check.notes.push(`${adapter.name} did not answer --version.`);
		else if (adapter.authCheck) {
			const result = await deps.exec(found.command, [...found.prefixArgs, ...adapter.authCheck.args], { timeoutMs: 20_000, killTree: true });
			check.authenticated = result.spawnError || result.timedOut ? null : adapter.authCheck.parse(result);
			if (check.authenticated === false) check.notes.push(`${adapter.name} is not signed in. Sign in to it in a terminal.`);
		} else {
			check.notes.push("This target has no sign-in status command. Authentication is unknown.");
		}
		checks.push(check);
	}
	const unavailable = checks.some((check) => !check.installed || !check.startable);
	const signedOut = checks.some((check) => check.authenticated === false);
	return { schema: SCHEMA, ok: !unavailable && !signedOut, command: "doctor", exit_code: unavailable ? 3 : signedOut ? 1 : 0, targets: checks };
}

/** `models`: the model ids of a target, where its CLI can list them. */
export async function listModels(id, overrides = {}) {
	const deps = { ...defaultDeps(), ...overrides };
	const adapter = getHarness(id);
	const done = (fields) => ({ schema: SCHEMA, command: "models", harness: id, models: [], supported: false, ...fields });
	if (!adapter?.listModels) {
		return done({ ok: true, exit_code: 0, note: "This target has no model list command. Pass a model id with --model." });
	}
	const found = diagnose(adapter, deps.env);
	if (found.state !== "ok") return done({ ok: false, exit_code: 3, error: { code: found.state, message: found.message } });
	const result = await deps.exec(found.command, [...found.prefixArgs, ...adapter.listModels.args], { timeoutMs: 30_000, killTree: true });
	if (result.spawnError || result.timedOut || result.code !== 0) {
		return done({ ok: false, exit_code: 1, supported: true, error: { code: "target-error", message: `${adapter.name} could not list models.` } });
	}
	return done({ ok: true, exit_code: 0, supported: true, models: adapter.listModels.parse(result) });
}
