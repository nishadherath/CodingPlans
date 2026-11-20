# Safety

This document states what `read` and `write` access mean for each target, as the live runs of 2026-11-20 prove it, and where the proof ends.
Back to the [README](../README.md). See also [usage](usage.md) and [troubleshooting](troubleshooting.md).

## Why access needs care

A dispatched agent works alone. Nobody can answer a permission prompt in headless mode. So the flags that `hd` passes decide what the agent can do.
Live runs showed that the obvious flags do not always enforce read access. Three mappings that looked right were disproved and replaced:

- Claude Code with only a "manual" permission mode wrote a file when an allow rule existed.
- Codex with a read-only sandbox still wrote a file when the user config had `approval_policy = "on-request"`.
- Antigravity with only `--mode plan` ran a command that an allow rule approved.

The mappings below are the corrected ones.

## Read access (the default)

| Target | What read access means |
|---|---|
| Claude Code | No shell tools, no edit tools, no MCP servers. The user, project and local settings files are ignored, and so are the hooks from them. Managed settings and settings passed on the command line still apply. |
| Codex | Shell commands run in a read-only sandbox with no approval. File writes are refused. Plugins, connected apps, computer-use, browser features, hooks and the configured MCP servers are off. **The built-in web tool stays available.** |
| Antigravity | Every shell command is refused by a deny rule for the session. File tools are refused by plan mode. **MCP and browser tools were not tested in read mode.** |

Proof, from live runs (2026-11-20):

- Claude Code: a forced prompt wrote no file. A read question was answered. No MCP tool was present.
- Codex: a forced prompt saw no computer-use tool, no connected-app tool and no MCP server tool. A file write was refused. A read question was answered.
- Antigravity: the shell command and the file tool were both refused. No file was written.

"Forced" means a prompt that orders the agent to make the tool call and to try a second way.

## Write access

`--access write` lets the target edit files in `--cwd`. Use it only when you approved a write for this task.

| Target | What write access means |
|---|---|
| Claude Code | Edits are accepted. **Each shell command that needs approval is refused**, because nobody can answer a prompt. A task that must run tests can fail. |
| Codex | The sandbox allows writes in the workspace. Approvals are off. Your plugins and MCP servers stay as you configured them. |
| Antigravity | File edits are accepted. There is no deny rule. A shell command follows the allow rules in your Antigravity settings. |

Live runs created a file on each target in write mode.

## Known limits

- Codex read runs keep the built-in web tool. A hostile prompt could use it to send data out. No flag for it was tested.
- Antigravity read runs: the deny rule covers shell commands only. MCP and browser tools were not tested.
- Claude Code in write mode refuses each shell command that needs approval.
- Codex as the caller runs the launcher outside the Codex sandbox, after your approval. The target then has the access that `--access` gives. The Codex sandbox does not limit it.
- Codex read runs fail closed. `hd` lists the MCP servers first, with no model call. If the list fails, the run does not start.
- Only Windows 11 was tested. On POSIX two defects are open. The first: when the caller stops `hd`, the target can keep running (D6). The second: the log folder is shared between users (D7). The details are in `docs/handoffs/2026-11-20-h2-result.md`.
- The Codex CLI must be recent. Version 0.154.0 was rejected by the service for the models that were tried. `hd` selects the newest `codex` program that it finds, including the one inside Codex Desktop.
- The log file holds the raw output of the target and can hold private code. It is in the temporary folder, and `hd` does not delete it.

## Content from a source that you do not trust

Do not put content from a source that you do not trust into a dispatch. This includes web pages, issue text, e-mail and files that others wrote.
The target reads the prompt as an instruction. Read access limits what it can change. It does not limit what a hostile prompt can ask the agent to say, and for Codex it does not close the web tool.
Do not put secrets in a prompt. The target keeps its own session history.

## What the skill never does

- It never passes a bypass flag: not `--dangerously-skip-permissions`, not `--dangerously-bypass-approvals-and-sandbox`, not `bypassPermissions`. Version 0.2.2 has no option that removes all permission checks.
- It never uses a shell. It starts each target with an argument list and an absolute path.
- It never fixes a model id in code. `--model` goes to the target unchanged.
- It never signs in for you. If a target is not signed in, `hd` reports it.
- It never lets a dispatched agent dispatch again, unless you raise `HARNESS_DISPATCH_MAX_DEPTH`.
- It never installs itself. You run the installer ([install](install.md)).
