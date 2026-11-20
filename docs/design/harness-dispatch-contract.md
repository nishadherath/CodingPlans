# harness-dispatch: contract, version 1

| Item | Value |
|---|---|
| Date | 2026-11-20 |
| Author | Stage 0 session (`claude-fable-5-2`) |
| Status | Approved direction from the operator. Implementation not started. |
| Replaces | The staged plan in `docs/analysis/2026-11-20-project-assessment.md`, section 7 |

## 1. Goal

The operator uses many coding agent harnesses on one machine. An agent in one harness must be able to send a task to a different harness and get the result.

This repository becomes a **skill** named `harness-dispatch`. The skill is one instruction file and one script with no dependencies. The operator installs the same skill in each harness.

- Dispatch targets in version 1: Claude Code (`claude`), OpenAI Codex (`codex`), Google Antigravity (`agy`).
- Dispatch targets later: GLM ZCode, OpenCode, Cline.
- Harnesses that can hold the skill: Claude Code, Codex, Antigravity, ZCode, OpenCode, Cline, DeepSeek Harness, and others that read a `SKILL.md` folder.
- The installer changes a harness folder only with `--apply`. The operator approves each such run.

## 2. Principles

1. One command in, one JSON object out. The calling agent gets the final answer and the token usage only. This keeps the caller's context small.
2. The script starts a target only by absolute executable path, with no shell. This is the lesson of this repository (Windows shims do not start by bare name).
3. The default access is read-only. Write access is an explicit option. Version 1 has no option that removes all permission checks.
4. A dispatched agent cannot dispatch again by default. A depth guard stops loops between harnesses.
5. No model id is fixed in code. `--model` goes to the target unchanged.
6. Each wait has a time limit. A timeout stops the full process tree.
7. A new target is one new adapter file and one registry line.

## 3. Repository layout

```
skill/harness-dispatch/SKILL.md          instructions for the calling agent
skill/harness-dispatch/scripts/hd.mjs    generated single-file bundle (committed)
src/dispatch/cli.mjs                     argument parser, exports main(argv, io)
src/dispatch/index.mjs                   dispatch(request, deps) orchestration
src/dispatch/request.mjs                 validation and defaults
src/dispatch/envelope.mjs                result envelope
src/dispatch/guard.mjs                   depth guard
src/dispatch/resolve.mjs                 executable resolution
src/dispatch/harnesses/index.mjs         registry
src/dispatch/harnesses/claude.mjs
src/dispatch/harnesses/codex.mjs
src/dispatch/harnesses/antigravity.mjs
bin/harness-dispatch.mjs                 three lines: import main, run it
scripts/install-skill.mjs                installer, dry run by default
test/dispatch/*.test.mjs
test/fixtures/<harness>/*                captured or synthetic target output
```

Reuse `src/util/exec.mjs` and `src/detect/cli.mjs`. Change them where this contract requires it.

The existing `coding-plans` commands stay. Correct only defects D1 and D2 of the assessment so that the command starts. All other Cline repair work waits until Cline becomes a target.

## 4. Command line

```
hd run --to <claude|codex|antigravity>
       [--prompt <text> | --prompt-file <path>]      default: read the prompt from stdin
       [--model <id>] [--effort <low|medium|high|xhigh|max>]
       [--access <read|write>]                       default: read
       [--cwd <dir>]                                 default: current directory
       [--resume <session_id>]
       [--schema <path to JSON Schema file>]
       [--timeout <seconds>]                         default: 600
       [--max-chars <n>]                             default: 20000
       [--out <file>]                                also write the envelope to this file
hd list                      targets: id, installed, executable path, version. No model call.
hd doctor [--to <id>]        installed, startable, authenticated. No model call.
hd models --to <id>          model ids, where the target CLI can list them
hd help | hd --version
```

Rules:

1. `stdout` holds exactly one JSON object and one newline. Diagnostics go to `stderr`.
2. An unknown flag, a missing value, or an unknown target gives exit code 2.
3. `bin/harness-dispatch.mjs` and the bundle `hd.mjs` have the same behaviour.

Exit codes:

