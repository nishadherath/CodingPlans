# Install

This document tells you how to install the skill `harness-dispatch`. This repository does not install it for you. Nothing here runs on its own.
Back to the [README](../README.md). Next: [usage](usage.md).

## Requirements

- Node 22 or later, on the `PATH` of each harness that calls the skill.
- At least one target CLI: `claude` (Claude Code), `codex` (OpenAI Codex), `agy` (Google Antigravity).
- A sign-in for each target that you use. The skill never signs in for you.
- For Codex: a recent version. Version 0.154.0 was rejected by the service. The skill selects the newest `codex` program that it finds. This includes the program inside Codex Desktop.

Check the targets without a model call:

```powershell
node bin/harness-dispatch.mjs list
node bin/harness-dispatch.mjs doctor
```

## The installer

The installer copies `skill/harness-dispatch/` into the skill folder of each harness. The command is `node scripts/install-skill.mjs`.

| Flag | Meaning |
|---|---|
| (none) | Dry run. It prints each planned step and changes nothing. |
| `--apply` | Make the changes. |
| `--target <id>` | Install in one harness. Repeat the flag for more than one. Default: each harness whose home folder exists. |
| `--home <dir>` | Use this folder as the home folder. Default: your home folder. |
| `--uninstall` | Remove folders that the installer made. |

Step 1: run the dry run.

```powershell
node scripts/install-skill.mjs
```

Each line says `would copy`, `would replace` or `skip`, with the reason. A harness whose home folder does not exist is skipped, unless you name it with `--target`.

Step 2: when the plan is right, apply it.

```powershell
node scripts/install-skill.mjs --apply
node scripts/install-skill.mjs --apply --target claude
```

The installer writes a marker file, `.harness-dispatch-install.json`, in each folder that it makes. The marker proves that the installer made the folder.
An install over an earlier install replaces it. A folder that has no marker is never replaced and never removed. The installer reports `skip` and exits with code 1 when you apply.

To remove the skill:

```powershell
node scripts/install-skill.mjs --uninstall --apply
```

Without `--apply`, `--uninstall` is a dry run too.

## The folder of each harness

The path is relative to your home folder.

| Target id | Skill folder |
|---|---|
| `claude` | `.claude/skills/harness-dispatch` |
| `codex` | `.codex/skills/harness-dispatch` |
| `antigravity` | `.gemini/config/skills/harness-dispatch` |
| `opencode` | `.config/opencode/skill/harness-dispatch` |
| `zcode` | `.zcode/skills/harness-dispatch` |
| `agents` | `.agents/skills/harness-dispatch` |
| `cline` | Not supported. No skill folder is known. |

The folders were seen on the operator's machine on 2026-11-20. The skill was run as a caller in Claude Code (desktop and CLI) and in Antigravity only. For the other harnesses the installer has a folder, and nothing more is proved.

## Let the caller run `node`

The skill is a Node script. The shell of the calling harness must be allowed to run `node`. In headless mode nobody can answer a permission prompt, so the call is denied without a rule.

| Caller | What it needs |
|---|---|
| Antigravity | The allow rule `command(node)` under `permissions.allow` in its settings. |
| Claude Code CLI | The allow rule `Bash(node:*)`. |
| Claude Code desktop | Proved to run the script. |
| Codex | Failed in its default Windows sandbox: the sandbox refused to start `node.exe`. |

These rules belong to you. The skill does not add them.

## Manual install

Copy the folder `skill/harness-dispatch/` (it holds `SKILL.md` and `scripts/hd.mjs`) into the skill folder of the harness. For example, for Claude Code on Windows:

```powershell
Copy-Item -Recurse skill/harness-dispatch "$env:USERPROFILE/.claude/skills/harness-dispatch"
```

The installer will not replace a folder that you copied by hand, because it has no marker. Remove it by hand to use the installer later.

## Check the install

1. Run the script from the installed folder. It starts no model.

   ```powershell
   node "$env:USERPROFILE/.claude/skills/harness-dispatch/scripts/hd.mjs" doctor
   ```

2. Run the dry run again. An installed folder shows `would replace`.
3. In the harness, ask the agent to dispatch a short task. The agent must find `harness-dispatch/scripts/hd.mjs`.

See [troubleshooting](troubleshooting.md) if a step fails.
