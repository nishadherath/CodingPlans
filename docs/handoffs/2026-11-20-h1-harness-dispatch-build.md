---
stage: "H1 harness-dispatch build"
model: claude-sonnet-5-5
effort: high
status: ready
created: 2026-11-20
from: "Stage 0 hub session (claude-fable-5-2)"
---

# H1: build the harness-dispatch skill

## Goal

Implement version 1 of the `harness-dispatch` skill as `docs/design/harness-dispatch-contract.md` specifies. Done means section 12 of the contract is true: `npm test` passes, the bundles are current, and your final note lists each deviation from the contract with its reason.

Do not install the skill. Do not call a model.

## Decisions already made

Do not reopen these.

- The contract is the specification. Where the contract and a CLI's `--help` text differ, the help text wins. Record the difference.
- Default access is read-only. There is no bypass option. Reason: a dispatched agent runs with no person at the prompt.
- A depth guard stops dispatch loops (contract section 8).
- No model id is fixed in code. Reason: fixed ids go out of date (assessment defect D23).
- Legacy `coding-plans` code stays. Correct only D1 (`bin/coding-plans.mjs:21`, import `../src/util/log.mjs`) and D2 (`bin/coding-plans.mjs:200-205`, the parameter `error` hides the logger). Reason: Cline is a later target.
- No runtime dependency and no development dependency. Tests use `node:test`.
- All work goes to the branch `feat/harness-dispatch`. Commit in small steps. Do not push.

## Files and links that matter

- `docs/design/harness-dispatch-contract.md`: read all of it first.
- `AGENTS.md`: conduct, documentation style (ASD-STE100), gates.
- `src/util/exec.mjs`: `run` and `stream`. The timeout kills only the direct child (lines 73-76, 156-159). Contract section 8 rule 4 requires a tree kill.
- `src/detect/cli.mjs`: `findSpawnableOnPath`, `findAllOnPath`. Reuse them for `resolve`.
- `scripts/build-dist.mjs`: the regex bundler. It supports named imports and exports only. It has no support for `export default` or `export *`. Write `src/dispatch/` in the forms that it supports, or extend it and test the result.
- `test/detect.test.mjs`: the style for tests with temporary directories.
- `docs/analysis/2026-11-20-project-assessment.md`: read section 4 only if you need the reason for a defect id.

## Verified facts

- `node bin/coding-plans.mjs help` fails with `ERR_MODULE_NOT_FOUND` (2026-11-20). `node dist/cli.mjs help` works.
- `npm test`: 10 pass, 8 skipped (2026-11-20). Node is 26.7.0. The shell is PowerShell; Git Bash is available.
- A Node child process cannot start `npm`, `codex` or another `.cmd` shim by bare name: `spawn npm ENOENT` (2026-11-20).
- Executables on this machine: `%USERPROFILE%\.local\bin\claude.exe` (2.1.316), `%USERPROFILE%\.local\bin\codex.exe` (0.154.0, a hand copy) and shims `C:\nvm4w\nodejs\codex.cmd`, `%LOCALAPPDATA%\agy\bin\agy.exe` (1.5.12).
- The flags in contract section 7 are in the `--help` text of those versions (2026-11-20). `--help`, `--version` and `agy models` make no model call.
- Skill folders that exist: contract section 10.

## Work completed

- Assessment, contract and project instructions. Commit: the head of `feat/harness-dispatch` when you start.

## Unresolved questions

- Real output of `claude -p --output-format json` and `codex exec --json`: field names are not confirmed. The hub asks the operator for a live probe. If the hub sends you real fixtures, replace the synthetic ones. If not, continue with synthetic fixtures.
- An authentication status command for `agy`: not known. Report `unknown` in `hd doctor` if you find none in the help text.

## If you are blocked

Stop and write five lines in your final note: what you tried, what failed (with the output), what you think the cause is, the options, and your recommendation. Do not guess past a gate.

## Gates

Stop and ask before: a command that makes a model call (any `-p`, `exec` or `run` to a real target), `install-skill.mjs --apply` on the real home directory, `git push`, a release, or a message to an external party.

## Exact next action

Read `docs/design/harness-dispatch-contract.md`, then correct D1 and D2 and add the legacy smoke test (contract section 12, item 6).

## Final note format

Reply with: the commits (hash and one line each), the `npm test` summary line, the deviations from the contract, the open questions, and the cost row below if you can measure it.

## Cost projection

API list price, `session-dispatch` table `2026-11-20`, Anthropic figures read 2026-11-10. The projection is for the operator. It is not a limit for you.

| Piece | Projected USD | T projected | Calls measured | Measured USD | Source |
|---|---|---|---|---|---|
| H1 build (`claude-sonnet-5-5`, high) | 14.28 | 135 | pending | pending | `node scripts/session-cost.mjs <transcript>` |
| H2 acceptance (`claude-opus-5-5`, high) | 8.00 | 48 | pending | pending | same |
| Hub coordination (`claude-fable-5-2`) | 6.92 | 12 for each piece | pending | pending | same |