| Code | Meaning | `error.code` values |
|---|---|---|
| 0 | The target completed the task | none |
| 1 | The target started and failed | `target-error`, `timeout`, `bad-output`, `not-authenticated`, `permission-denied`, `usage-limit` |
| 2 | Bad usage | `usage`, `prompt-too-long` |
| 3 | The target is not available | `not-installed`, `not-startable` |
| 4 | The depth guard refused | `depth-exceeded` |

Two codes need a decision from the caller:

- `permission-denied`: the target needed a permission that its headless mode cannot ask for. The message names the denied actions. The operator can add an allow rule in the settings of the target. Do not try again with a bypass flag.
- `usage-limit`: the target reported a usage or rate limit. Do not dispatch again to that target until the limit resets. The message can hold the reset time.

Environment variable `HARNESS_DISPATCH_<ID>_PATH` (for example `HARNESS_DISPATCH_CODEX_PATH`; `<ID>` is the upper-case target id): an absolute path to the executable of that target. It wins over the search of section 7. A relative value gives `usage` (exit 2). A path that does not exist gives `not-installed` (exit 3). The override is not compared by version.

## 5. Result envelope

```json
{
  "schema": "harness-dispatch/1",
  "ok": true,
  "harness": "codex",
  "model": null,
  "effort": null,
  "access": "read",
  "session_id": "string or null",
  "text": "final answer of the target",
  "structured": null,
  "truncated": false,
  "usage": { "input_tokens": 0, "output_tokens": 0, "cache_read_tokens": 0, "reasoning_tokens": 0, "total_tokens": 0 },
  "cost_usd": null,
  "duration_ms": 0,
  "exit_code": 0,
  "error": null,
  "denied_actions": [],
  "log_file": "path"
}
```

1. `model` and `effort` are the requested values, or the values that the target reports. Use `null` when neither exists.
2. A usage field that the target does not report is `null`. Do not estimate.
3. `cost_usd` is set only when the target reports a cost.
4. `text` longer than `--max-chars` is cut. Then `truncated` is `true`. The full output is in `log_file`.
5. `log_file` holds the raw `stdout` and `stderr` of the target. Write it under the OS temporary directory, in `harness-dispatch/`.
6. `error` is `null` or `{ "code": "...", "message": "..." }`. Do not put an account email or raw authentication text in the envelope.
7. `denied_actions` is an array of strings such as `"command: Bash"`: the actions that the target denied during the run. It is `[]` when there are none, and for each target that does not report them. A run with an answer and a denied action is still `ok`. A run with no answer and a denied action is `permission-denied`.
8. `exit_code` is the exit code of `hd`, from the table in section 4. The raw exit code of the target is in `log_file`.

## 6. Adapter interface

Each file in `src/dispatch/harnesses/` exports one object:

```js
export default {
  id, name, cli,                      // "codex", "OpenAI Codex CLI", "codex"
  capabilities: { resume, schema, models, efforts: [...] },
  resolve(env),                       // -> { command, prefixArgs } with an absolute command, or undefined
  candidates(env),                    // optional: every { command, prefixArgs, via }. diagnose() takes the highest version.
  prepare(request, { command, prefixArgs, exec }),  // optional, async: a no-model call before the run. Its result goes into ctx. A DispatchError stops the run.
  buildInvocation(request, ctx),      // -> { args, stdin, tempFiles }   pure, no I/O except ctx.tempFile()
  parseOutput(result, ctx),           // -> { ok, text, session_id, usage, structured, cost_usd, model, denied_actions, error }  pure
  authCheck: { args, parse },         // optional, no model call
  listModels: { args, parse },        // optional
};
```

`buildInvocation` and `parseOutput` must be pure functions. The tests call them with tables and fixtures.

## 7. Target mappings

All flags below come from the `--help` text of the installed versions, read on 2026-11-20. Read the help text again before you write each adapter.

### 7.1 Claude Code (`claude` 2.1.316)

| Request | Arguments |
|---|---|
| Base | `-p --output-format json --permission-prompts none` |
| Prompt | `stdin` |
| `--model`, `--effort` | `--model <id>`, `--effort <level>` |
| `--access read` | `--permission-mode manual --restricted --strict-mcp-config`, and `--disallowedTools Edit Write NotebookEdit` as the LAST option (three separate values) |
| `--access write` | `--permission-mode acceptEdits` |
| `--resume` | `--resume <session_id>` |
| `--schema` | `--json-schema <schema text>` |
| `--cwd` | Process working directory |

