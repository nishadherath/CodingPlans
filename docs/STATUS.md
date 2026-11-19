# Live status

Last update: 2026-11-20, by the hub session (`claude-fable-5-2`).

The hub session updates this file at each handoff and at each gate. Section 6 of `AGENTS.md` gives the rules.

## Goal

The operator changed the goal on 2026-11-20. This repository becomes the skill `harness-dispatch`: an agent in one harness sends a task to a different harness (Claude Code, Codex, Antigravity) and gets one JSON result. Specification: `docs/design/harness-dispatch-contract.md`.

The skill must **not** be installed until the operator says so.

## Current state

H1 is complete and passes its oracle. H2 (acceptance) is prepared. Branch: `feat/harness-dispatch`. Nothing is pushed. The skill is not installed.

## Completed

| Stage | Result | Cost (API list price) |
|---|---|---|
| 0. Assessment | `docs/analysis/2026-11-20-project-assessment.md` | 6.39 USD measured at 13 calls |
| 0. Project configuration | `AGENTS.md`, `CLAUDE.md`, this file | Included in the hub session |
| 0. Contract and dispatch decision | `docs/design/harness-dispatch-contract.md`, `docs/handoffs/2026-11-20-h1-harness-dispatch-build.md` | Hub session, not yet measured |

| H1. Build | Commits `436f612` to `0d41728`: engine, three adapters, CLI, bundle `skill/harness-dispatch/scripts/hd.mjs`, skill file, installer, legacy defects D1 and D2. Hub oracle on 2026-11-20: 123 tests pass, 0 fail, 8 skipped; bundles current; guard and installer dry run correct. | Projected 14.28 USD. Not yet measured. |

## In progress

| Stage | Work | Model | Effort | Approved | Estimated time | Estimated cost USD |
|---|---|---|---|---|---|---|
| H2 | Adversarial acceptance. Handoff: `docs/handoffs/2026-11-20-h2-harness-dispatch-acceptance.md`. One live dispatch to `agy` is a gate. | `claude-opus-5-5` | high | Yes | 45 min | 8.00 |

## Remaining

| Stage | Work | Model | Effort | Approved | Estimated time | Estimated cost USD |
|---|---|---|---|---|---|---|
| Hub | Coordination of H1 and H2 | `claude-fable-5-2` | high | Yes | In the stages | about 6.92 |
| Later | Install the skill (operator). Targets ZCode, OpenCode, Cline. `stream-json` sessions for `agy`. | not decided | | No | | |
| Deferred | Cline provider repair: assessment section 7, stages 2 to 5 | not decided | | No | | |

Plan total for H1 and H2 with coordination: about 29.34 USD and about 2 hours 35 minutes of model time. The estimates have no measurement from this project.

## Open decisions and gates

| # | Item | State |
|---|---|---|
| 1 | Live probe: one one-word prompt to each of `claude`, `codex` and `agy`, to capture real output for test fixtures | Done 2026-11-20. `agy`: success. `claude`: failed, OAuth session expired. `codex`: failed, the account rejects `gpt-6.2-astra` (the configured default) and `gpt-5.5`. Real captures are in `test/fixtures/`. |
| 1a | The operator runs `claude auth login` in a terminal | Waiting for the operator. Needed before the H2 live dispatch to `claude`. |
| 1b | The operator names a Codex model that the ChatGPT account accepts | Waiting for the operator. Needed before the H2 live dispatch to `codex`. |
| 2 | Hub effort: the operator can set this session to `medium` to lower the coordination cost | Optional |
| 3 | Assessment decisions 1 and 3 (Codex link strategy, npm and upstream) | Deferred with the Cline repair work |

Gates that always need the operator: a live dispatch or live test, an installer run with `--apply`, a real `fix` run, `git push`, a release, and each message to an external party.
