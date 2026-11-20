# Live status

Last update: 2026-11-20 12:45, during the H2 review of H3, by the hub session (`claude-fable-5-2`).

The hub session updates this file at each handoff and at each gate. Section 6 of `AGENTS.md` gives the rules.

## Goal

The operator changed the goal on 2026-11-20. This repository becomes the skill `harness-dispatch`: an agent in one harness sends a task to a different harness (Claude Code, Codex, Antigravity) and gets one JSON result. Specification: `docs/design/harness-dispatch-contract.md`.

The skill must **not** be installed until the operator says so.

## Current state

H3 (live verification and corrections) is implemented and passes the hub oracle. The H2 session reviews the diff now. Evidence and proof status: `docs/handoffs/2026-11-20-h3-live-verification.md`. Branch: `feat/harness-dispatch`. Nothing is pushed. The skill is not installed.

Proved by live runs on 2026-11-20, through `hd` on real targets:

- Dispatch, `--resume`, `--schema` and `--access write` on Claude Code, Codex and Antigravity.
- Read access: a forced write wrote no file on each target, and a read question was answered on each. The first mappings were not enforced on any target; all three were corrected (D9 is the Claude case).
- Callers: Claude Code desktop, Claude Code CLI and Antigravity ran `hd.mjs`. The CLI and Antigravity need an allow rule for `node`.

Not resolved:

- Codex read access does not cover its computer-use tool and connected apps. Operator decision pending: document the limit, test a Codex profile, or require an explicit flag.
- Codex as the caller failed: its Windows sandbox refused to start `node.exe`.
- ZCode, OpenCode and Cline as the caller: not testable, no headless entry found.
- D6 and D7 (POSIX only), from the first H2 result.

Tests at `1524e49`: 178 tests, 170 pass, 0 fail, 8 skipped. Bundles are current.

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