Output: one JSON object. Fields confirmed by live runs (2026-11-20): `result`, `is_error`, `session_id`, `total_cost_usd`, `usage` (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`), `modelUsage` (one key: the model id), `structured_output` (with `--json-schema`) and `permission_denials` (an array of `{ tool_name, tool_use_id, tool_input }`, empty when none). Each `tool_name` goes to `denied_actions`. A run with an answer and denials stays `ok`.

Read access (correction of defect D9). Live evidence, scratch repository with allow rules for `Bash(*)`, `Edit` and `Write`:

- `--permission-mode manual --permission-prompts none` alone ran `npm test` and wrote a file. An allow rule beats the mode. (Claude Code ignores the allow rules of a workspace that is not trusted, so the defect shows in a trusted workspace or with a user rule.)
- `--restricted` removes the shell tools and ignores the settings files, but a rule that arrives by `--settings` still let `Write` work.
- `--restricted --disallowedTools Edit Write NotebookEdit` wrote nothing. A deny rule wins over an allow rule.
- `--strict-mcp-config` keeps MCP servers out, and a read question is still answered.

So a read run has no shell tools, no edit tools, no MCP servers (the config files are ignored and `--strict-mcp-config` is set), and no hooks from the user, project or local settings. Managed settings and `--settings` still apply (`claude --help`). Side effect seen in every run without `--restricted`: the hooks of the operator ran.

Write access refuses each shell command that needs approval, because nobody can answer a prompt (`--permission-prompts none`). A task that must run tests can fail with `--access write`.

### 7.2 OpenAI Codex (`codex` 0.154.0 and 0.167.0-alpha.4.1)

| Request | Arguments |
|---|---|
| Base | `exec --json --skip-git-repo-check -o <temp file>` |
| Prompt | `-` as the prompt argument, text on `stdin` |
| `--model` | `-m <id>` |
| `--effort` | `-c model_reasoning_effort="<level>"`. All five levels (`low`, `medium`, `high`, `xhigh`, `max`) are passed on. The service decides what a model accepts. |
| `--access read` | `-c sandbox_mode="read-only"` |
| `--access write` | `-c sandbox_mode="workspace-write"` |
| Approval, both modes | `-c approval_policy="never"` on `exec` and on `exec resume` |
| Hardening, `--access read` only | `--disable plugins --disable apps --disable computer_use --disable browser_use --disable browser_use_external --disable in_app_browser --disable hooks`, and `-c mcp_servers.<name>.enabled=false` for each enabled MCP server (a quoted TOML key when the name has a character outside `A-Za-z0-9_-`). On `exec` and on `exec resume`. |
| Server list, `--access read` only | One call before the run: `<codex> mcp list --json --disable plugins --disable apps` (no model call, limit 20 s, tree kill). Output: a JSON array of `{ name, enabled, disabled_reason, transport, startup_timeout_sec, tool_timeout_sec, auth_status }`. |
| `--resume` | `exec resume <session_id> -` with the same options. `resume` has no `-s` and no `-C` flag. |
| `--schema` | `--output-schema <file>` |
| `--cwd` | `-C <dir>` on a new session. Process working directory on `resume`. |

Output: JSON Lines. Take the final answer from the `-o` file, else from the LAST `agent_message` item (a run can have several; a real schema run had two). Take the session id and usage from the events. Events confirmed by live runs (2026-11-20): `thread.started` with `thread_id`, `item.completed` with `item.type` `agent_message` (or `error`, a warning, or `command_execution`), `turn.completed` with `usage` (`input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `output_tokens`, `reasoning_output_tokens`), `error`, `turn.failed`. `total_tokens` is not reported: it stays `null`.

Approval policy. Live evidence: with the operator's `approval_policy = "on-request"`, `-s read-only` still let `Set-Content` write a file. With `-c approval_policy="never"` the same command got "Access to the path ... is denied". So every run passes `approval_policy="never"`. It is right for write access too: nobody can answer an approval in headless mode.

Read hardening. The sandbox covers shell commands and file writes only. Live evidence (2026-11-20, Codex 0.167.0, `codex mcp list --json`, no model call):

