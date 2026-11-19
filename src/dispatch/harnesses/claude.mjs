// Adapter: Claude Code (`claude`).
//
// Flags come from `claude --help` (2.1.316), read on 2026-11-20:
//   -p                          print mode: one run, no screen
//   --output-format json        one JSON object on stdout
//   --permission-prompts none   nobody answers a prompt: it is denied
//   --permission-mode           manual (read-only task) | acceptEdits (write)
// The prompt goes on stdin, so it has no size limit and no quoting problem.
//
// Safety: no bypass flag is ever passed (contract section 8, rule 2).
// Not verified by a live run: the field names of the JSON object. Fixtures
// named `synthetic-*` hold the expected shape.

import { DispatchError } from "../envelope.mjs";
import { looksUnauthenticated, parseJsonLoose, pickNumber, pickString, tailText } from "../parse.mjs";
import { EFFORTS } from "../request.mjs";
import { resolveNamed } from "../resolve.mjs";

const PERMISSION_MODE = { read: "manual", write: "acceptEdits" };

/** Compact JSON text for `--json-schema`. Falls back to the text as given. */
function schemaText(schema) {
	try {
		return JSON.stringify(JSON.parse(schema.text));
	} catch {
		return schema.text;
	}
}

const adapter = {
	id: "claude",
	name: "Claude Code",
	cli: "claude",
	capabilities: { resume: true, schema: true, models: false, efforts: [...EFFORTS] },

	resolve(env) {
		return resolveNamed("claude", env);
	},

	buildInvocation(request) {
		const mode = PERMISSION_MODE[request.access];
		if (!mode) throw new DispatchError("usage", `Unknown access mode "${request.access}".`);
		const args = ["-p", "--output-format", "json", "--permission-prompts", "none", "--permission-mode", mode];
		if (request.model) args.push("--model", request.model);
		if (request.effort) args.push("--effort", request.effort);
		if (request.resume) args.push("--resume", request.resume);
		if (request.schema) args.push("--json-schema", schemaText(request.schema));
		return { args, stdin: request.prompt, tempFiles: [] };
	},

	parseOutput(result) {
		const parsed = parseJsonLoose(result.stdout);
		// Some versions print an array of messages. The last "result" one counts.
		const object = Array.isArray(parsed) ? parsed.findLast((item) => item?.type === "result") : parsed;

		if (!object || typeof object !== "object") {
			const text = `${result.stderr}\n${result.stdout}`;
			if (result.code !== 0) {
				return failure(looksUnauthenticated(text) ? "not-authenticated" : "target-error", `Claude Code exited with code ${result.code}. ${tailText(text)}`);
			}
			return failure("bad-output", "Claude Code did not print one JSON object on stdout.");
		}

		const usage = object.usage ?? {};
		const models = Object.keys(object.modelUsage ?? {});
		const common = {
			session_id: pickString(object.session_id),
			model: models.length === 1 ? models[0] : null,
			cost_usd: pickNumber(object.total_cost_usd),
			usage: {
				input_tokens: pickNumber(usage.input_tokens),
				output_tokens: pickNumber(usage.output_tokens),
				cache_read_tokens: pickNumber(usage.cache_read_input_tokens),
				reasoning_tokens: null,
				total_tokens: null,
			},
		};

		const answer = pickString(object.result);
		if (object.is_error === true || result.code !== 0) {
			const detail = `${answer ?? ""}\n${result.stderr}`;
			const code = looksUnauthenticated(detail) ? "not-authenticated" : "target-error";
			return { ...failure(code, `Claude Code reported an error. ${tailText(detail)}`), ...common };
		}
		const structured = object.structured_output ?? null;
		if (answer === null && structured === null) {
			return { ...failure("bad-output", "The Claude Code result has no text and no structured output."), ...common };
		}
		return { ok: true, text: (answer ?? "").trimEnd(), structured, error: null, ...common };
	},

	authCheck: {
		args: ["auth", "status", "--json"],
		// Only the `loggedIn` flag is read. The output has an account name.
		parse(result) {
			const object = parseJsonLoose(result.stdout);
			return typeof object?.loggedIn === "boolean" ? object.loggedIn : null;
		},
	},
};

function failure(code, message) {
	return { ok: false, text: "", session_id: null, usage: null, structured: null, cost_usd: null, model: null, error: { code, message } };
}

export default adapter;
