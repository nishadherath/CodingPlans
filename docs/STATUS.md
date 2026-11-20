# Live status

Last update: 2026-11-20, after the skill loading check (stage H5), by the hub session (`claude-fable-5-2`).

The hub session updates this file at each handoff and at each gate. Section 6 of `AGENTS.md` gives the rules.

## Goal

This repository holds the skill `harness-dispatch`. An agent in one coding harness runs one script and sends a task to a different coding agent CLI (Claude Code, OpenAI Codex, Google Antigravity). The script returns one JSON result. The operator set this goal on 2026-11-20.

Start with the [README](../README.md). The specification is [design/harness-dispatch-contract.md](design/harness-dispatch-contract.md).

## Current state

- **Release:** `0.2.2` on `main`, tag `v0.2.2`. Later tags with `-docs` in the name change documents only.
- **Skill:** built, reviewed, verified by live runs on all three targets, documented, and installed on the operator's machine.
- **Work in progress:** none.
- **Tests:** 195 tests, 187 pass, 0 fail, 8 skipped (the opt-in live tests of the legacy tool). The bundles are current.

## Install record

The operator approved the install on 2026-11-20. The command was `node scripts/install-skill.mjs --apply`. The install was repeated for version 0.2.2 on the same day.

| Harness | Skill folder | Files | Does the harness load the skill? |
|---|---|---|---|
| Claude Code | `~/.claude/skills/harness-dispatch` | Identical to the repository, version 0.2.2 | Yes. Claude Code desktop lists the skill and used it for the test dispatches. |
| Codex | `~/.codex/skills/harness-dispatch` | Same | Yes. A headless `codex exec` run read the skill and followed it. |
| Antigravity | `~/.gemini/config/skills/harness-dispatch` | Same | Expected, not observed. The `agy` program names this folder as its global skill folder. No command lists the skills without a model call. |
| OpenCode | `~/.config/opencode/skill/harness-dispatch` | Same | Expected, not observed. The program code reads this folder and the shared agents folder. The app last ran on 2026-10-30, before the install. |
| ZCode | `~/.zcode/skills/harness-dispatch` | Same | Yes. The command-line program inside the desktop app (version 0.17.1) lists the skill. It lists the skill two times: from this folder and from the shared agents folder. |
| Shared agents folder | `~/.agents/skills/harness-dispatch` | Same | ZCode, OpenCode, Cline and DeepSeek Harness read this folder. |
| Cline | No folder of its own | It uses the copy in the shared agents folder | Expected, not observed. The code of Cline CLI 3.0.65 reads `~/.cline/skills` and `~/.agents/skills`. |
| DeepSeek Harness | No folder of its own | It uses the copy in the shared agents folder | Expected, not observed. Its skill plugin reads `~/.dsh/skills` and `~/.agents/skills`. The `web` profile has this plugin off. The desktop app enables it for each agent preset. |

"Expected, not observed" means: the code of the harness reads a folder that holds the skill, and no output of the harness names the skill yet. Stage H5 made no model call. The sources and the check commands are in [handoffs/2026-11-20-h5-skill-loading-check.md](handoffs/2026-11-20-h5-skill-loading-check.md).

The installed copies do not follow the repository. Run the installer again after each change to `skill/harness-dispatch/`.

No allow rule for `node` was added to any harness. Antigravity and the Claude Code CLI need that rule before they can run the script as a caller. See [install.md](install.md).

## Proof state

All live runs were on Windows 11 on 2026-11-20. The evidence is in [handoffs/2026-11-20-h3-live-verification.md](handoffs/2026-11-20-h3-live-verification.md).

| Item | Claude Code | Codex | Antigravity |
|---|---|---|---|
| Dispatch through `hd run` | Proved | Proved | Proved |
| `--resume` | Proved | Proved | Proved |
| `--schema` | Proved | Mechanism proved. The low-cost test model gave a wrong answer text. | Proved |
| `--access write` | Proved | Proved | Proved |
| Read access is enforced (a forced write wrote no file) | Proved | Proved for files and shell. Plugins, connected apps, computer-use and MCP servers are off. | Proved |
| Test dispatch through an **installed** copy of the skill | Proved (version 0.2.2, `claude-haiku-5-5`) | Proved (version 0.2.1, `gpt-5.6-luna`) | Proved (version 0.2.1, default model) |

In each test dispatch through an installed copy, the target read two files and gave the exact three lines that the repository holds. No file changed.

Callers:

| Caller | State |
|---|---|
| Claude Code desktop | Proved. All hub dispatches came from it. |
| Claude Code CLI | Proved. It needs an allow rule for `node`. |
| Antigravity | Proved. It needs the allow rule `command(node)`. |
| Codex Desktop and CLI | Works when a person approves the launcher command. The operator tested this by hand. |
| Codex, headless `codex exec` | `hd list` and `hd doctor` run. Codex refused `hd run`, because nobody could approve it (hub test). |
| ZCode, OpenCode, Cline, DeepSeek Harness | Not tested as callers. The install record shows if each one loads the skill. |

