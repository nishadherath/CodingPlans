# Live status

Last update: 2026-11-20, by the hub session (`claude-fable-5-2`).

The hub session updates this file at each handoff and at each gate. Section 6 of `AGENTS.md` gives the rules.

## Goal

The operator changed the goal on 2026-11-20. This repository becomes the skill `harness-dispatch`: an agent in one harness sends a task to a different harness (Claude Code, Codex, Antigravity) and gets one JSON result. Specification: `docs/design/harness-dispatch-contract.md`.

The skill must **not** be installed until the operator says so.

## Current state

H1 is approved and starts now. Branch: `feat/harness-dispatch`. Nothing is pushed.

## Completed

| Stage | Result | Cost (API list price) |
|---|---|---|
| 0. Assessment | `docs/analysis/2026-11-20-project-assessment.md` | 6.39 USD measured at 13 calls |
| 0. Project configuration | `AGENTS.md`, `CLAUDE.md`, this file | Included in the hub session |
| 0. Contract and dispatch decision | `docs/design/harness-dispatch-contract.md`, `docs/handoffs/2026-11-20-h1-harness-dispatch-build.md` | Hub session, not yet measured |

## In progress

| Stage | Work | Model | Effort | Approved | Estimated time | Estimated cost USD |
|---|---|---|---|---|---|---|
| H1 | Build: engine, three adapters, CLI, tests, bundle, skill file, installer. Legacy defects D1 and D2. | `claude-sonnet-5-5` | high | Yes, 2026-11-20 | 90 to 110 min | 14.28 |

## Remaining

| Stage | Work | Model | Effort | Approved | Estimated time | Estimated cost USD |
|---|---|---|---|---|---|---|
| H2 | Adversarial acceptance. One live dispatch for each target (gate). | `claude-opus-5-5` | high | Starts after H1 passes its oracle | 45 min | 8.00 |
| Hub | Coordination of H1 and H2 | `claude-fable-5-2` | high | Yes | In the stages | about 6.92 |
| Later | Install the skill (operator). Targets ZCode, OpenCode, Cline. `stream-json` sessions for `agy`. | not decided | | No | | |
| Deferred | Cline provider repair: assessment section 7, stages 2 to 5 | not decided | | No | | |

Plan total for H1 and H2 with coordination: about 29.34 USD and about 2 hours 35 minutes of model time. The estimates have no measurement from this project.

## Open decisions and gates

| # | Item | State |
|---|---|---|
| 1 | Live probe: one one-word prompt to each of `claude`, `codex` and `agy`, to capture real output for test fixtures | Waiting for the operator |
| 2 | Hub effort: the operator can set this session to `medium` to lower the coordination cost | Optional |
| 3 | Assessment decisions 1 and 3 (Codex link strategy, npm and upstream) | Deferred with the Cline repair work |

Gates that always need the operator: a live dispatch or live test, an installer run with `--apply`, a real `fix` run, `git push`, a release, and each message to an external party.
