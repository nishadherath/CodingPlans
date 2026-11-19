// Command line of `hd` (harness-dispatch).
//
// Rules of the contract (section 4):
//   - stdout holds exactly one JSON object and one newline. Diagnostics go to
//     stderr. The two informational commands `help` and `--version` print
//     plain text: they start no work and a person reads them.
//   - An unknown flag, a missing value or an unknown target gives exit code 2.
//
// `main(argv, io)` returns the exit code and never throws. `io` replaces the
// process streams, the environment and the effects, so that tests need no
// real target.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { VERSION, errorEnvelope } from "./envelope.mjs";
import { checkDepth } from "./guard.mjs";
import { TARGET_IDS } from "./harnesses/index.mjs";
import { dispatch, doctor, listModels, listTargets } from "./index.mjs";
import { validateRequest } from "./request.mjs";

const HELP = `harness-dispatch ${VERSION}: send a task to a different coding agent CLI.

Usage:
  hd run --to <${TARGET_IDS.join("|")}> [--prompt <text> | --prompt-file <path>]
         [--model <id>] [--effort <low|medium|high|xhigh|max>]
         [--access <read|write>] [--cwd <dir>] [--resume <session_id>]
         [--schema <JSON Schema file>] [--timeout <seconds>]
         [--max-chars <n>] [--out <file>]
  hd list                       Targets, executable paths and versions.
  hd doctor [--to <id>]         Installed, startable, signed in.
  hd models --to <id>           Model ids, where the target can list them.
  hd help | hd --version

Rules:
  - stdout holds one JSON object. Diagnostics go to stderr.
  - Without --prompt and --prompt-file, the prompt is read from stdin.
  - Access is read-only unless you pass --access write.
  - Defaults: --timeout 600, --max-chars 20000.
  - Exit codes: 0 done, 1 target failed, 2 bad usage, 3 target not available,
    4 depth guard refused.
`;

/** Value flags and the request field that each one sets. */
const VALUE_FLAGS = {
	"--to": "to",
	"--prompt": "prompt",
	"--prompt-file": "promptFile",
	"--model": "model",
	"--effort": "effort",
	"--access": "access",
	"--cwd": "cwd",
	"--resume": "resume",
	"--schema": "schema",
	"--timeout": "timeout",
	"--max-chars": "maxChars",
	"--out": "out",
};

/** The flags that each command accepts. */
const COMMAND_FLAGS = {
	run: Object.keys(VALUE_FLAGS),
	list: [],
	doctor: ["--to"],
	models: ["--to"],
};

class UsageError extends Error {}

/** Split argv into `{ command, flags }`. Throws UsageError on a bad argument. */
export function parseArgs(argv) {
	const [command, ...rest] = argv;
	if (command === undefined) throw new UsageError("No command. Run `hd help`.");
	if (["help", "--help", "-h", "--version", "-v"].includes(command)) return { command, flags: {} };
	if (!(command in COMMAND_FLAGS)) throw new UsageError(`Unknown command "${command}". Run \`hd help\`.`);

	const flags = {};
	for (let i = 0; i < rest.length; i++) {
		let token = rest[i];
		let value;
		const equals = token.startsWith("--") ? token.indexOf("=") : -1;
		if (equals > 0) {
			value = token.slice(equals + 1);
			token = token.slice(0, equals);
		}
		if (!COMMAND_FLAGS[command].includes(token)) {
			throw new UsageError(token.startsWith("-") ? `Unknown flag "${token}" for \`hd ${command}\`.` : `Unexpected argument "${token}".`);
		}
		if (value === undefined) {
			if (i + 1 >= rest.length) throw new UsageError(`The flag ${token} needs a value.`);
			value = rest[++i];
		}
		const field = VALUE_FLAGS[token];
		if (field in flags) throw new UsageError(`The flag ${token} is given more than one time.`);
		flags[field] = value;
	}
	return { command, flags };
}

/** All text of a stream, as UTF-8 without a byte order mark. */
async function readAll(stream) {
	const chunks = [];
	for await (const chunk of stream) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks).toString("utf8").replace(/^﻿/, "");
}

