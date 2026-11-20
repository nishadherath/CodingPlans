// Adapter: Claude Code (`claude`).
//
// Flags come from `claude --help` (2.1.316), read on 2026-11-20:
//   -p                          print mode: one run, no screen
//   --output-format json        one JSON object on stdout
//   --permission-prompts none   nobody answers a prompt: it is denied
//   --permission-mode           manual (read) | acceptEdits (write)
//   --restricted, --strict-mcp-config, --disallowedTools   read access (below)
// The prompt goes on stdin, so it has no size limit and no quoting problem.
//
// Safety: no bypass flag is ever passed (contract section 8, rule 2).
// The field names of the JSON object were confirmed by live runs (fixtures
// `real-*`). `synthetic-*` fixtures hold shapes that no live run produced.

import { DispatchError } from "../envelope.mjs";
import { deniedActions, failureCode, parseJsonLoose, pickNumber, pickString, tailText } from "../parse.mjs";
import { EFFORTS } from "../request.mjs";
import { resolveNamed } from "../resolve.mjs";

// Read access (live runs of 2026-11-20, scratch repository with allow rules for
// Bash, Edit and Write):
//  - "--permission-mode manual --permission-prompts none" alone ran `npm test`
//    and wrote a file (defect D9): an allow rule beats the mode.
//  - "--restricted" removes the shell tools and ignores the settings files, but
//    a rule that came by "--settings" still let Write work.
//  - "--disallowedTools Edit Write NotebookEdit" on top wrote nothing. A deny
//    rule wins over an allow rule.
//  - "--strict-mcp-config" keeps MCP servers out (a read question still works).
// So a read run has the file read and search tools only. The deny list takes
// several values, so it is the LAST option (the prompt is on stdin).
const READ_ARGS = ["--permission-mode", "manual", "--restricted", "--strict-mcp-config"];
const READ_DENY_ARGS = ["--disallowedTools", "Edit", "Write", "NotebookEdit"];
const WRITE_ARGS = ["--permission-mode", "acceptEdits"];

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
		if (request.access !== "read" && request.access !== "write") {
			throw new DispatchError("usage", `Unknown access mode "${request.access}".`);
		}
		const reading = request.access === "read";
		const args = ["-p", "--output-format", "json", "--permission-prompts", "none", ...(reading ? READ_ARGS : WRITE_ARGS)];
		if (request.model) args.push("--model", request.model);
		if (request.effort) args.push("--effort", request.effort);
		if (request.resume) args.push("--resume", request.resume);
		if (request.schema) args.push("--json-schema", schemaText(request.schema));
		if (reading) args.push(...READ_DENY_ARGS);
		return { args, stdin: request.prompt, tempFiles: [] };
	},

	parseOutput(result) {
		const parsed = parseJsonLoose(result.stdout);
		// Some versions print an array of messages. The last "result" one counts.
		const object = Array.isArray(parsed) ? parsed.findLast((item) => item?.type === "result") : parsed;

		if (!object || typeof object !== "object") {
			const text = `${result.stderr}\n${result.stdout}`;
			if (result.code !== 0) {
				return failure(failureCode(text), `Claude Code exited with code ${result.code}. ${tailText(text)}`);
			}
			return failure("bad-output", "Claude Code did not print one JSON object on stdout.");
		}

		const usage = object.usage ?? {};
		const models = Object.keys(object.modelUsage ?? {});
		const common = {
			// Each denied tool call of the run: `{ tool_name, tool_use_id, tool_input }`.
			denied_actions: deniedActions(object.permission_denials),
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
			const code = failureCode(detail);
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
