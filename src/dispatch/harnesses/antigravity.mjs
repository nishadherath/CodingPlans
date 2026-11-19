// Adapter: Google Antigravity (`agy`).
//
// Flags come from `agy --help` (1.5.13), read on 2026-11-20:
//   -p <prompt>            print mode: one prompt, one run
//   --output-format json   one JSON object on stdout
//   --print-timeout <d>    time limit of the run, a Go duration such as 600s
//   --mode                 plan (read-only task) | accept-edits (write)
//   --conversation <id>    continue a conversation
//   --json-schema <path>   JSON Schema (a path or the schema text)
// The prompt is an argument of `-p`, so it is limited in length. A longer
// prompt is refused. The `stream-json` mode would lift this limit. It is a
// later extension.
//
// Not verified by a live run: that `-p` takes the prompt as its value, and the
// JSON field names. The help text does not say that `-p` takes a value.
//
// `agy` installs to %LOCALAPPDATA%\agy\bin and may be missing from PATH in a
// shell that started before the install.

import { join } from "node:path";
import { DispatchError } from "../envelope.mjs";
import { looksUnauthenticated, parseJsonLoose, pickNumber, pickString, tailText } from "../parse.mjs";
import { EFFORTS } from "../request.mjs";
import { resolveNamed } from "../resolve.mjs";

export const MAX_PROMPT_CHARS = 24000;
const MODE = { read: "plan", write: "accept-edits" };

const adapter = {
	id: "antigravity",
	name: "Google Antigravity",
	cli: "agy",
	capabilities: { resume: true, schema: true, models: true, efforts: [...EFFORTS] },

	resolve(env) {
		const extraDirs = env.LOCALAPPDATA ? [join(env.LOCALAPPDATA, "agy", "bin")] : [];
		return resolveNamed("agy", env, { extraDirs });
	},

	buildInvocation(request) {
		const mode = MODE[request.access];
		if (!mode) throw new DispatchError("usage", `Unknown access mode "${request.access}".`);
		if (request.prompt.length > MAX_PROMPT_CHARS) {
			throw new DispatchError(
				"prompt-too-long",
				`The prompt has ${request.prompt.length} characters. The limit for Antigravity is ${MAX_PROMPT_CHARS}. Write a shorter brief and name files to read.`,
			);
		}
		const args = ["-p", request.prompt, "--output-format", "json", "--print-timeout", `${request.timeoutSec}s`];
		if (request.model) args.push("--model", request.model);
		if (request.effort) args.push("--effort", request.effort);
		args.push("--mode", mode);
		if (request.resume) args.push("--conversation", request.resume);
		if (request.schema) args.push("--json-schema", request.schema.path);
		return { args, stdin: null, tempFiles: [] };
	},

	parseOutput(result) {
		const object = parseJsonLoose(result.stdout);
		if (!object || Array.isArray(object)) {
			const text = `${result.stderr}\n${result.stdout}`;
			if (result.code !== 0) {
				return failure(looksUnauthenticated(text) ? "not-authenticated" : "target-error", `Antigravity exited with code ${result.code}. ${tailText(text)}`);
			}
			return failure("bad-output", "Antigravity did not print one JSON object on stdout.");
		}

		const usage = object.usage ?? {};
		const common = {
			session_id: pickString(object.conversation_id),
			model: null,
			cost_usd: null,
			usage: {
				input_tokens: pickNumber(usage.input_tokens),
				output_tokens: pickNumber(usage.output_tokens),
				cache_read_tokens: pickNumber(usage.cache_read_tokens),
				reasoning_tokens: pickNumber(usage.thinking_tokens),
				total_tokens: pickNumber(usage.total_tokens),
			},
		};

		// Good only with exit code 0 and status SUCCESS (contract section 7.3).
		if (result.code !== 0 || object.status !== "SUCCESS") {
			const reported = typeof object.error === "string" ? object.error : pickString(object.error?.message) ?? "";
			const detail = `${reported}\n${result.stderr}`;
			const code = looksUnauthenticated(detail) ? "not-authenticated" : "target-error";
			const status = pickString(object.status) ?? "unknown";
			return { ...failure(code, `Antigravity failed. Exit code ${result.code}, status ${status}. ${tailText(detail)}`), ...common };
		}
		const text = pickString(object.response);
		const structured = object.structured_output ?? null;
		if (text === null && structured === null) {
			return { ...failure("bad-output", "The Antigravity result has no response and no structured output."), ...common };
		}
		return { ok: true, text: text ?? "", structured, error: null, ...common };
	},

	// `agy --help` shows no sign-in status command. `hd doctor` reports "unknown".
	authCheck: null,

	listModels: {
		args: ["models"],
		/** Lines are `<slug><TAB><label>`. A status line comes first. */
		parse(result) {
			const models = [];
			for (const line of result.stdout.split(/\r?\n/)) {
				const [id, label] = line.split("\t");
				if (id && label && !/\s/.test(id.trim())) models.push({ id: id.trim(), label: label.trim() });
			}
			return models;
		},
	},
};

function failure(code, message) {
	return { ok: false, text: "", session_id: null, usage: null, structured: null, cost_usd: null, model: null, error: { code, message } };
}

export default adapter;