## Known limits

The user document for these limits is [safety.md](safety.md).

- Codex read runs keep the built-in web tool.
- Antigravity read runs: MCP and browser tools were not tested.
- Claude Code in write mode refuses each shell command that needs approval.
- Codex as the caller runs the launcher outside the Codex sandbox, after approval.
- Only Windows 11 was tested. Two POSIX defects are open: D6 and D7 in [handoffs/2026-11-20-h2-result.md](handoffs/2026-11-20-h2-result.md).
- The Codex CLI must be recent. Version 0.154.0 was rejected by the service. The skill selects the newest `codex` program that it finds.
- Review gaps: the hub reviewed the Codex read hardening (part 3) and the user documents. No separate acceptance session read them.

## Open work

None of this work is approved.

| Item | Needs |
|---|---|
| Allow rules for `node` in Antigravity and in the Claude Code CLI | The operator: it changes permission settings |
| Observed proof that Antigravity, Cline, OpenCode and DeepSeek Harness load the skill | One small model call in each harness, or one start of the desktop app. The operator approves each one. |
| Two copies of the skill for ZCode and for OpenCode (the own folder and the shared agents folder) | An operator decision: keep the two copies, or remove the targets `zcode` and `opencode` from the installer |
| The installer reports the target `cline` as not supported | A small code change: Cline reads the shared agents folder |
| The Codex built-in web tool in read mode | A flag that removes it, and a live test |
| POSIX defects D6 and D7 | A POSIX machine for the test run |
| The targets ZCode, OpenCode and Cline | A headless entry for each |
| `stream-json` sessions for Antigravity (long prompts, warm sessions) | Not planned |
| The older local tag `v0.1` is not on the remote | An operator decision |
| The legacy Cline provider repair | Deferred. See [analysis/2026-11-20-project-assessment.md](analysis/2026-11-20-project-assessment.md), section 7. |

## Gates that always need the operator

A live dispatch or live test, an installer run with `--apply`, a real `fix` run of the legacy tool, `git push`, a release, and each message to an external party.

## History

| Stage | Result | Record |
|---|---|---|
| 0. Assessment | Five defects that stopped the legacy tool, and a staged plan | [analysis/2026-11-20-project-assessment.md](analysis/2026-11-20-project-assessment.md) |
| 0. Contract | Version 1 specification of the skill | [design/harness-dispatch-contract.md](design/harness-dispatch-contract.md) |
| H1. Build | Engine, three adapters, CLI, bundle, skill file, installer | [handoffs/2026-11-20-h1-result.md](handoffs/2026-11-20-h1-result.md) |
| H2. Acceptance | Accepted with listed defects. 13 defects found in two reviews, 11 corrected. D6 and D7 (POSIX) are open. | [handoffs/2026-11-20-h2-result.md](handoffs/2026-11-20-h2-result.md), [handoffs/2026-11-20-h2-result-part2.md](handoffs/2026-11-20-h2-result-part2.md) |
| H3. Live verification | The first read mappings were not enforced on any target. All three were corrected and proved. | [handoffs/2026-11-20-h3-live-verification.md](handoffs/2026-11-20-h3-live-verification.md) |
| H4. Documentation and tidy | The user documents, the link test, release `0.2.0` | [handoffs/2026-11-20-h4-docs-and-tidy.md](handoffs/2026-11-20-h4-docs-and-tidy.md) |
| Install | Six harness folders, release `0.2.1` | This file |
| Codex as the caller | The operator's rule in `SKILL.md`, release `0.2.2` | [CHANGELOG](../CHANGELOG.md) |
| H5. Skill loading check | ZCode lists the skill. For Antigravity, Cline, OpenCode and DeepSeek Harness the code reads a folder that holds the skill. No model call. | [handoffs/2026-11-20-h5-skill-loading-check.md](handoffs/2026-11-20-h5-skill-loading-check.md) |

## Measured cost

API list price, `session-dispatch` price table `2026-11-20`, measured with `session-cost.mjs` on each session transcript. The operator uses a subscription plan, so the figures show relative cost and not an invoice.

| Session | Model | Calls | USD |
|---|---|---|---|
| H1 build and corrections | `claude-sonnet-5-5` | 160 | 8.57 |
| H2 acceptance and review | `claude-opus-5-5` | 83 | 6.99 |
| H4 documentation and tidy | `claude-sonnet-5-5` | 49 | 1.66 |
| H5 skill loading check (sub-agent) | `claude-sonnet-5-5` | 61 | 1.18 |
| Hub, to this update | `claude-fable-5-2` | 173 | 41.86 |

Total: 60.26 USD. The hub is 69 percent. Every live run and every outward step (install, merge, push) had to be in the hub session, and that session has the largest context. A new project must start a new hub session after the design stage to lower this share.

The dispatched test tasks used the quota of the target plans. Claude Code reported 0.0065 USD for its test task.