Plan total: 29.34 USD, including 0.14 USD for this handoff.

## Time projection

H1: 90 to 110 minutes of model time. H2: 45 minutes. Operator review: 15 minutes, plus the time to answer the live-probe gate.

## Session dispatch decision

Date: 2026-11-20. Decided by: `claude-fable-5-2`, effort high, in Claude Code desktop. Price table: `pricing/2026-11-20.json` (Anthropic family 10 days old, limit 14). Model note applied: `models/claude-fable-5-2.md`.

### Inputs

| Input | Value | Source |
|---|---|---|
| Formula | 2026-11-11 | Skill step 2 |
| Current model | `claude-fable-5-2` | Harness |
| Target model | `claude-sonnet-5-5` | Matrix row 2 (scoped work with a stated test, public interface: high), then the table |
| W, K | 1,000,000 and 970,000 | Usage tool, measured |
| C0 | 325,000 | Usage tool 307,731 at the start of the turn, plus about 17,000 read since: estimate |
| Compacted already | no | Harness |
| ttl | 1h | Skill step 7, measured default of this harness |
| Unrecorded context | none | The CLI facts and the design are in the contract. The defects are in the assessment. |
| T | 135 (range 100 to 180) | Estimate, n = 0 |
| F, O | 3,000 and 3,000 | Defaults. O is the writing-heavy value: new modules from blank files. |
| B | 62,082 | Usage tool total minus Messages, measured |
| R | 25,000 | Contract 6,500, handoff 3,500, `AGENTS.md` 2,500, source files to read 12,500: estimate from file sizes |
| H | 3,500 | Estimate |
| M, L | 0 and 0 | No pause longer than 1 hour is planned. The unrecorded list is empty. |
| Ta, Ra | 48 and 40,000 | Acceptance piece, model note row "high, acceptance" (1.2 times 40) |
| To | 12 for each piece | Operator's mode B (lean hub): start 1, note 1, oracle 5, record 3, talk 2 |
| Coordinator | this session | A started session cannot start sessions. The operator selected an autonomous hub. |
| Task type | Row 2 for H1. Row 4 for H2. | The contract carries the design, the oracle and the definition of done. |
| Design-heavy | no for H1 | The design choices are closed in the contract. |
| Irreversible or outward-facing steps | none in H1 | The gates are in the brief. |

### Step A

```
G = 6,000   C_end = 865,000 (continue side, T 90 run)   crosses = false
cost_continue on claude-fable-5-2, T 90   = 30.15 USD
cost_fresh on claude-sonnet-5-5, T 90     = 11.86 USD (includes cost_coord 3.30)
T 135, To 0: continue 49.41 USD (crosses K), fresh 14.42 USD
T* = n/a: the model changes
```

Draft verdict: fresh, by cost, margin 18.29 USD (154 percent of the smaller) at T 90.

### Step B

| Piece | Model | Effort | Oracle | Order | Cost USD |
|---|---|---|---|---|---|
| H1 build | `claude-sonnet-5-5` | high | `npm test`, bundle check, contract section 12 | first | 14.28 |
| H2 acceptance | `claude-opus-5-5` | high | Written defect list, one approved live dispatch for each target | after H1 | 8.00 |

Three pieces (engine, packaging, acceptance) priced at 30.56 USD. Two pieces price at 29.34 USD and need one handoff less. The plan uses two pieces. Coordinator: this session, To 12 for each piece, about 6.92 USD. The same turns on a fresh Sonnet coordinator cost about 1.80 USD, but a Sonnet session cannot start the Opus acceptance session.

### Guardrails

1: T is above 10. 2: not design-heavy, no compaction. 3: no outward step; the gates are named. 4 and 5: model from the table, table in date. 6: acceptance is one class above the author, in a fresh session. 7: see the cost of deciding. 8: this session keeps its class; the operator can lower the hub's effort to medium.

### Adversarial pass

1. Opposite verdict: this session holds all the context, and a Sonnet session can read a CLI help text wrongly. One session with no handoff has no coordination cost and no contract gap.
2. Inputs: C0 is an estimate (30 percent more raises the continue side only). T can double. The task hides one design risk: the regex bundler. R omits the help texts that the session reads again (about 6,000 tokens). M can be 1 if the operator's gate answer takes more than 1 hour.
3. Recompute with T 160 and To 30: continue 60.86 USD, fresh 26.75 USD. The verdict holds.
4. No input inside its stated range changes the verdict. Verdict: **fresh, by cost**.

### Cost of deciding

| Row | Value | Source |
|---|---|---|
| Context at start | 307,731 | Usage tool |
| Context at end | about 345,000 | Self-estimate |
| Input tokens read | about 30,000 | Self-estimate: skill text, help texts, calculator output |
| Output tokens | about 7,000 | Self-estimate: contract and this record |
| Wall clock | about 15 minutes | Self-estimate. Over the 10 minute cap. Step 5 was kept to one recompute. |
| Priced | about 0.76 USD | 30,000 at 16.00 plus 7,000 at 40.00 USD for each million, table `2026-11-20` |
