# Live status

Last update: 2026-11-20, release 0.2.0, by the hub session (`claude-fable-5-2`).

The hub session updates this file at each handoff and at each gate. Section 6 of `AGENTS.md` gives the rules.

## Goal

The operator changed the goal on 2026-11-20. This repository becomes the skill `harness-dispatch`: an agent in one harness sends a task to a different harness (Claude Code, Codex, Antigravity) and gets one JSON result. Specification: `docs/design/harness-dispatch-contract.md`.

The skill must **not** be installed until the operator says so.

## Current state

Release `0.2.0` is on `main` with the tag `v0.2.0`. The skill `harness-dispatch` is built, reviewed, verified by live runs on all three targets, and documented. **The skill is not installed.** The install waits for the operator: `docs/install.md`.

Start here: `README.md`. User documents: `docs/install.md`, `docs/usage.md`, `docs/safety.md`, `docs/troubleshooting.md`, `docs/development.md`. Evidence: `docs/handoffs/2026-11-20-h3-live-verification.md`. Reviews: `docs/handoffs/2026-11-20-h2-result.md`, `docs/handoffs/2026-11-20-h2-result-part2.md`.

Proved by live runs through `hd` on real targets (2026-11-20, Windows 11):

- Dispatch, `--resume`, `--schema` and `--access write` on Claude Code, Codex and Antigravity.
- Read access on each target: a forced write wrote no file, and a read question was answered.
- Codex read runs have no computer-use tool, no connected app and no MCP server.
- Callers: Claude Code desktop, Claude Code CLI and Antigravity ran `hd.mjs`. The CLI and Antigravity need an allow rule for `node`.

Known limits (stated in `docs/safety.md`):

- Codex read runs keep the built-in web tool.
- Antigravity read runs: MCP and browser tools were not tested.
- Codex as the caller failed: its Windows sandbox refused to start `node.exe`.
- ZCode, OpenCode and Cline as the caller: not tested.
- D6 and D7 (POSIX only): open.
- The part 3 code (Codex read hardening) was reviewed by the hub, not by the H2 session.
- The documents of H4 were checked by the hub against the proved state. No separate acceptance session read them.

Tests at the release: 195 tests, 187 pass, 0 fail, 8 skipped. Bundles are current.

Measured cost of the whole project (API list price, table `2026-11-20`, `session-cost.mjs`):

| Session | Model | Calls | USD |
|---|---|---|---|
| H1 build and corrections | `claude-sonnet-5-5` | 160 | 8.57 |
| H2 acceptance and review | `claude-opus-5-5` | 83 | 6.99 |
| H4 documentation and tidy | `claude-sonnet-5-5` | 49 | 1.66 |
| Hub, to the release | `claude-fable-5-2` | 126 | 30.06 |

Total: 47.28 USD. The hub is 64 percent.

Next work, none approved: the install (operator); the Codex web tool in read mode; Codex as the caller; POSIX defects D6 and D7; the targets ZCode, OpenCode and Cline; the deferred Cline provider repair.

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
