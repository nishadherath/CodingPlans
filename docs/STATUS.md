# Live status

Last update: 2026-11-21, after the check of the public repository and the history rewrite (stage H7), by the hub session (`claude-fable-5-2`).

The hub session updates this file at each handoff and at each gate. Section 6 of `AGENTS.md` gives the rules.

## Goal

This repository holds the skill `harness-dispatch`. An agent in one coding harness runs one script and sends a task to a different coding agent CLI (Claude Code, OpenAI Codex, Google Antigravity). The script returns one JSON result. The operator set this goal on 2026-11-20.

Start with the [README](../README.md). The specification is [design/harness-dispatch-contract.md](design/harness-dispatch-contract.md).

## Current state

- **Release:** `0.2.3` on `main`, tag `v0.2.3`. Later tags with `-docs` in the name change documents only. The repository is public since 2026-11-21. The history was written again on that day, so all commit ids after the second commit, and all release tags, are new.
- **Skill:** built, reviewed, verified by live runs on all three targets, documented, and installed on the operator's machine. All seven harnesses load it. The installed copies are version 0.2.3.
- **Work in progress:** none.
- **Tests:** 198 tests, 190 pass, 0 fail, 8 skipped (the opt-in live tests of the legacy tool). The bundles are current.

## Install record

Four skill folders serve seven harnesses. Each copy has `SKILL.md` and `scripts/hd.mjs`.

| Skill folder | Copy | Harnesses that read it | Does each harness load the skill? |
|---|---|---|---|
| `~/.claude/skills/harness-dispatch` | Version 0.2.3 | Claude Code. OpenCode reads it too. | Yes. Claude Code desktop lists the skill and used it for the test dispatches. |
| `~/.codex/skills/harness-dispatch` | Version 0.2.3 | Codex | Yes. A headless `codex exec` run read the skill and followed it. |
| `~/.gemini/config/skills/harness-dispatch` | Version 0.2.3 | Antigravity | Yes. On 2026-11-21 an `agy` session listed its skills, and the list names `harness-dispatch`. Antigravity does not read the shared folder. |
| `~/.agents/skills/harness-dispatch` (the shared folder) | Version 0.2.3 | ZCode, OpenCode, Cline, DeepSeek Harness | Yes, for each of the four. ZCode: its command-line program (version 0.17.1) lists the skill one time. OpenCode: the log of the desktop app (version 1.19.5) names the skill. Cline: a headless session (CLI 3.0.65) listed 51 skills, and `harness-dispatch` is one of them. DeepSeek Harness: the slash menu of the desktop app lists the skill under "Skills". |

Each "Yes" comes from output of the harness itself. The sources and the check commands are in [handoffs/2026-11-20-h5-skill-loading-check.md](handoffs/2026-11-20-h5-skill-loading-check.md).

History of the installs:

- 2026-11-20: the operator approved the first install. The command was `node scripts/install-skill.mjs --apply`. It wrote six folders. The install was repeated for version 0.2.2 on the same day.
- 2026-11-21: the operator decided to remove the own copies of ZCode and OpenCode, because these harnesses also read the shared folder and found the skill two times. The command was `node scripts/install-skill.mjs --uninstall --target zcode --target opencode --apply`, with the installer of version 0.2.2. Four folders remain.
- 2026-11-21: the operator approved the install of version 0.2.3. The command was `node scripts/install-skill.mjs --apply`. It replaced the copy in each of the four folders.

The four installed copies are version 0.2.3 and are identical to the repository (checked with `cmp` on `SKILL.md` and `scripts/hd.mjs`, 2026-11-21). The proofs in the table are from version 0.2.2. Version 0.2.3 changes one sentence of `SKILL.md` and the version number, and the script behaves the same. After the install, ZCode still lists the skill one time, and `hd list` runs from the shared folder.

OpenCode reads the shared folder and the Claude Code folder. It thus finds the skill two times, writes one warning about the duplicate name, and uses one copy. The copies are identical.

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
- OpenCode finds the skill in two folders and writes one warning about the duplicate name.
- The default installer run skips the shared folder when `~/.agents` does not exist. Name a harness with `--target` in that case.
- The history rewrite of 2026-11-21 does not fully undo the earlier publication. GitHub can keep old commits reachable by their full id for some time. See [handoffs/2026-11-21-h7-public-repository-check.md](handoffs/2026-11-21-h7-public-repository-check.md).
- Review gaps: the hub reviewed the Codex read hardening (part 3), the user documents and the installer change of stage H6. No separate acceptance session read them.

## Open work

None of this work is approved.

| Item | Needs |
|---|---|
| Allow rules for `node` in Antigravity and in the Claude Code CLI | The operator: it changes permission settings |
| The Codex built-in web tool in read mode | A flag that removes it, and a live test |
| POSIX defects D6 and D7 | A POSIX machine for the test run |
| The dispatch targets ZCode, OpenCode and Cline | An adapter for each. Cline and ZCode have a headless command. OpenCode has only the desktop app on this machine. |
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
| H5. Skill loading check | All five harnesses load the skill: ZCode, Antigravity, Cline, OpenCode and DeepSeek Harness. Each proof is output of the harness itself. One wrong prompt was sent to OpenCode and stopped. | [handoffs/2026-11-20-h5-skill-loading-check.md](handoffs/2026-11-20-h5-skill-loading-check.md) |
| H6. Shared skill folder | The installer has four folders for seven harnesses. The own copies of ZCode and OpenCode are removed. Cline and DeepSeek Harness are installer ids. Release `0.2.3`. | [handoffs/2026-11-21-h6-installer-shared-folder.md](handoffs/2026-11-21-h6-installer-shared-folder.md) |
| H7. Check of the public repository | No credential and no e-mail address was public. The operator decided 15 items. Three private items were removed with a history rewrite: 65 commits became 63. The licence line names the operator. | [handoffs/2026-11-21-h7-public-repository-check.md](handoffs/2026-11-21-h7-public-repository-check.md) |

## Measured cost

API list price, `session-dispatch` price table `2026-11-20`, measured with `session-cost.mjs` on each session transcript. The operator uses a subscription plan, so the figures show relative cost and not an invoice.

| Session | Model | Calls | USD |
|---|---|---|---|
| H1 build and corrections | `claude-sonnet-5-5` | 160 | 8.57 |
| H2 acceptance and review | `claude-opus-5-5` | 83 | 6.99 |
| H4 documentation and tidy | `claude-sonnet-5-5` | 49 | 1.66 |
| H5 skill loading check (sub-agent) | `claude-sonnet-5-5` | 61 | 1.18 |
| H6 installer and documents (sub-agent) | `claude-sonnet-5-5` | 39 | 1.03 |
| H7 scan of the public repository (sub-agent) | `claude-sonnet-5-5` | 70 | 2.51 |
| Hub, to this update | `claude-fable-5-2` | 270 | 61.26 |

Total: 83.20 USD. The hub is 74 percent. Desktop control used 32 hub calls and about 5.8 USD. The wait for the operator's approval of the live checks was longer than the cache lifetime of 1 hour, so the hub wrote its whole context to the cache again one time (about 3 USD). Every live run and every outward step (install, merge, push) had to be in the hub session, and that session has the largest context. A new project must start a new hub session after the design stage to lower this share.

The dispatched test tasks used the quota of the target plans. Claude Code reported 0.0065 USD for its test task.
