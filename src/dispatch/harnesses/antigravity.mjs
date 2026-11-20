// Adapter: Google Antigravity (`agy`).
//
// Flags come from `agy --help` (1.5.13), read on 2026-11-20:
//   -p <prompt>            print mode: one prompt, one run
//   --output-format json   one JSON object on stdout
//   --print-timeout <d>    time limit of the run, a Go duration such as 600s
//   --mode                 plan (advice only) | accept-edits (write)
//   --settings <json|path> settings for this session only, never saved
//   --conversation <id>    continue a conversation
//   --json-schema <path>   JSON Schema (a path or the schema text)
// The prompt is an argument of `-p`, so it is limited in length. A longer
// prompt is refused. The `stream-json` mode would lift this limit. It is a
// later extension.
//
// Verified by live runs (H3): `-p` takes the prompt, `--conversation` resumes,
// `--json-schema` fills `structured_output`, and `--mode accept-edits` writes.
//
// `agy` installs to %LOCALAPPDATA%\agy\bin and may be missing from PATH in a
// shell that started before the install.

import { join } from "node:path";
import { DispatchError } from "../envelope.mjs";
import { deniedActions, failureCode, parseJsonLoose, pickNumber, pickString, tailText } from "../parse.mjs";
import { EFFORTS } from "../request.mjs";
import { resolveNamed } from "../resolve.mjs";

export const MAX_PROMPT_CHARS = 24000;
// Read access is "--mode plan" plus a session deny rule for every command.
// Live evidence (H3, 2026-11-20):
//  - Plan mode alone is advice to the model. A forceful prompt ran `npm test`
//    (an allow rule approved it), and the command wrote a file.
//  - "--sandbox" does not enforce read access. The first command failed in the
//    sandbox, the agent called it again, and the second call ran unsandboxed.
//    The allow rule also grants the "unsandboxed(...)" permission.
//  - A deny rule wins over an allow rule: "command(*)" gave "Permission denied
//    ... Matches user-configured deny rule". The pattern "command" without
//    "(*)" does not match.
//  - In plan mode a hook refuses the `write_file` tool.
// So a read run can read and search files. It cannot run a command, and it
// cannot write a file. "--settings" is for the session only and is not saved.
export const READ_SETTINGS = JSON.stringify({ permissions: { deny: ["command(*)"] } });
const MODE_ARGS = { read: ["--mode", "plan", "--settings", READ_SETTINGS], write: ["--mode", "accept-edits"] };

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
		const modeArgs = MODE_ARGS[request.access];
		if (!modeArgs) throw new DispatchError("usage", `Unknown access mode "${request.access}".`);
		if (request.prompt.length > MAX_PROMPT_CHARS) {
			throw new DispatchError(
				"prompt-too-long",
				`The prompt has ${request.prompt.length} characters. The limit for Antigravity is ${MAX_PROMPT_CHARS}. Write a shorter brief and name files to read.`,
			);
		}
		const args = ["-p", request.prompt, "--output-format", "json", "--print-timeout", `${request.timeoutSec}s`];
		if (request.model) args.push("--model", request.model);
		if (request.effort) args.push("--effort", request.effort);
		args.push(...modeArgs);
		if (request.resume) args.push("--conversation", request.resume);
		if (request.schema) args.push("--json-schema", request.schema.path);
		return { args, stdin: null, tempFiles: [] };
	},

	parseOutput(result) {
		const object = parseJsonLoose(result.stdout);
		if (!object || Array.isArray(object)) {
			const text = `${result.stderr}\n${result.stdout}`;
			if (result.code !== 0) {
				return failure(failureCode(text), `Antigravity exited with code ${result.code}. ${tailText(text)}`);
			}
			return failure("bad-output", "Antigravity did not print one JSON object on stdout.");
		}

		const usage = object.usage ?? {};
		const denied = deniedActions(object.denied_actions);
		const common = {
			session_id: pickString(object.conversation_id),
			model: null,
			cost_usd: null,
			denied_actions: denied,
			usage: {
				input_tokens: pickNumber(usage.input_tokens),
				output_tokens: pickNumber(usage.output_tokens),
				cache_read_tokens: pickNumber(usage.cache_read_tokens),
				reasoning_tokens: pickNumber(usage.thinking_tokens),
				total_tokens: pickNumber(usage.total_tokens),
			},
		};

		// Headless mode cannot ask for a permission. The tool call is denied, the
		// run ends with status SUCCESS and an empty answer, and `denied_actions`
		// names what was needed. That is a failure of the task, not an answer.
		// The stderr text suggests a bypass flag. It is not copied to the message.
		if (denied.length > 0 && pickString(object.response) === null && (object.structured_output ?? null) === null) {
			return {
				...failure(
					"permission-denied",
					`Antigravity made no answer. It needed permission for: ${denied.join(", ")}. It runs headless and cannot ask. The operator can add an allow rule in the permissions.allow list of the Antigravity settings, for example command(<program>).`,
				),
				...common,
			};
		}

		// Good only with exit code 0 and status SUCCESS (contract section 7.3).
		if (result.code !== 0 || object.status !== "SUCCESS") {
			const reported = typeof object.error === "string" ? object.error : pickString(object.error?.message) ?? "";
			const detail = `${reported}\n${result.stderr}`;
			const code = failureCode(detail);
			const status = pickString(object.status) ?? "unknown";
			return { ...failure(code, `Antigravity failed. Exit code ${result.code}, status ${status}. ${tailText(detail)}`), ...common };
		}
		const text = pickString(object.response);
		const structured = object.structured_output ?? null;
		if (text === null && structured === null) {
			return { ...failure("bad-output", "The Antigravity result has no response and no structured output."), ...common };
		}
		// A real run answered "OK\n". The final newline is not part of the answer.
		return { ok: true, text: (text ?? "").trimEnd(), structured, error: null, ...common };
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
