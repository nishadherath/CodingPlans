# Usage

This document lists each command and flag of `hd`, the result envelope, and the error codes.
Back to the [README](../README.md). Install first: [install](install.md). Safety: [safety](safety.md).

In this document, `hd` means one of these two commands. They behave the same.

```powershell
node bin/harness-dispatch.mjs <command> ...                       # in this repository
node <skill folder>/scripts/hd.mjs <command> ...                  # the installed skill
```

`stdout` holds one JSON object and one newline. Diagnostics go to `stderr`.

## Commands

| Command | Purpose | Model call |
|---|---|---|
| `hd run --to <id> ...` | Send a task to a target. | Yes |
| `hd list` | Each target, its program, how it was found, its version. | No |
| `hd doctor [--to <id>]` | Installed, startable, signed in. | No |
| `hd models --to <id>` | Model ids. Only Antigravity can list them. For the others the result says so. | No |
| `hd help` | Print the help. | No |
| `hd --version` | Print the version (`0.2.1`). | No |

Target ids: `claude`, `codex`, `antigravity`.

`doctor` sets `authenticated` to `true`, `false` or `null`. `null` means that the target has no sign-in check. Antigravity has none, so its value is `null`.
The exit code of `doctor` follows the worst target: 3 when a target is not available, 1 when a target is not signed in, else 0.

## Flags of `run`

| Flag | Meaning | Default |
|---|---|---|
| `--to <id>` | The target. Required. | none |
| `--prompt <text>` | The prompt as text. | none |
| `--prompt-file <path>` | The prompt from a file. | none |
| `--model <id>` | Model id. It goes to the target unchanged. It cannot start with `-`. | the target default |
| `--effort <level>` | `low`, `medium`, `high`, `xhigh` or `max`. The target decides what it accepts. | the target default |
| `--access <read\|write>` | `read` or `write`. See [safety](safety.md). | `read` |
| `--cwd <dir>` | The working directory of the target. | the current directory |
| `--resume <session_id>` | Continue an earlier session. | new session |
| `--schema <file>` | A JSON Schema file. The answer goes to `structured`. | none |
| `--timeout <seconds>` | A whole number from 1 to 86400. | 600 |
| `--max-chars <n>` | Cut `text` to this length. | 20000 |
| `--out <file>` | Also write the envelope to this file. | none |

A flag can be given one time only. `--flag=value` is accepted.

## Give the prompt

Use one of three ways. Do not combine `--prompt` and `--prompt-file`.

1. `--prompt <text>` for a short prompt.
2. `--prompt-file <path>` for a brief. This is the best way for a long text.
3. Stdin, when you give neither flag and pipe text to `hd`.

With no flag and no piped text, `hd` stops with `usage`. An empty prompt is also `usage`.
Antigravity takes the prompt as a command line argument. It limits the prompt to 24,000 characters. A longer prompt gives `prompt-too-long`.
A very long prompt or schema can also exceed the command line limit of the operating system. That gives `prompt-too-long` too.

## One example for each target

These commands use your plan quota. Run them yourself.

```powershell
node bin/harness-dispatch.mjs run --to claude --prompt-file brief.md --model sonnet --effort high
node bin/harness-dispatch.mjs run --to codex --prompt-file brief.md --cwd ./repo --schema answer.schema.json
node bin/harness-dispatch.mjs models --to antigravity
node bin/harness-dispatch.mjs run --to antigravity --prompt-file brief.md --model <id from models>
node bin/harness-dispatch.mjs run --to codex --resume <session_id> --prompt "Now check the tests too."
```

A model id must exist for your account. Use `hd models --to antigravity` to see the ids of Antigravity.

## The result envelope

Each `run` prints the same fields, for a success and for a failure.

