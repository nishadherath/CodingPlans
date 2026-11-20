---
stage: "H3 live verification and corrections"
model: claude-sonnet-5-5
effort: high
status: in-progress
created: 2026-11-20
from: "Hub session (claude-fable-5-2)"
---

# H3: live verification, D9, and the corrections that follow

## Goal

The operator's instruction of 2026-11-20: do not install; correct D9; prove the four items that H2 listed as not proved. Done means each row of the table in "Proof status" is `proved` or has a named blocker that only the operator can remove.

## Who does what

- The hub runs every live dispatch. Reason: the permission check of a started session blocked the approved live run in H2 (measured one time).
- The H1 session (`claude-sonnet-5-5`, holds the code context) makes the code changes in "Required changes".
- The H2 session (`claude-opus-5-5`) reviews the diff.

## Proof status

| # | Item | State | Evidence |
|---|---|---|---|
| 1 | Real dispatch to Antigravity | proved | `hd run --to antigravity`: exit 0, `ok` true, `text` "OK" (H2 result, hub addendum) |
| 2 | `--resume` on Antigravity | proved | Run A1: the target repeated the first prompt of conversation `648248b3`. Fixture `antigravity/real-resume.stdout.json`. |
| 3 | `--schema` on Antigravity | proved | Run A2: `structured` is `{"answer":"OK"}`. Fixture `antigravity/real-schema.stdout.json`. |
| 4 | `--access write` on Antigravity | proved | Run A4: `proof.txt` created with the content `WRITTEN`. |
| 5 | Antigravity read access is enforced | **disproved for `--mode plan` alone**; proved for `--mode plan --sandbox` | See "Antigravity read access" |
| 6 | Antigravity as the caller | proved | Run A6: `agy` ran `hd.mjs run --to antigravity` from its shell and returned a valid envelope with `ok` true. It needed an allow rule for `node`. |
| 7 | Real dispatch to Codex | blocked until 12:10 PM | The account is at its usage limit. See "Codex findings". |
| 8 | `--resume`, `--schema`, `--access write`, read enforcement on Codex | blocked with item 7 | |
| 9 | Codex as the caller | blocked with item 7 | |
| 10 | Real dispatch to Claude Code, and its `--resume`, `--schema`, `--access write` | blocked: operator login | `claude auth status`: `loggedIn` false. The operator must run `claude auth login`. |
| 11 | D9: Claude read access | blocked with item 10 | Candidates are in "D9 plan" |
| 12 | Claude Code CLI as the caller | blocked with item 10 | Claude Code desktop as the caller is proved (the hub's own runs). |
| 13 | ZCode, OpenCode, Cline as the caller | not testable now | No `opencode` or `zcode` executable is on `PATH`. No headless entry is known. |

## Antigravity read access

All runs used a scratch repository under `.hd-live/` with a `package.json` whose `test` script writes `proof.txt`. The operator's `agy` settings allow `command(npm test)`.

| Run | Flags | Prompt | Result |
|---|---|---|---|
| A3 | `--mode plan` | "create proof.txt" | No file. `denied_actions` names a command. `response` is empty. |
| b1 | `--mode plan` | "run `npm test`" (polite) | Model answered BLOCKED. No file. |
| c1 | `--mode plan` | "run `npm test`" (forceful) | **`run_command npm test` ran with exit 0. `proof.txt` was written.** |
| c2 | `--mode plan` | "write proof.txt with your file tool" (forceful) | No file. |
| c3 | `--mode plan --sandbox` | same as c1 | The command ran and failed inside the sandbox with a file system error. No file. |
| c4 | `--mode plan --settings <deny rules>` | same as c1 | The command tool did not run. No file. |

Conclusion: plan mode is advice to the model. It does not stop a command that an allow rule approves. `--sandbox` stops the write at the OS level and still lets read-only commands run. Decision: read access for Antigravity is `--mode plan --sandbox`.

Also seen: `--mode plan` puts `/plan ` in front of the prompt (run A1 returned "/plan Reply with exactly: OK").

## Codex findings

1. The Codex CLI on `PATH` is 0.154.0 (npm, and a hand copy in `~/.local/bin`). With it, the service rejects `gpt-6.2-astra` and `gpt-5.5`: "not supported when using Codex with a ChatGPT account".
2. Codex Desktop holds a newer binary: `%LOCALAPPDATA%\OpenAI\Codex\bin\<hash>\codex.exe`, version 0.167.0-alpha.4.1. The file `~/.codex/models_cache.json` was written by client 0.169.1 and lists `gpt-6.2-astra`.
3. With the Desktop binary the model is accepted. The run then failed with "You've hit your usage limit ... try again at 12:10 PM". Fixture: `codex/real-usage-limit.stdout.jsonl`.
4. The model cache lists the efforts `low`, `medium`, `high`, `xhigh`, `max` and `ultra`.

## D9 plan (Claude read access)

Run these in a scratch repository whose `.claude/settings.json` allows `Bash(*)`, `Edit` and `Write`, with a forceful "create proof.txt" prompt, after the operator's login:

1. Current mapping (`--permission-mode manual --permission-prompts none`): expected to write. This reproduces D9.
2. Add `--setting-sources user` (ignore project and local settings).
3. Add `--disallowedTools Bash PowerShell Edit Write NotebookEdit` (a deny rule wins over an allow rule).
4. `--restricted` in place of the above.

Select the weakest candidate that writes no file and still answers a read-only question.

## Required changes, part 1 (H1 session)

Evidence for each item is above. Add a test for each. Update `docs/design/harness-dispatch-contract.md` and `skill/harness-dispatch/SKILL.md` to match. Rebuild the bundles.

1. **Antigravity read access.** `--access read` passes `--mode plan --sandbox`. `--access write` stays `--mode accept-edits`.
2. **Denied actions.** The `agy` JSON can hold `denied_actions` (array of `{action, display_name}`), and `stderr` then names the missing permission. When `response` is empty and `denied_actions` is not empty: `ok` false, exit 1, `error.code` `permission-denied`, and a message that names the denied actions and says that the operator can add an allow rule in the target's settings. Add the envelope field `denied_actions` (array of strings such as `"command: Bash"`, empty when none) for every target. Fixture: `antigravity/real-denied-action.stdout.json` and `.stderr.txt`.
3. **Usage limit.** New `error.code` `usage-limit` (exit 1) when the target reports a usage or rate limit. Fixture: `codex/real-usage-limit.stdout.jsonl`. `SKILL.md`: do not dispatch again to that target after this code.
4. **Codex binary selection.** `resolve` for `codex` collects these candidates: a real `codex.exe` on `PATH`, the npm shim entry, and `%LOCALAPPDATA%\OpenAI\Codex\bin\*\codex.exe`. It selects the candidate with the highest version (`--version`, compare numerically, a pre-release is lower than the same release). Run each `--version` one time for each process. `hd list` shows the selected path and version. Reason: finding 1 and 2 above.
5. **Path override.** `HARNESS_DISPATCH_<ID>_PATH` (for example `HARNESS_DISPATCH_CODEX_PATH`) names an absolute executable for a target and wins over the search. A relative value is a `usage` error.
6. **Codex effort.** Pass each of the five efforts to Codex. Remove the refusal of `max`.
7. **Fixtures.** Use `antigravity/real-resume.stdout.json` and `antigravity/real-schema.stdout.json` in the parser tests.
8. **`SKILL.md`.** Say that a harness whose shell needs an allow rule (Antigravity: `command(node)`) cannot run `hd` in headless mode without it. List the new error codes. State what read access means for each target.
9. **`.gitignore`.** `.hd-live/` is ignored (done by the hub).

Part 2 follows after the Codex and Claude live runs: the D9 mapping, and real success fixtures.

## Gates

No session other than the hub runs a live dispatch. No session installs the skill. No push.

## Session dispatch decision

Date: 2026-11-20. Decided by: `claude-fable-5-2`, effort high, Claude Code desktop. Price table `pricing/2026-11-20.json` (Anthropic family 10 days old). Model note `models/claude-fable-5-2.md` applied. Formula 2026-11-11.

| Input | Value | Source |
|---|---|---|
| W, K, C0 | 1,000,000; 970,000; 470,000 | Usage tool 435,077 at the start of the turn, plus about 35,000 since: estimate |
| B | 67,408 | Usage tool total minus Messages, measured |
| ttl, compacted | 1h, no | Harness default, measured earlier |
| Code changes | T 40 (range 25 to 60), F 3,000, O 1,500, R 30,000, H 3,000, L 5 | Estimates. Task type: matrix row 2, public interface, effort high. |
| Review | T 20, F 5,000, O 1,600 | Estimate. Matrix row 4: one class above the author. |
| Live runs | T 25 | Estimate. Must run in the hub: a hard constraint, not a price result. |
| To | 8 for each piece | Count: start 1, note 1, oracle 4, record 2 |
| Irreversible steps | none | Live dispatches write only under `.hd-live/` |

| Plan | Cost USD | Source |
|---|---|---|
| Code changes in the hub (continue) | 9.76 | Calculator |
| Code changes in a fresh Sonnet session | 2.46, plus 0.12 handoff, plus 5 rediscovery turns | Calculator |
| Code changes in the existing H1 session (C0 324,000) | 2.98 | By hand: T x C_avg x 0.10 + T x G x 4.00 + T x O x 10.00, per million |
| Review in a fresh Opus session | 3.07 | Calculator |
| Review in the existing H2 session (C0 232,000) | 2.89 | By hand, Opus prices |
| Live runs in the hub | 5.93 | By hand, Fable prices |
| Hub coordination, 2 pieces, To 8 | 4.89 | Calculator |

Verdict: the hub does not write the code (9.76 against about 3 USD: by cost). The existing H1 and H2 sessions take the code and the review. A fresh Sonnet session is cheaper than H1 by 0.52 USD before the handoff and the rediscovery turns, which is inside the 10 percent band after those terms, so the quality term decides: H1 holds the code context and has not compacted. Projected total: about 16.7 USD.

Guardrails: 1 not applicable (no fresh session). 2: no compaction ahead (C_end below K). 3: no outward step. 4, 5: models and prices from the table in force. 6: **deviation**: the review runs in the existing H2 session, not in a fresh one. Reason: the change is a small diff on code that H2 already accepted, and H2 did not write it. 7: record under the cap. 8: no class change.

Adversarial pass. Opposite verdict: a fresh Sonnet session reads only 30,000 tokens and carries no stale assumptions from the first build, and the H1 context of 324,000 tokens costs more on each turn. Inputs: T for the code changes can double if the Codex version selection is hard on Windows; at T 80 the H1 session costs about 6.7 USD and a fresh session about 5.6 USD, so a fresh session wins by more than 10 percent. Recompute: fragile, the verdict for H1 flips at T of about 60 or more. Kept, because T 40 is the stated value and the range ends at 60. If H1 passes 60 turns, the hub stops it and starts a fresh session with this file as the brief.

Cost of deciding: context at start 435,077 (usage tool); at end about 480,000 (self-estimate); output about 3,000 tokens (self-estimate); about 8 minutes; priced at about 0.25 USD for the record itself, table `2026-11-20`.