| Flags | Servers listed as enabled |
|---|---|
| none | `cua_repl`, `node_repl`, `trail` |
| `--disable computer_use`, or four `plugins."<name>".enabled=false` | the same three |
| `--disable plugins` | `node_repl`, `trail` |
| `--disable plugins` and `-c mcp_servers={}` | `node_repl`, `trail` (the override does not remove them) |
| `--disable plugins` and `-c mcp_servers.<name>.enabled=false` for each | none |

An override for a server that the user config does not define fails ("invalid transport"). So `hd` lists the servers first and switches off only the ones that exist. Two live runs with the flags above: a forced prompt saw no computer-use tool, no connected-app tool and no MCP server tool, and a file write was refused; a read question was answered. **Fail closed:** if the list call fails, times out, is not a JSON array, or holds a server without a name, the read run does not start (`target-error`, "The MCP servers could not be listed"). A write run keeps the plugins and servers of the user and makes no list call. `--ignore-user-config` is not used: it makes every command fail on Windows.

Tools that remain in a hardened read run: `exec_command` and `write_stdin` (sandboxed), `apply_patch` (refused by the sandbox), `view_image`, **the built-in web tool** (it opened a web page), image generation, the goal tools, the multi-agent tools and the MCP resource list tools. Residual risk: a hostile prompt could use the web tool to send data out. No flag for it was tested.

Failure events were confirmed by live runs (2026-11-20): `error` and `turn.failed` carry the message (a JSON document, or text), and `item.completed` with `item.type` `error` is a warning. A usage limit arrives as `error` and `turn.failed` with the text "You've hit your usage limit ... try again at 12:10 PM". It maps to `usage-limit`. The success events are still not confirmed by a live run.

Choice of the program. One machine can hold several copies of `codex`, with different versions. The service can refuse a model for an old copy (live evidence: 0.154.0 refused `gpt-6.2-astra` and `gpt-5.5` for a ChatGPT account; the Codex Desktop copy 0.167.0-alpha.4.1 accepted the model). So `resolve` collects all candidates and takes the highest version:

1. The override `HARNESS_DISPATCH_CODEX_PATH`, when set. It ends the search.
2. Each real `codex.exe` on `PATH`; the entry file of each npm `codex.cmd` shim on `PATH` (start `process.execPath` with that file: the official launcher, no copy needed); the folders `~/.local/bin` and `%LOCALAPPDATA%\Programs\codex`; and, on Windows, `%LOCALAPPDATA%\OpenAI\Codex\bin\*\codex.exe` (the Codex Desktop app).
3. Each candidate runs `--version` one time for each process. The numbers are compared as numbers. A pre-release is lower than the same release (`0.167.0-alpha.4.1` is lower than `0.167.0`, and higher than `0.154.0`). A candidate that cannot answer is skipped. A tie goes to the candidate that comes first in the list above.
4. With one candidate, no probe runs in `dispatch`. `hd list` shows the selected path (`executable`), how it was found (`via`) and its `version`.

Other targets use the same override and a one-candidate list.

### 7.3 Google Antigravity (`agy` 1.5.13)

| Request | Arguments |
|---|---|
| Base | `-p <prompt> --output-format json --print-timeout <seconds>s` |
| Prompt | Argument of `-p`. If the prompt is longer than 24,000 characters, stop with `prompt-too-long`. |
| `--model`, `--effort` | `--model <slug>`, `--effort <level>` |
| `--access read` | `--mode plan --settings {"permissions":{"deny":["command(*)"]}}` (the JSON is one argument) |
| `--access write` | `--mode accept-edits` |
| `--resume` | `--conversation <id>` |
| `--schema` | `--json-schema <path>` |
| `--cwd` | Process working directory |
| Models | `agy models` prints `<slug><TAB><label>` lines after one status line |

Read access. Live evidence (2026-11-20, a scratch repository whose `npm test` writes a file, and settings that allow `command(npm test)`):

- `--mode plan` alone is advice to the model. A forceful prompt made `agy` run `npm test`, and the command wrote a file.
- `--mode plan --sandbox` does not enforce read access. The first call failed in the sandbox (EPERM). The agent called the command again, and it ran unsandboxed with exit 0. The allow rule also grants the `unsandboxed(...)` permission. So `--sandbox` is not used.
- `--settings {"permissions":{"deny":["command(*)"]}}` works. The command tool answered "Permission denied for unsandboxed(npm test). Matches user-configured deny rule." No file was written. A deny rule wins over an allow rule. The pattern `command` without `(*)` does not match: the command ran.
- In plan mode a hook refuses the `write_file` tool ("Plan mode is on, and write_file changes the workspace").

