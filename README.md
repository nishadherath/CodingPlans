# harness-dispatch

`harness-dispatch` is a skill for coding agents. An agent in one harness runs one script and sends a task to a different coding agent CLI. The script returns one JSON result.
The targets are Claude Code, OpenAI Codex and Google Antigravity. The script has no dependencies and needs Node 22 or later.
The skill is built and tested. It is **not installed** by this repository. You install it yourself ([docs/install.md](docs/install.md)).

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

## Quick start

Run these commands in this repository. They start no model.

```powershell
node bin/harness-dispatch.mjs list
node bin/harness-dispatch.mjs doctor
```

`list` shows each target, its program and its version. `doctor` shows if each target is installed, startable and signed in.
The next command sends a task to a model. It uses your plan quota. Access is `read`, the default.

```powershell
node bin/harness-dispatch.mjs run --to claude --prompt "List the exported functions of src/dispatch/index.mjs."
```

The same commands run from the skill folder after you install it: `node <skill folder>/scripts/hd.mjs ...`. The full list of commands is in [docs/usage.md](docs/usage.md).

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
| Caller | Codex | **Failed.** Its Windows sandbox refused to start `node.exe`. |
| Caller | ZCode, OpenCode, Cline | Not tested. The installer has folders for ZCode and OpenCode. It has none for Cline. |

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
| [CHANGELOG.md](CHANGELOG.md) | Release notes. |
| [skill/harness-dispatch/SKILL.md](skill/harness-dispatch/SKILL.md) | The instructions that the calling agent reads. |
| [docs/design/harness-dispatch-contract.md](docs/design/harness-dispatch-contract.md) | The specification. |

## Licence

Apache-2.0. See [LICENSE](LICENSE).
