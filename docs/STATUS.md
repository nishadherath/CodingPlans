# Live status

Last update: 2026-11-20, after H2, by the hub session (`claude-fable-5-2`).

The hub session updates this file at each handoff and at each gate. Section 6 of `AGENTS.md` gives the rules.

## Goal

The operator changed the goal on 2026-11-20. This repository becomes the skill `harness-dispatch`: an agent in one harness sends a task to a different harness (Claude Code, Codex, Antigravity) and gets one JSON result. Specification: `docs/design/harness-dispatch-contract.md`.

The skill must **not** be installed until the operator says so.

## Current state

H3 (live verification and corrections) is in progress. Plan, evidence and proof status: `docs/handoffs/2026-11-20-h3-live-verification.md`. The operator's instruction of 2026-11-20: do not install; correct D9; prove the four open items.

- Antigravity: dispatch, `--resume`, `--schema`, `--access write` and Antigravity as the caller are proved by live runs. Read access with `--mode plan` alone is **not** enforced; with `--sandbox` it is.
- Codex: blocked until 12:10 PM (usage limit of the account). The CLI on `PATH` (0.154.0) is too old for the account's models; the Codex Desktop binary (0.167.0) is accepted.
- Claude Code: blocked until the operator runs `claude auth login`.
- The H1 session implements "Required changes, part 1" now.
- Open question: `live.stdout` in the repository root held the envelope of a successful Antigravity run at 10:57 (session `(id removed)`). The hub did not start that run. The file is removed in `3c283b6`.

H1 (build) and H2 (acceptance) are complete. Verdict of H2: **accept with listed defects**. Branch: `feat/harness-dispatch`. Nothing is pushed. The skill is not installed.

## Completed

| Stage | Result | Cost (API list price) |
|---|---|---|
| 0. Assessment and configuration | `docs/analysis/2026-11-20-project-assessment.md`, `AGENTS.md`, `CLAUDE.md` | In the hub figure |
| 0. Contract and dispatch decision | `docs/design/harness-dispatch-contract.md`, `docs/handoffs/2026-11-20-h1-harness-dispatch-build.md` | In the hub figure |
| H1. Build | Engine, three adapters, CLI, bundle `skill/harness-dispatch/scripts/hd.mjs`, skill file, installer, legacy defects D1 and D2. Note: `docs/handoffs/2026-11-20-h1-result.md`. | 4.54 USD measured (78 calls). Projected 14.28. |
| H2. Acceptance | 9 defects found, 5 corrected by H2, 1 corrected by the hub (D8), 3 open (D6, D7, D9). Result: `docs/handoffs/2026-11-20-h2-result.md`. | 4.70 USD measured (53 calls). Projected 8.00. |
| Live dispatch | `hd run --to antigravity --access read`: exit code 0, `ok` true, 23,580 tokens, 54 seconds | Plan quota of Antigravity |
| Hub | Assessment, contract, handoffs, probes, coordination | 13.91 USD measured (52 calls) |

Total measured: 23.15 USD. Tests at the head: 139 tests, 131 pass, 0 fail, 8 skipped. Bundles are current.

## In progress

None.

## Remaining

| Item | Work | Needs |
|---|---|---|
| Install | Run `node scripts/install-skill.mjs --apply` (all harness folders that exist) or with `--target <id>` | The operator |
| D9 | Make the read access of `claude` independent of the allow rules in the settings | An operator decision and one live probe after `claude auth login` |
| D6, D7 | POSIX: stop the target when the caller stops `hd`; per-user log folder | A POSIX machine for the test run |
| Real success fixtures | `claude` and `codex` success output is still synthetic in the tests | `claude auth login`; a Codex model that the account accepts |
| Not verified | `--resume`, `--schema` and `--access write` on a real target | Operator approval for live runs |
| Later targets | ZCode, OpenCode, Cline. `stream-json` sessions for `agy`. | Not planned yet |
| Deferred | Cline provider repair: assessment section 7 | Not planned yet |
| Merge | Merge `feat/harness-dispatch` to `main`, push | The operator |

## Open decisions and gates

| # | Item | State |
|---|---|---|
| 1 | Live probe: one one-word prompt to each of `claude`, `codex` and `agy`, to capture real output for test fixtures | Done 2026-11-20. `agy`: success. `claude`: failed, OAuth session expired. `codex`: failed, the account rejects `gpt-6.2-astra` (the configured default) and `gpt-5.5`. Real captures are in `test/fixtures/`. |
| 1a | The operator runs `claude auth login` in a terminal | Waiting for the operator. Needed before the H2 live dispatch to `claude`. |
| 1b | The operator names a Codex model that the ChatGPT account accepts | Waiting for the operator. Needed before the H2 live dispatch to `codex`. |
| 2 | Hub effort: the operator can set this session to `medium` to lower the coordination cost | Optional |
| 3 | Assessment decisions 1 and 3 (Codex link strategy, npm and upstream) | Deferred with the Cline repair work |

Gates that always need the operator: a live dispatch or live test, an installer run with `--apply`, a real `fix` run, `git push`, a release, and each message to an external party.