So read access is `--mode plan` plus the session deny rule. `--settings` is for the session only and is never saved. **A read dispatch to Antigravity can read and search files. It cannot run any shell command and cannot write files.** MCP and browser tools were not tested in read mode: the deny rule covers `command(*)` only. A task that needs a command (a test run, `git log`) needs `--access write`. If the agent reports a denial in its answer, the run is still `ok`: the agent answered. Write access is `--mode accept-edits` with no deny rule. Also: `--mode plan` puts `/plan ` in front of the prompt that the model sees.

Output: one JSON object with `conversation_id`, `status`, `response`, `error`, `duration_seconds`, `num_turns`, `structured_output`, `usage` (`input_tokens`, `output_tokens`, `thinking_tokens`, `cache_read_tokens`, `total_tokens`), and `denied_actions` (array of `{ action, display_name }`). The run is good only when the exit code is 0 and `status` is `SUCCESS`. Exit code 1 is a general failure or an unknown model.

Denied actions. In headless mode `agy` cannot ask for a permission. It denies the tool call, prints `denied_actions`, and a line on `stderr` that names the missing permission. The run can still have `status` `SUCCESS` and an empty `response`. When `response` is empty and `denied_actions` is not empty, `hd` reports `ok` false, `error.code` `permission-denied` (exit 1), and a message that names the denied actions and says that the operator can add an allow rule under `permissions.allow` in the `agy` settings. The message does not repeat the bypass flag that the `stderr` text suggests. `denied_actions` of the envelope holds one string for each record, such as `"command: Bash"`.

A caller that runs `hd` itself under `agy` needs an allow rule for `node` (`command(node)`), or the shell call is denied.

Live checks (2026-11-20): `-p <prompt>`, `--conversation`, `--json-schema` (fills `structured_output`) and `--mode accept-edits` (writes a file) all work.

`agy` is a real executable at `%LOCALAPPDATA%\agy\bin\agy.exe`. A shell that started before the install does not have it on `PATH`. Check that location when `PATH` does not have it.

Later work, not in version 1: the `stream-json` mode for long prompts and warm sessions, and `agy acp`.

## 8. Safety rules

1. **Depth guard.** Read `HARNESS_DISPATCH_DEPTH` (default 0). Refuse `run` when the depth is equal to or more than `HARNESS_DISPATCH_MAX_DEPTH` (default 1). Start the target with the depth plus 1.
2. **No bypass flags.** Do not pass `--dangerously-skip-permissions`, `--dangerously-bypass-approvals-and-sandbox`, or `bypassPermissions`.
3. **No shell.** Use `spawn` with an argument array and an absolute command.
4. **Timeout.** Stop the process tree. On Windows use `%SystemRoot%\System32\taskkill.exe /PID <pid> /T /F`. On POSIX start the child in its own process group and signal the group.
5. **Temporary files.** Delete them after the run. Keep the log file.
6. **Environment.** Give the target the caller's environment plus the depth variable. Do not print the environment.

## 9. The skill file

`skill/harness-dispatch/SKILL.md` requirements:

1. Front matter with `name: harness-dispatch` and this description:
   `Send a self-contained task to a different coding agent CLI on this machine (Claude Code, OpenAI Codex, Google Antigravity) and get one JSON result back. Use when the operator asks to dispatch, delegate or hand work to another harness or model family, to get a second opinion from a different vendor's model, or to run a task on a cheaper model that this harness does not offer. Do not use for work that a sub-agent of the current harness can do.`
2. Not more than 120 lines. Plain Markdown. No tool name that only one harness has.
3. It tells the agent to run `node "<folder of this file>/scripts/hd.mjs" ...`.
4. It contains: when to use it and when not, the `run` command with one example for each target, the envelope fields that matter, the exit codes, and the rules below.
5. Rules for the calling agent:
   - Write a brief that stands alone: goal, files, constraints, the test that proves completion, and the shape of the answer.
   - Use `--access read` unless the operator approved a write for this task.
   - Do not put secrets in a prompt.
   - Run `hd doctor --to <id>` one time before the first dispatch to a target.
   - Check the result yourself. A dispatched answer is a report, not a proof.
   - After a failure, do not dispatch the same task more than one more time.
   - Tell the operator which target and model did the work, and the usage.
