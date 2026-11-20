# harness-dispatch

`harness-dispatch` is a skill for coding agents. An agent in one harness runs one script and sends a task to a different coding agent CLI. The script returns one JSON result.
The targets are Claude Code, OpenAI Codex and Google Antigravity. The script has no dependencies and needs Node 22 or later.
The skill is built and tested. This repository does not install it on its own. You run the installer yourself ([docs/install.md](docs/install.md)).

## Why it exists

Each harness reaches only the models and the plan quota of its own vendor. You often hold several subscriptions on one machine.
Without this skill, you must copy a task by hand from one tool to the next.
With this skill, the agent in front of you does that work. The answer comes back as a small JSON object, so the agent keeps its context small.
The skill starts each target by its absolute path, with no shell. It is read-only by default. It has a guard that stops dispatch loops.

## What you can do with it

- **A second opinion from a different vendor.** Claude Code writes a change. It sends the diff to Codex and asks for a review. A model of another family finds other defects.
- **A task on a cheaper model.** Your main harness uses a large model. It sends a routine task (a summary, a file search, a test list) to a cheaper model that it does not offer itself.
- **Work on a subscription that has quota left.** One plan is at its limit. The agent sends the task to another plan, and the work continues.
- **A structured answer.** Give a JSON Schema. The answer comes back in the `structured` field.
- **A follow-up.** Give the `session_id` of an earlier result to `--resume`. The target keeps the earlier context.

## How it works

The agent runs `hd.mjs`. The script checks the depth guard, finds the target program, starts it with the right flags, and reads its output.

```
caller agent --(node hd.mjs run --to codex ...)--> hd.mjs --(spawn, no shell)--> target CLI
     ^                                                |                              |
     |                                                +-- depth guard, access flags  |
     +----------- one JSON envelope on stdout <-------+------ raw output in a log <---+
```

## How to use it

You talk to one agent. That agent sends a task to a different coding agent on this machine and reads the answer. You do not copy text between tools.

### Method 1: ask your agent

After the install ([docs/install.md](docs/install.md)), tell your agent in plain words what to send and where. The agent loads the skill and runs the script.

- "Dispatch this diff to Codex and ask for a review."
- "Get a second opinion from Antigravity on this design."
- "Send this summary task to Claude Code on the Haiku model."

Say "with write access" only when the other agent must change files.

### Method 2: run the script yourself

From this repository the command is `node bin/harness-dispatch.mjs`. From an installed copy it is `node <skill folder>/scripts/hd.mjs`.

Step 1. Check the targets. These commands start no model.

```powershell
node bin/harness-dispatch.mjs list
node bin/harness-dispatch.mjs doctor
```

`list` shows each target, its program and its version. `doctor` shows if each target is installed, startable and signed in.

Step 2. Send a task. This command uses your plan quota. Access is `read`, the default.

```powershell
node bin/harness-dispatch.mjs run --to codex --prompt "Review src/dispatch/guard.mjs for defects. Give a list with line numbers."
```

Step 3. Read the result. The script prints one JSON object on `stdout`.

| Field | Meaning |
|---|---|
| `ok` | `true` when the target completed the task |
| `text` | The answer |
| `session_id` | Give this to `--resume` to continue the same conversation |
| `usage` | The tokens that the target used |
| `error` | `null`, or a code and a message |
| `log_file` | The raw output of the target |

### The flags that you will use most

| Flag | Use |
|---|---|
| `--to claude`, `--to codex`, `--to antigravity` | Select the target |
| `--prompt "<text>"` or `--prompt-file <path>` | Give the task. With neither flag, the script reads the task from `stdin`. |
| `--model <id>` and `--effort <level>` | Select the model and the effort. `hd models --to antigravity` lists the Antigravity models. |
| `--access write` | Let the target change files. The default is `read`. |
| `--cwd <dir>` | The folder that the target works in |
| `--resume <session_id>` | Continue an earlier conversation |
| `--schema <file>` | Get the answer as JSON that agrees with a JSON Schema |
| `--timeout <seconds>` | The time limit. The default is 600. |

### Rules for good results

1. Write a brief that stands alone. Give the goal, the files, the limits, and the form of the answer.
2. Use read access unless the task must change files.
3. Do not put secrets in a prompt. Do not send content from a source that you do not trust.
4. Check the answer. A dispatched answer is a report, not a proof.
5. If `error.code` is `usage-limit`, do not send to that target again until the limit resets.

The full list of commands, flags, error codes and exit codes is in [docs/usage.md](docs/usage.md).

## Targets and callers

Proof state on 2026-11-20. All live runs were on Windows 11.

| Role | Harness | State |
|---|---|---|
| Target | Claude Code | Dispatch, `--resume`, `--schema`, `--access write` and enforced read access: proved by live runs. |
| Target | OpenAI Codex | The same five items: proved. A schema run gave a valid `structured` object, but the cheap test model gave a wrong answer text. |
| Target | Google Antigravity | The same five items: proved. |
| Caller | Claude Code desktop | Proved. |
| Caller | Claude Code CLI | Proved. It needs the allow rule `Bash(node:*)`. |
| Caller | Antigravity | Proved. It needs the allow rule `command(node)`. |
| Caller | Codex (Desktop and CLI) | Works when a person approves the launcher. Codex asks for approval of the exact `node .../scripts/hd.mjs` command, because that command must run outside the Codex sandbox. The operator tested this by hand on 2026-11-20. A headless `codex exec` run has nobody to approve: there, `hd list` and `hd doctor` run, and Codex refuses `hd run`. |
| Caller | ZCode, OpenCode, Cline, DeepSeek Harness | Not tested as callers. ZCode lists the installed skill. Cline and DeepSeek Harness read the shared folder `~/.agents/skills`, so they need no folder of their own. The record is in [docs/STATUS.md](docs/STATUS.md). |

On 2026-11-20 the skill was installed in six harness folders on the operator's machine. Each of the three targets then answered a test dispatch through an installed copy. The record is in [docs/STATUS.md](docs/STATUS.md).

## Known limits

- Codex read runs keep the built-in web tool.
- Antigravity read runs: MCP and browser tools were not tested.
- Claude Code in write mode refuses each shell command that needs approval.
- Only Windows 11 was tested. Two POSIX defects are open.
- The Codex CLI must be recent. Version 0.154.0 was rejected by the service.

The details are in [docs/safety.md](docs/safety.md).

## Documents

| Document | Content |
|---|---|
| [docs/install.md](docs/install.md) | Requirements, the installer, the folder of each harness, the allow rules. |
| [docs/usage.md](docs/usage.md) | Commands, flags, the result envelope, error codes, how to write a brief. |
| [docs/safety.md](docs/safety.md) | What read and write access mean for each target, and the limits. |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Each error code, with the cause and the action. |
| [docs/development.md](docs/development.md) | Layout, tests, bundles, how to add a target. |
| [docs/legacy-cline-providers.md](docs/legacy-cline-providers.md) | The older Cline provider repair tool. |
| [docs/README.md](docs/README.md) | Index of all documents, and the project records. |
| [docs/STATUS.md](docs/STATUS.md) | The present state: release, install record, proof state, open work, cost. |
| [CHANGELOG.md](CHANGELOG.md) | Release notes. |
| [skill/harness-dispatch/SKILL.md](skill/harness-dispatch/SKILL.md) | The instructions that the calling agent reads. |
| [docs/design/harness-dispatch-contract.md](docs/design/harness-dispatch-contract.md) | The specification. |

## Licence

Apache-2.0. See [LICENSE](LICENSE).