/** Read the prompt from the flag, the file, or stdin. */
async function readPrompt(flags, { cwd, stdin }) {
	if (flags.prompt !== undefined && flags.promptFile !== undefined) {
		throw new UsageError("Give --prompt or --prompt-file, not both.");
	}
	if (flags.prompt !== undefined) return flags.prompt;
	if (flags.promptFile !== undefined) {
		try {
			return readFileSync(resolve(cwd, flags.promptFile), "utf8").replace(/^﻿/, "");
		} catch (error) {
			throw new UsageError(`Cannot read the prompt file: ${error.code ?? error.message}`);
		}
	}
	if (stdin.isTTY) throw new UsageError("No prompt. Give --prompt, --prompt-file, or pipe the prompt to stdin.");
	return readAll(stdin);
}

/** Read and check the JSON Schema file. */
function readSchema(flags, cwd) {
	if (flags.schema === undefined) return undefined;
	const path = resolve(cwd, flags.schema);
	let text;
	try {
		text = readFileSync(path, "utf8").replace(/^﻿/, "");
	} catch (error) {
		throw new UsageError(`Cannot read the schema file: ${error.code ?? error.message}`);
	}
	try {
		JSON.parse(text);
	} catch {
		throw new UsageError("The schema file is not valid JSON.");
	}
	return { path, text };
}

/**
 * Run `hd`.
 *
 * @param {string[]} argv  Arguments without the program name.
 * @param {object} [io]  stdout, stderr, stdin, env, cwd, deps (effects).
 * @returns {Promise<number>} The exit code.
 */
export async function main(argv, io = {}) {
	const stdout = io.stdout ?? process.stdout;
	const stderr = io.stderr ?? process.stderr;
	const stdin = io.stdin ?? process.stdin;
	const env = io.env ?? process.env;
	const cwd = io.cwd ?? process.cwd();
	const deps = { ...(io.deps ?? {}), env };

	const emit = (object, code) => {
		stdout.write(`${JSON.stringify(object)}\n`);
		return code;
	};
	const emitEnvelope = (envelope) => emit(envelope, envelope.exit_code);

	try {
		const { command, flags } = parseArgs(argv);

		if (command === "help" || command === "--help" || command === "-h") {
			stdout.write(HELP);
			return 0;
		}
		if (command === "--version" || command === "-v") {
			stdout.write(`${VERSION}\n`);
			return 0;
		}

		if (command === "list") return emit(await listTargets(deps), 0);

		if (command === "doctor" || command === "models") {
			if (flags.to !== undefined && !TARGET_IDS.includes(flags.to)) {
				throw new UsageError(`Unknown target "${flags.to}". Known targets: ${TARGET_IDS.join(", ")}.`);
			}
			if (command === "models" && flags.to === undefined) throw new UsageError("`hd models` needs --to <id>.");
			const report = command === "doctor" ? await doctor(flags.to, deps) : await listModels(flags.to, deps);
			return emit(report, report.exit_code);
		}

		// command === "run". Check the target first: a bad target needs no stdin.
		if (flags.to === undefined || !TARGET_IDS.includes(flags.to)) {
			throw new UsageError(flags.to === undefined ? `--to is required. Known targets: ${TARGET_IDS.join(", ")}.` : `Unknown target "${flags.to}". Known targets: ${TARGET_IDS.join(", ")}.`);
		}
		// The depth guard comes before any read of stdin, which could wait for ever.
		const depth = checkDepth(env);
		if (!depth.allowed) {
			return emitEnvelope(errorEnvelope("depth-exceeded", depth.message, { harness: flags.to, access: flags.access ?? "read" }));
		}

		const prompt = await readPrompt(flags, { cwd, stdin });
		const schema = readSchema(flags, cwd);
		const validated = validateRequest({ ...flags, prompt, schema }, { targets: TARGET_IDS, cwd });
		if (validated.error) throw new UsageError(validated.error.message);

		const envelope = await dispatch(validated.request, deps);
		if (validated.request.out) {
			try {
				writeFileSync(validated.request.out, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
			} catch (error) {
				stderr.write(`hd: cannot write --out file: ${error.code ?? error.message}\n`);
			}
		}
		return emitEnvelope(envelope);
	} catch (error) {
		if (error instanceof UsageError) {
			stderr.write(`hd: ${error.message}\n`);
			return emitEnvelope(errorEnvelope("usage", error.message));
		}
		// A defect in this tool. Still print one JSON object.
		stderr.write(`hd: internal error: ${error?.stack ?? error}\n`);
		return emitEnvelope(errorEnvelope("target-error", `Internal error of hd: ${error?.message ?? error}`));
	}
}

