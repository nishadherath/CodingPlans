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
- Harnesses that can hold the skill: Claude Code, Codex, Antigravity, ZCode, OpenCode, and others that read a `SKILL.md` folder.
- **Do not install the skill.** The operator installs it after acceptance.

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
| 1 | The target started and failed | `target-error`, `timeout`, `bad-output`, `not-authenticated` |
| 2 | Bad usage | `usage`, `prompt-too-long` |
| 3 | The target is not available | `not-installed`, `not-startable` |
| 4 | The depth guard refused | `depth-exceeded` |

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
  "log_file": "path"
}
```

1. `model` and `effort` are the requested values, or the values that the target reports. Use `null` when neither exists.
2. A usage field that the target does not report is `null`. Do not estimate.
3. `cost_usd` is set only when the target reports a cost.
4. `text` longer than `--max-chars` is cut. Then `truncated` is `true`. The full output is in `log_file`.
5. `log_file` holds the raw `stdout` and `stderr` of the target. Write it under the OS temporary directory, in `harness-dispatch/`.
6. `error` is `null` or `{ "code": "...", "message": "..." }`. Do not put an account email or raw authentication text in the envelope.

## 6. Adapter interface

Each file in `src/dispatch/harnesses/` exports one object:

```js
export default {
  id, name, cli,                      // "codex", "OpenAI Codex CLI", "codex"
  capabilities: { resume, schema, models, efforts: [...] },
  resolve(env),                       // -> { command, prefixArgs } with an absolute command, or undefined
  buildInvocation(request, ctx),      // -> { args, stdin, tempFiles }   pure, no I/O except ctx.tempFile()
  parseOutput(result, ctx),           // -> { ok, text, session_id, usage, structured, cost_usd, model, error }  pure
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
| `--access read` | `--permission-mode manual` |
| `--access write` | `--permission-mode acceptEdits` |
| `--resume` | `--resume <session_id>` |
| `--schema` | `--json-schema <schema text>` |
| `--cwd` | Process working directory |

Output: one JSON object. Expected fields (not verified by a live run today): `result`, `is_error`, `session_id`, `usage`, `total_cost_usd`.

### 7.2 OpenAI Codex (`codex` 0.154.0)

| Request | Arguments |
|---|---|
| Base | `exec --json --skip-git-repo-check -o <temp file>` |
| Prompt | `-` as the prompt argument, text on `stdin` |
| `--model` | `-m <id>` |
| `--effort` | `-c model_reasoning_effort="<level>"` |
| `--access read` | `-c sandbox_mode="read-only"` |
| `--access write` | `-c sandbox_mode="workspace-write"` |
| `--resume` | `exec resume <session_id> -` with the same options. `resume` has no `-s` and no `-C` flag. |
| `--schema` | `--output-schema <file>` |
| `--cwd` | `-C <dir>` on a new session. Process working directory on `resume`. |

Output: JSON Lines. Take the final answer from the `-o` file. Take the session id and usage from the events. Expected event names (not verified today): `thread.started` with `thread_id`, `item.completed` with `item.type` `agent_message`, `turn.completed` with `usage`, `error`, `turn.failed`.

Windows: npm installs `codex` as a shim. Resolve it in this order: a real `codex.exe` on `PATH`; else read `codex.cmd` on `PATH`, find the `.js` entry that it names, and start `process.execPath` with that file. This order uses the official launcher and needs no copy.

### 7.3 Google Antigravity (`agy` 1.5.12)

| Request | Arguments |
|---|---|
| Base | `-p <prompt> --output-format json --print-timeout <seconds>s` |
| Prompt | Argument of `-p`. If the prompt is longer than 24,000 characters, stop with `prompt-too-long`. |
| `--model`, `--effort` | `--model <slug>`, `--effort <level>` |
| `--access read` | `--mode plan` |
| `--access write` | `--mode accept-edits` |
| `--resume` | `--conversation <id>` |
| `--schema` | `--json-schema <path>` |
| `--cwd` | Process working directory |
| Models | `agy models` prints `<slug><TAB><label>` lines after one status line |

Output: one JSON object with `conversation_id`, `status`, `response`, `error`, `duration_seconds`, `num_turns`, `structured_output`, `usage` (`input_tokens`, `output_tokens`, `thinking_tokens`, `cache_read_tokens`, `total_tokens`). The run is good only when the exit code is 0 and `status` is `SUCCESS`. Exit code 1 is a general failure or an unknown model.

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

| Target id | Folder (seen on this machine on 2026-11-20) |
|---|---|
| `claude` | `~/.claude/skills/harness-dispatch` |
| `codex` | `~/.codex/skills/harness-dispatch` |
| `antigravity` | `~/.gemini/config/skills/harness-dispatch` |
| `opencode` | `~/.config/opencode/skill/harness-dispatch` |
| `zcode` | `~/.zcode/skills/harness-dispatch` |
| `agents` | `~/.agents/skills/harness-dispatch` |
| `cline` | No skill folder found. Print "not supported yet". |

1. The default is a dry run that prints each planned copy. A copy needs `--apply`.
2. `--target <id>` selects targets. It can occur more than one time. `--home <dir>` replaces the home directory, for tests.
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
7. Installer: dry run and `--apply` against a temporary `--home`.

Done means: `npm test` passes, `npm run build:dist` leaves no difference in the committed bundles, and the handoff note lists each deviation from this contract with its reason.

## 13. Not verified, and gates

1. The JSON field names of `claude` and `codex` output in sections 7.1 and 7.2 come from memory and from the existing code. A live probe must confirm them. A live probe uses model quota, so the operator must approve it.
2. The meaning of `--mode plan` in `agy` and of `--permission-mode manual` in `claude` for a read-only task is taken from the help text only.
3. `hd doctor` authentication checks for `agy`: no status command is known. Report `unknown` if there is none.
4. Gates for every session: a live dispatch, an installer run with `--apply`, `git push`, a release, and a message to an external party.
