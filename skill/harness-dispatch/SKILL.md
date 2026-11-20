---
name: harness-dispatch
description: Send a self-contained task to a different coding agent CLI on this machine (Claude Code, OpenAI Codex, Google Antigravity) and get one JSON result back. Use when the operator asks to dispatch, delegate or hand work to another harness or model family, to get a second opinion from a different vendor's model, or to run a task on a cheaper model that this harness does not offer. Do not use for work that a sub-agent of the current harness can do.
---

# harness-dispatch

This skill sends one task to another coding agent CLI. The other agent works alone and returns one JSON object.
You get the final answer and the token usage. You do not get the steps in between. This keeps your context small.

## Use it

Run the script with Node 22 or later. Use the folder that holds this file:

```
node "<folder of this file>/scripts/hd.mjs" <command> [options]
```

If you do not know the folder of this file, find `harness-dispatch/scripts/hd.mjs` in one of these folders:
`~/.claude/skills`, `~/.codex/skills`, `~/.gemini/config/skills`, `~/.config/opencode/skill`, `~/.zcode/skills`, `~/.agents/skills`.

Use it when:
- the operator asks you to dispatch, delegate or hand over a task;
- you need a second opinion from a model of a different vendor;
- a cheaper model that this harness does not offer can do the work.

Do not use it when a sub-agent of your own harness can do the work, or when the task needs a person to answer questions.

## Commands

| Command | Purpose |
|---|---|
| `run --to <claude\|codex\|antigravity>` | Send a task. Prompt: `--prompt <text>`, `--prompt-file <path>` or stdin. |
| `list` | Show each target, its executable and its version. No model call. |
| `doctor [--to <id>]` | Check: installed, startable, signed in. No model call. |
| `models --to <id>` | List model ids (Antigravity only). No model call. |

Options of `run`: `--model <id>`, `--effort <low|medium|high|xhigh|max>`, `--access <read|write>`,
`--cwd <dir>`, `--resume <session_id>`, `--schema <JSON Schema file>`, `--timeout <seconds>` (default 600),
`--max-chars <n>` (default 20000), `--out <file>`.

Examples. Put the brief in a file and use `--prompt-file`. Use stdin only when you pipe the text yourself:

```
node "<folder of this file>/scripts/hd.mjs" run --to claude --prompt-file brief.md --model sonnet --effort high
node "<folder of this file>/scripts/hd.mjs" run --to codex --prompt-file brief.md --cwd ./repo --schema answer.schema.json
node "<folder of this file>/scripts/hd.mjs" run --to antigravity --prompt-file brief.md --model gemini-4-neon-high
node "<folder of this file>/scripts/hd.mjs" run --to codex --resume <session_id> --prompt "Now check the tests too."
```

Antigravity limits the prompt to 24,000 characters.
`--model` goes to the target unchanged. Use `models --to antigravity` to see valid ids.
`hd` picks the newest installed `codex` program. `list` shows the one it picked.
To force a program, set `HARNESS_DISPATCH_<ID>_PATH` to an absolute path, for example `HARNESS_DISPATCH_CODEX_PATH`.

Access `read` means: Antigravity runs in plan mode with a sandbox (no file writes, read-only commands run).
Codex runs with a read-only sandbox. Claude Code denies each action that needs a prompt; an allow rule
in the project settings can still permit a write (not proved yet). Do not trust `read` as a security wall.

## Write the brief

The other agent knows nothing about your conversation. Write a brief that stands alone:
1. The goal, and the reason for it.
2. The files and folders to read, with paths.
3. The limits: what it must not change.
4. The test that proves completion.
5. The shape of the answer, for example "Reply with a list of defects, one line each."

Do not put secrets in a prompt. The target keeps its own session history, and `hd` keeps the target output in a log file.

## Read the result

`stdout` holds one JSON object. Read these fields first:

| Field | Meaning |
|---|---|
| `ok` | `true` when the target finished the task. |
| `text` | The final answer. It is cut at `--max-chars`; then `truncated` is `true`. |
| `structured` | The parsed answer when you used `--schema`. Else `null`. |
| `session_id` | Use it with `--resume` to continue. |
| `usage`, `cost_usd` | Tokens and cost as the target reports them. `null` means not reported. |
| `model`, `harness`, `access` | What did the work. |
| `error` | `null`, or `{ code, message }`. |
| `denied_actions` | Actions that the target denied, such as `"command: Bash"`. `[]` when none. |
| `log_file` | The raw output of the target. Read it when `text` is cut or `error` is unclear. |

Exit codes: 0 done. 1 the target failed (`target-error`, `timeout`, `bad-output`, `not-authenticated`,
`permission-denied`, `usage-limit`). 2 bad usage (`usage`, `prompt-too-long`).
3 the target is not available (`not-installed`, `not-startable`). 4 the depth guard refused (`depth-exceeded`).

- `usage-limit`: the target hit a usage or rate limit. Do not dispatch to that target again until it resets.
  Tell the operator, with the reset time from `error.message`. Use another target, or wait.
- `permission-denied`: the target needed a permission that it cannot ask for in headless mode. `denied_actions`
  names it. Tell the operator. The operator can add an allow rule in the settings of the target. Do not retry.

## Rules

- Use `--access read` unless the operator approved a write for this task. Access `write` lets the target edit files in `--cwd`.
- Run `doctor --to <id>` one time before the first dispatch to a target.
  If it says `authenticated: false`, tell the operator. Do not try to sign in for them.
- A dispatched agent cannot dispatch again. The variable `HARNESS_DISPATCH_DEPTH` stops loops. Do not change it.
- A harness whose shell needs an allow rule cannot run `hd` in headless mode without it. Antigravity needs
  `command(node)` under `permissions.allow` in its settings. Without it the call is denied.
- Check the result yourself. A dispatched answer is a report, not a proof. Run the test that the brief names.
- After a failure, do not send the same task more than one more time. Read `error` and `log_file` first.
- A dispatch can take minutes. Set `--timeout` for the task.
- Tell the operator which target and model did the work, and the usage.
