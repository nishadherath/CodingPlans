// Adapter: OpenAI Codex (`codex`).
//
// Flags come from `codex exec --help` and `codex exec resume --help`
// (0.154.0), read on 2026-11-20:
//   exec --json                  events as JSON Lines on stdout
//   -o <file>                    the last message of the agent goes to a file
//   -c key=value                 config override (TOML value)
//   -C <dir>                     working root (new session only)
//   --output-schema <file>       JSON Schema of the final answer
//   exec resume <id> -           continue a session. It has no -s and no -C.
// Access and effort use `-c` overrides, because `-c` exists for both `exec`
// and `exec resume`. The prompt goes on stdin (`-`).
//
// Windows: npm installs `codex` as `codex.cmd`. Node cannot start it. The
// resolver prefers a real `codex.exe` on PATH, then starts the package entry
// file with this Node program (the official launcher).
//
// Not verified by a live run: the event names and the usage field names.
// The parser accepts the known variants of the usage names.

import { DispatchError } from "../envelope.mjs";
import { looksUnauthenticated, parseJsonLines, pickNumber, pickString, tailText, unwrapMessage } from "../parse.mjs";
import { resolveNamed } from "../resolve.mjs";

const SANDBOX = { read: "read-only", write: "workspace-write" };

const adapter = {
	id: "codex",
	name: "OpenAI Codex CLI",
	cli: "codex",
	// `max` is not in the Codex help text. It is left out until a live run proves it.
	capabilities: { resume: true, schema: true, models: false, efforts: ["low", "medium", "high", "xhigh"] },

	resolve(env) {
		return resolveNamed("codex", env, { npmShim: true });
	},

	buildInvocation(request, ctx) {
		const sandbox = SANDBOX[request.access];
		if (!sandbox) throw new DispatchError("usage", `Unknown access mode "${request.access}".`);
		const lastMessage = ctx.tempFile("last-message.txt");
		const resuming = Boolean(request.resume);

		const args = resuming ? ["exec", "resume"] : ["exec"];
		args.push("--json", "--skip-git-repo-check", "-o", lastMessage);
		if (!resuming) args.push("-C", request.cwd);
		if (request.model) args.push("-m", request.model);
		if (request.effort) args.push("-c", `model_reasoning_effort="${request.effort}"`);
		args.push("-c", `sandbox_mode="${sandbox}"`);
		if (request.schema) args.push("--output-schema", request.schema.path);
		if (resuming) args.push(request.resume);
		args.push("-");
		return { args, stdin: request.prompt, tempFiles: [lastMessage] };
	},

	parseOutput(result, ctx = {}) {
		const events = parseJsonLines(result.stdout);
		let sessionId = null;
		let lastAgentMessage = null;
		let usage = null;
		let turnFailure = null;
		let lastError = null;
		for (const event of events) {
			if (event.type === "thread.started") sessionId = pickString(event.thread_id) ?? sessionId;
			else if (event.type === "item.completed" && event.item?.type === "agent_message") {
				lastAgentMessage = pickString(event.item.text) ?? lastAgentMessage;
			} else if (event.type === "turn.completed") usage = event.usage ?? usage;
			else if (event.type === "turn.failed") turnFailure = unwrapMessage(pickString(event.error?.message, event.message) ?? "The turn failed.");
			else if (event.type === "error") lastError = unwrapMessage(pickString(event.message) ?? lastError);
			// An `item.completed` item of type "error" is a warning (a real run
			// printed three of them before a failure). It does not fail the run.
		}

		const common = {
			session_id: sessionId,
			model: null,
			cost_usd: null,
			usage: usage && {
				input_tokens: pickNumber(usage.input_tokens),
				output_tokens: pickNumber(usage.output_tokens),
				cache_read_tokens: pickNumber(usage.cached_input_tokens, usage.cache_read_input_tokens, usage.cache_read_tokens),
				reasoning_tokens: pickNumber(usage.reasoning_output_tokens, usage.reasoning_tokens),
				total_tokens: pickNumber(usage.total_tokens),
			},
		};

		if (result.code !== 0 || turnFailure) {
			const detail = `${turnFailure ?? lastError ?? ""}\n${result.stderr}`;
			const code = looksUnauthenticated(detail) ? "not-authenticated" : "target-error";
			return { ...failure(code, `Codex failed with code ${result.code}. ${tailText(detail)}`), ...common };
		}

		// The -o file is the primary source: it holds the final message only.
		const fromFile = ctx.tempContents?.[ctx.invocation?.tempFiles?.[0]];
		const text = typeof fromFile === "string" && fromFile.trim() ? fromFile.trimEnd() : lastAgentMessage;
		if (!text && lastError) {
			// Exit 0, no answer, but an `error` event: report the error, not "bad output".
			const code = looksUnauthenticated(lastError) ? "not-authenticated" : "target-error";
			return { ...failure(code, `Codex finished without a final message. ${tailText(lastError)}`), ...common };
		}
		if (!text) {
			return { ...failure("bad-output", "Codex finished without a final message."), ...common };
		}
		let structured = null;
		if (ctx.request?.schema) {
			try {
				structured = JSON.parse(text);
			} catch {
				structured = null;
			}
		}
		return { ok: true, text, structured, error: null, ...common };
	},

	authCheck: {
		args: ["login", "status"],
		// The text has no account name today. Only the sign-in state is read.
		parse(result) {
			const text = `${result.stdout}\n${result.stderr}`;
			if (/not\s+logged\s+in/i.test(text)) return false;
			if (result.code === 0 && /logged\s+in/i.test(text)) return true;
			return null;
		},
	},
};

function failure(code, message) {
	return { ok: false, text: "", session_id: null, usage: null, structured: null, cost_usd: null, model: null, error: { code, message } };
}

export default adapter;
