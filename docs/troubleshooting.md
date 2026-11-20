# Troubleshooting

This document gives the cause and the action for each `error.code`, and for the common problems of an install.
Back to the [README](../README.md). See also [usage](usage.md) and [safety](safety.md).

First step for each failure: read `error.message`, then read the file in `log_file`. The log holds the raw output of the target.
Run `hd doctor` to see if a target is installed, startable and signed in. It starts no model.

## Error codes

| `error.code` | Exit | Cause | Action |
|---|---|---|---|
| `usage` | 2 | A flag is wrong or missing, the prompt is empty, the schema file is not valid JSON, `--cwd` does not exist, the target cannot do what you asked (for example `--resume`), or a path variable is relative or has quotes. | Read `error.message`. Correct the command. |
| `prompt-too-long` | 2 | The prompt is over 24,000 characters (Antigravity), or the command line is too long for the operating system. | Write a shorter brief. Put long text in files that the target can read from `--cwd`. A big `--schema` can also cause it. |
| `not-installed` | 3 | `hd` cannot find the program of the target, or `HARNESS_DISPATCH_<ID>_PATH` names a file that does not exist. | Install the target CLI. Run `hd list`. Set the path variable to an absolute path. |
| `not-startable` | 3 | The program exists but cannot start. Example: only an npm shim exists, which `hd` cannot start without a shell. The path variable names a script. | Install a real executable, or set `HARNESS_DISPATCH_<ID>_PATH` to one. |
| `depth-exceeded` | 4 | You are inside a dispatched agent. A dispatched agent cannot dispatch. | Do the task in this agent. To allow more depth, the operator sets `HARNESS_DISPATCH_MAX_DEPTH`. |
| `not-authenticated` | 1 | The target is not signed in, or its session expired. | Tell the person who owns the account. They sign in with the CLI of the target. `hd` never signs in. Run `hd doctor --to <id>`. |
| `usage-limit` | 1 | The target reported a usage or rate limit. | Do not dispatch to that target again until the limit resets. The reset time is in `error.message` when the target gives it. Use another target, or wait. |
| `permission-denied` | 1 | The target needed a permission that it cannot ask for in headless mode. `denied_actions` names it. | Do not retry with a bypass flag. The operator can add an allow rule in the settings of the target. Or use another access mode, if the task allows it. |
| `timeout` | 1 | The target did not finish within `--timeout` seconds. `hd` stopped the process tree. | Split the task, or raise `--timeout`. Read the log. |
| `bad-output` | 1 | The output of the target could not be read, or the target ended without a final answer. | Read the log. Check the version of the target (`hd list`). Try one more time at most. |
| `target-error` | 1 | The target failed for another reason. Also used when `hd` has an internal error, or when a Codex read run could not list MCP servers. | Read `error.message` and the log. |

After a failure, do not send the same task more than one more time.

## An old Codex CLI on `PATH`

Symptom: the service rejects the model ("not supported when using Codex with a ChatGPT account"). Version 0.154.0 gave this for the models that were tried.
`hd` selects the newest `codex` program that it finds on `PATH`, in known folders and inside Codex Desktop. Run `hd list` and look at `executable` and `version` for `codex`.
If `hd` chose an old copy, update Codex, or set `HARNESS_DISPATCH_CODEX_PATH` to a newer program. Do not put quotes around the path.

## A target is not signed in

Run `hd doctor --to <id>`. When `authenticated` is `false`, sign in with the CLI of the target, in a terminal. `hd` does not do this for you.
Antigravity has no sign-in check. `doctor` shows `authenticated: null`. Run a short task to find out.

## A usage limit

The code is `usage-limit`. Wait for the reset time in `error.message`, or use another target. A repeat dispatch to the same target gives the same result.

## A caller that cannot run `node`

Symptom: the calling agent says that the shell command was denied or refused, and `hd` never starts.

- Antigravity: add the allow rule `command(node)` under `permissions.allow` in its settings.
- Claude Code CLI: add the allow rule `Bash(node:*)`.
- Codex as the caller: Codex asks for approval of the exact `node <skill folder>/scripts/hd.mjs` command, because the command must run outside the Codex sandbox. Approve it, and the dispatch works (tested by hand by the operator, 2026-11-20). If you see "This action was rejected due to unacceptable risk", the session had nobody to approve the command, for example a headless `codex exec` run. Run the command that Codex shows you in your own terminal, or use an interactive Codex session.

See [install](install.md).

## `hd` is not found

The agent must run `node <folder>/scripts/hd.mjs`. The folder is `harness-dispatch` inside the skill folder of the harness. Check the install with the dry run of the installer ([install](install.md)).
A shell that started before you installed Antigravity may not have `agy` on `PATH`. `hd` also looks in `%LOCALAPPDATA%\agy\bin`.

## The log file

`log_file` in the envelope is the path of the raw output. The file is in the temporary folder of the operating system, in `harness-dispatch/`, and is named `<target>-<random>.log`.
The first line holds the raw exit code of the target, the signal, and whether the run timed out. The file can hold private code. `hd` does not delete it.
`log_file` is `null` when the log could not be written, or when `hd` stopped before it started the target.
