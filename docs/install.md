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
| `--target <id>` | Install in the folder of one harness. Repeat the flag for more than one. Default: each folder whose harness home folder exists. The ids `zcode`, `opencode`, `cline` and `deepseek` select the shared folder. |
| `--home <dir>` | Use this folder as the home folder. Default: your home folder. |
| `--uninstall` | Remove folders that the installer made. |

Step 1: run the dry run.

```powershell
node scripts/install-skill.mjs
```

Each line says `would copy`, `would replace` or `skip`, with the reason. A folder whose harness home folder does not exist is skipped, unless you name it with `--target`.

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

Seven harnesses use four folders. The installer makes one copy for each folder. The path is relative to your home folder.

| Target id | Skill folder | Harnesses that read it |
|---|---|---|
| `claude` | `.claude/skills/harness-dispatch` | Claude Code |
| `codex` | `.codex/skills/harness-dispatch` | Codex |
| `antigravity` | `.gemini/config/skills/harness-dispatch` | Antigravity. It does not read the shared folder. |
| `agents` | `.agents/skills/harness-dispatch` | ZCode, OpenCode, Cline and DeepSeek Harness (the shared folder) |

The ids `zcode`, `opencode`, `cline` and `deepseek` select the target `agents`. These harnesses have no folder of their own in the installer. The command `--target cline --target zcode` gives one step, for `.agents/skills/harness-dispatch`. The plan names the harnesses that read each folder.

ZCode, Cline, DeepSeek Harness and OpenCode also read a folder of their own (`.zcode/skills`, `.cline/skills`, `.dsh/skills`, `.config/opencode/skill`). The installer does not write to them. A second copy only makes the harness find the skill two times.
OpenCode also reads `.claude/skills`. With the Claude Code copy installed, OpenCode finds the skill two times. It writes one warning about the duplicate name and uses one copy. The copies are identical, so this does no harm.

The skill was seen to load in all of these harnesses on 2026-11-20 and 2026-11-21: Claude Code, Codex, Antigravity, ZCode, OpenCode, Cline and DeepSeek Harness. Each proof is output of the harness itself. The record is in [STATUS.md](STATUS.md). The skill was run as a caller in Claude Code (desktop and CLI), in Antigravity and in Codex only.

If your machine has copies from the old installer (version 0.2.2 and earlier), remove the two old copies by hand. The old installer wrote copies to the own folders of ZCode and OpenCode. Remove a folder only when it holds the marker file `.harness-dispatch-install.json`.

```powershell
Remove-Item -Recurse "$env:USERPROFILE/.zcode/skills/harness-dispatch"
Remove-Item -Recurse "$env:USERPROFILE/.config/opencode/skill/harness-dispatch"
```

## Let the caller run `node`

The skill is a Node script. The shell of the calling harness must be allowed to run `node`. In headless mode nobody can answer a permission prompt, so the call is denied without a rule.

| Caller | What it needs |
|---|---|
| Antigravity | The allow rule `command(node)` under `permissions.allow` in its settings. |
| Claude Code CLI | The allow rule `Bash(node:*)`. |
| Claude Code desktop | Proved to run the script. |
| Codex (Desktop and CLI) | No rule to add. The Codex sandbox on Windows can block the launcher, and it blocks the writes of the target CLI in its own home folder. Codex asks you to approve the exact `node <skill folder>/scripts/hd.mjs` command. Approve that command. The operator tested this by hand on 2026-11-20. In a headless `codex exec` run nobody can approve, and Codex refuses `hd run`. |

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