6. ASD-STE100 writing style.

## 10. The installer

`scripts/install-skill.mjs` copies `skill/harness-dispatch/` into harness skill folders.

| Target id | Folder (proved on this machine on 2026-11-21, stage H5) | Harnesses that read it |
|---|---|---|
| `claude` | `~/.claude/skills/harness-dispatch` | Claude Code |
| `codex` | `~/.codex/skills/harness-dispatch` | Codex |
| `antigravity` | `~/.gemini/config/skills/harness-dispatch` | Antigravity (it does not read the shared folder) |
| `agents` | `~/.agents/skills/harness-dispatch` | ZCode, OpenCode, Cline, DeepSeek Harness |

The ids `zcode`, `opencode`, `cline` and `deepseek` are aliases of the target `agents`. These harnesses have no folder of their own in the installer: a second copy only makes the harness find the skill two times. No target is "unsupported". The installer has no code for the old folders.

1. The default is a dry run that prints each planned copy. A copy needs `--apply`.
2. `--target <id>` selects targets or aliases. It can occur more than one time. One folder gets one step: `--target zcode --target cline` gives one step, for `~/.agents/skills/harness-dispatch`. Without `--target`, the plan has at most four steps (`claude`, `codex`, `antigravity`, `agents`), and each step is skipped when the harness home folder does not exist. The plan names the harnesses that read each folder. An unknown id gives exit code 2. `--home <dir>` replaces the home directory, for tests.
3. `--uninstall` removes only folders that the installer made. A marker file `.harness-dispatch-install.json` proves this.
4. **No session runs the installer with `--apply` on the real home directory.** The operator does that.

## 11. Build

Change `scripts/build-dist.mjs` so that it can build more than one bundle. Add the bundle `skill/harness-dispatch/scripts/hd.mjs` with the entry `src/dispatch/cli.mjs`. The bundle runs `main` when Node starts it as a script. Keep the existing `dist/` outputs.

## 12. Tests and definition of done

No test calls a model. No test writes to the real home directory or to a real `PATH` directory.

1. `buildInvocation`: a table of requests for each adapter, with the exact expected argument array.
2. `parseOutput`: fixtures in `test/fixtures/<harness>/`. Name a fixture `synthetic-*` when it does not come from a real run.
3. `dispatch()` with an injected spawn function: success, non-zero exit, timeout, output that is not JSON, depth guard, target not installed.
4. CLI: usage errors give exit code 2, and `stdout` is one JSON line in each case.
5. Bundle smoke test: `node skill/harness-dispatch/scripts/hd.mjs list` gives exit code 0 and valid JSON.
6. Legacy smoke test: `node bin/coding-plans.mjs help` gives exit code 0.
7. Installer: dry run and `--apply` against a temporary `--home`; the default plan; each alias; one step for one folder; `--uninstall`; an unknown id.

Done means: `npm test` passes, `npm run build:dist` leaves no difference in the committed bundles, and the handoff note lists each deviation from this contract with its reason.

## 13. Not verified, and gates

1. The JSON field names of `claude` and `codex` output in sections 7.1 and 7.2 come from memory and from the existing code. A live probe must confirm them. A live probe uses model quota, so the operator must approve it.
2. Read access was tested live for all three targets (section 7). Claude Code: the old mapping was disproved and replaced (7.1). Codex: the sandbox plus `approval_policy="never"` holds for files and shell; the features and servers switched off in a read run remove computer-use, connected apps and MCP tools; the built-in web tool stays (7.2). For `agy`, `--mode plan` alone was shown NOT to enforce read access (section 7.3); `--mode plan` plus a session deny rule for `command(*)` is the mapping (`--sandbox` was shown not to enforce it).
3. `hd doctor` authentication checks for `agy`: no status command is known. Report `unknown` if there is none.
4. Gates for every session: a live dispatch, an installer run with `--apply`, `git push`, a release, and a message to an external party.