| Field | Meaning |
|---|---|
| `schema` | Always `harness-dispatch/1`. |
| `ok` | `true` when the target finished the task. |
| `harness` | The target id. |
| `model`, `effort` | The requested values, or the values that the target reports. `null` when neither exists. |
| `access` | `read` or `write`. |
| `session_id` | Use it with `--resume`. `null` when the target gave none. |
| `text` | The final answer. |
| `structured` | The parsed answer when you used `--schema`. Else `null`. |
| `truncated` | `true` when `text` was cut at `--max-chars`. |
| `usage` | `input_tokens`, `output_tokens`, `cache_read_tokens`, `reasoning_tokens`, `total_tokens`. A field that the target does not report is `null`. `hd` does not estimate. |
| `cost_usd` | The cost, only when the target reports it. Else `null`. |
| `duration_ms` | Time of the run. |
| `exit_code` | The exit code of `hd`. |
| `error` | `null`, or `{ "code", "message" }`. |
| `denied_actions` | Actions that the target denied, for example `"command: Bash"`. `[]` when none. |
| `log_file` | The raw `stdout` and `stderr` of the target. `null` when no file was written. |

The log file is in the temporary folder of the operating system, in `harness-dispatch/`. It can hold private code. `hd` does not delete it. Delete it when you no longer need it.
The envelope holds no account email and no raw authentication text.

A run that has an answer and a denied action is still `ok`. A run with no answer and a denied action is `permission-denied`.

## Exit codes and error codes

| Exit code | Meaning | `error.code` values |
|---|---|---|
| 0 | The target finished the task. | none |
| 1 | The target started and failed. | `target-error`, `timeout`, `bad-output`, `not-authenticated`, `permission-denied`, `usage-limit` |
| 2 | Bad usage. | `usage`, `prompt-too-long` |
| 3 | The target is not available. | `not-installed`, `not-startable` |
| 4 | The depth guard refused. | `depth-exceeded` |

The cause and the action for each code are in [troubleshooting](troubleshooting.md).

## `--resume`, `--schema`, `--access`

- `--resume <session_id>` continues a session. Use the `session_id` of an earlier result, with the same `--to`.
- `--schema <file>` passes a JSON Schema to the target. The parsed answer is in `structured`. The file must be valid JSON, or `hd` stops with `usage`.
- `--access read` is the default. `--access write` lets the target edit files in `--cwd`. Read [safety](safety.md) before you use it.

## The depth guard

A dispatched agent can have this skill too. Without a guard, it could dispatch back, with no person at a prompt.
`hd` passes `HARNESS_DISPATCH_DEPTH` plus 1 to the target. A `run` is refused with `depth-exceeded` (exit 4) when the depth is equal to or more than `HARNESS_DISPATCH_MAX_DEPTH`.
The default maximum is 1. So a dispatched agent cannot dispatch. A depth that is not a number counts as the maximum.

## Environment variables

| Variable | Meaning |
|---|---|
| `HARNESS_DISPATCH_<ID>_PATH` | An absolute path to the program of a target, for example `HARNESS_DISPATCH_CODEX_PATH`. `<ID>` is the upper-case target id. It wins over the search. A relative path or a path with quotes gives `usage`. A path that does not exist gives `not-installed`. |
| `HARNESS_DISPATCH_DEPTH` | The current depth. `hd` sets it for the target. Do not change it. |
| `HARNESS_DISPATCH_MAX_DEPTH` | The maximum depth. Default 1. |

Without the path variable, `hd` finds the program on `PATH` and in known folders. For `codex` it takes the highest version among all copies that it finds. `hd list` shows the one that it chose.

## Write a good brief

The other agent knows nothing about your conversation. Write a brief that stands alone.

1. The goal, and the reason for it.
2. The files and folders to read, with paths.
3. The limits: what the agent must not change.
4. The test that proves completion.
5. The shape of the answer, for example "Reply with a list of defects, one line each."

Do not put secrets in a brief. Do not put content from a source that you do not trust in a brief. Check the answer yourself: it is a report, not a proof.
