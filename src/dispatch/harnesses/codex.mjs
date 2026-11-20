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
// Success and failure events were confirmed by live runs (H3, fixtures
// `real-*`): `item.completed` with `agent_message` (the last one is the answer)
// and `turn.completed` with `usage` (`input_tokens`, `cached_input_tokens`,
// `output_tokens`, `reasoning_output_tokens`). The parser also accepts other
// known names of the usage fields.

import { DispatchError } from "../envelope.mjs";
import { failureCode, parseJsonLines, parseJsonLoose, pickNumber, pickString, tailText, unwrapMessage } from "../parse.mjs";
import { EFFORTS } from "../request.mjs";
import { codexCandidates, resolveNamed } from "../resolve.mjs";

const SANDBOX = { read: "read-only", write: "workspace-write" };

// Read hardening (live evidence, H3 part 3, 2026-11-20). The sandbox covers shell
// commands and file writes only. Plugins, connected apps, computer-use, browser
// features, hooks and the MCP servers of the user config give the agent tools
// that act outside the sandbox. With these features off and every enabled server
// switched off, a read run saw none of those tools. The built-in web tool stays.
// A write run keeps the plugins and the servers of the user.
const READ_OFF_FEATURES = ["plugins", "apps", "computer_use", "browser_use", "browser_use_external", "in_app_browser", "hooks"];
// The servers are listed with plugins and apps off, as in the real run: those two
// features add servers (for example the computer-use server) that the run never sees.
const LIST_ARGS = ["mcp", "list", "--json", "--disable", "plugins", "--disable", "apps"];
const LIST_TIMEOUT_MS = 20_000;

const UNLISTED = "The MCP servers could not be listed, so the read run did not start. A read run with unknown servers is not a read run.";

/** A TOML key for `-c mcp_servers.<key>.enabled=false`: quoted when it has an unusual character. */
function tomlKey(name) {
	return /^[A-Za-z0-9_-]+$/.test(name) ? name : JSON.stringify(name);
}

const adapter = {
	id: "codex",
	name: "OpenAI Codex CLI",
	cli: "codex",
	// The model cache of the Codex Desktop app lists the efforts low to max (and
	// ultra). All five are passed on. The service decides what a model accepts.
	capabilities: { resume: true, schema: true, models: false, efforts: [...EFFORTS] },

	resolve(env) {
		return resolveNamed("codex", env, { npmShim: true });
	},

	// Several Codex programs can exist on one machine. Live evidence (H3): the
	// npm and ~/.local/bin copies (0.154.0) were refused by the service for the
	// model of the account, and the Codex Desktop copy (0.167.0-alpha.4.1) was
	// accepted. `diagnose` picks the highest version among these.
	candidates(env) {
		return codexCandidates(env);
	},

	/**
	 * Before a read run: list the MCP servers (no model call). Each enabled one is
	 * switched off in `buildInvocation`. Fail closed: if the list is missing or
	 * unreadable, the run does not start. A write run needs nothing here.
	 */
	async prepare(request, { command, prefixArgs, exec }) {
		if (request.access !== "read") return {};
		const result = await exec(command, [...prefixArgs, ...LIST_ARGS], { cwd: request.cwd, timeoutMs: LIST_TIMEOUT_MS, killTree: true });
		if (result.spawnError || result.timedOut || result.code !== 0) {
			throw new DispatchError("target-error", `${UNLISTED} The list command failed with code ${result.code ?? "none"}.`);
		}
		const list = parseJsonLoose(result.stdout);
		if (!Array.isArray(list)) throw new DispatchError("target-error", `${UNLISTED} The output was not a JSON array.`);
		const mcpServers = [];
		for (const server of list) {
			if (typeof server?.name !== "string" || server.name === "") {
				throw new DispatchError("target-error", `${UNLISTED} A server in the list has no name.`);
			}
			if (server.enabled !== false) mcpServers.push(server.name);
		}
		return { mcpServers };
	},

	buildInvocation(request, ctx) {
		const sandbox = SANDBOX[request.access];
		if (!sandbox) throw new DispatchError("usage", `Unknown access mode "${request.access}".`);
		const reading = request.access === "read";
		// Pure functions must not guess: a read run without the list is refused here too.
		if (reading && !Array.isArray(ctx.mcpServers)) throw new DispatchError("target-error", UNLISTED);
		const lastMessage = ctx.tempFile("last-message.txt");
		const resuming = Boolean(request.resume);

		const args = resuming ? ["exec", "resume"] : ["exec"];
		args.push("--json", "--skip-git-repo-check", "-o", lastMessage);
		if (!resuming) args.push("-C", request.cwd);
		if (request.model) args.push("-m", request.model);
		if (request.effort) args.push("-c", `model_reasoning_effort="${request.effort}"`);
		args.push("-c", `sandbox_mode="${sandbox}"`);
		// Live runs (H3, 2026-11-20): with the operator's `approval_policy =
		// "on-request"`, a read-only run wrote a file. With "never" the same write
		// was refused. Nobody can answer an approval in headless mode, so "never"
		// is also right for write access. `-c` exists for `exec resume` too.
		args.push("-c", `approval_policy="never"`);
		if (reading) {
			for (const feature of READ_OFF_FEATURES) args.push("--disable", feature);
			for (const name of ctx.mcpServers) args.push("-c", `mcp_servers.${tomlKey(name)}.enabled=false`);
		}
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
			const code = failureCode(detail);
			return { ...failure(code, `Codex failed with code ${result.code}. ${tailText(detail)}`), ...common };
		}

		// The -o file is the primary source: it holds the final message only.
		const fromFile = ctx.tempContents?.[ctx.invocation?.tempFiles?.[0]];
		const text = typeof fromFile === "string" && fromFile.trim() ? fromFile.trimEnd() : lastAgentMessage;
		if (!text && lastError) {
			// Exit 0, no answer, but an `error` event: report the error, not "bad output".
			const code = failureCode(lastError);
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
