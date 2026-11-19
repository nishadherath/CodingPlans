# CodingPlans: project assessment

| Item | Value |
|---|---|
| Date | 2026-11-20 |
| Assessed commit | `cb19250` on `main` (tag `v0.1` exists) |
| Assessor | Claude Fable 5.2 (`claude-fable-5-2`), effort high |
| Scope | All 22 tracked files. There is no `seed/` directory. |
| Method | Full read of each file. Read-only commands on the operator's Windows 11 machine. No source file was changed. |
| Not done | No live verification. A live run uses model tokens and plan quota, and the operator did not approve it. |

> **Update, 2026-11-20.** After this assessment the operator changed the goal: the repository becomes the skill `harness-dispatch`. Sections 1 to 6 and 9 stay valid as a record of the Cline provider code. The staged plan in section 7 and the decisions in section 8 are deferred. The current plan is in `docs/design/harness-dispatch-contract.md` and `docs/STATUS.md`.

Confidence labels in this document:

- **Confirmed**: I ran a command and saw the result.
- **By reading**: the code shows the defect. I did not run the failure.
- **Not verified**: a risk that I could not test.

## 1. Summary

The reason for this project is correct and the diagnosis is strong. The repair path is not yet correct.

1. The package finds the real cause of a Cline defect: Cline starts `codex` by bare name, and on Windows only a real `.exe` can start that way.
2. The read-only commands (`doctor`, `verify`) work from `dist/`.
3. The command that npm installs (`bin/coding-plans.mjs`) does not start. One import path is wrong.
4. The `fix` command cannot repair a clean Windows machine. It cannot find the Codex binary, and it cannot start `npm`.
5. The reference machine passes only because `codex.exe` was copied by hand on 2026-09-12, before the commit.
6. The unit tests pass, but they do not cover any of these failures. There is no continuous integration.

The project is a validated diagnosis with an incomplete product around it. The corrections are small and well bounded. Estimated cost of all recommended work: 23 USD at API list price (section 7).

## 2. Deliverables

| # | Deliverable | Location | State |
|---|---|---|---|
| 1 | Command-line tool `coding-plans` with `doctor`, `fix`, `verify`, `setup`, `plans` | `bin/coding-plans.mjs` | Does not start (defect D1) |
| 2 | Library API for programs | `src/index.mjs` | Loads. `fix` has defects. |
| 3 | Single-file distribution for machines without npm | `dist/coding-plans.mjs`, `dist/cli.mjs` | Works for `help`, `plans`, `doctor` |
| 4 | Root-cause record of the Cline and Codex spawn defect | `README.md`, source comments, commit message | Accurate and useful |
| 5 | Regression test for the Windows shim condition | `test/detect.test.mjs` | Passes |
| 6 | Optional live tests | `test/live.test.mjs` | Skipped by default. Can pass with no assertion. |
| 7 | Bundler script | `scripts/build-dist.mjs` | Works. Output matches the committed `dist/`. |

Supported plans: `claude-code` (Claude Code CLI) and `openai-codex-cli` (OpenAI Codex CLI). Licence: Apache-2.0.

## 3. How it works

### 3.1 The problem

Cline has two CLI-backed providers. Each needs four things: the CLI is installed, the CLI can start by bare name, an optional peer package resolves, and the CLI is authenticated.

Cline resolves an executable path for Claude. It does not do this for Codex. The Codex provider package then starts the bare name `codex`. On Windows, npm installs `codex` as a script shim and `codex.cmd`. The Cline host is a Bun binary that starts processes through libuv, and libuv does not start those files by bare name. The result is `ENOENT`.

The package therefore keeps two facts apart: **installed** (a file exists) and **spawnable** (a real executable is on `PATH`).

### 3.2 Modules

| Module | Function |
|---|---|
| `src/plans.mjs` | The catalogue. One entry for each plan: CLI name, peer package, default model, login command, verification arguments. |
| `src/detect/cli.mjs` | Finds the CLI on `PATH`, in user install directories, and in the npm vendor directory. Reports installed and spawnable. |
| `src/detect/cline.mjs` | Finds the compiled Cline host and the `@cline/llms` manifest. |
| `src/fix/executable.mjs` | Puts a real executable on `PATH` by symlink or copy. Has a staleness check for copies. |
| `src/fix/peers.mjs` | Lists global `node_modules` roots. Checks and installs the peer package. |
| `src/check/auth.mjs` | Reads authentication state from each CLI. Does not start a login. |
| `src/check/verify.mjs` | Two verification layers: the CLI alone, then the real Cline host. |
| `src/setup.mjs` | Orchestration: `doctor`, `fix`, `verify`, `setup`. |
| `src/util/exec.mjs`, `src/util/log.mjs` | Child processes with timeouts. Console output. |
| `bin/coding-plans.mjs` | Argument parser and report printers. |
| `scripts/build-dist.mjs` | Regex bundler. Wraps each module in a function and writes `dist/`. |

### 3.3 Command flow

- `doctor` (read-only): for each plan, detect the CLI, stop if it is missing, then report spawnable state, peer package, and authentication. Exit code 1 if a problem has severity `error`.
- `fix`: detect, stop if the CLI is missing, link a real executable to a `PATH` directory, install the peer package globally, report authentication. It does not start a login.
- `verify`: layer 1 sends a one-word prompt to the CLI. Layer 2 sends the same prompt through the Cline host and checks that `run_result.model.provider` equals the plan id. A missing host gives the state `UNVERIFIED`.
- `setup`: `fix`, then `verify`.

### 3.4 Design decisions that are correct

1. Installed and spawnable are different facts. This is the central idea and it is right.
2. The host layer checks the provider id. A pass in the CLI layer cannot look like a full pass.
3. `UNVERIFIED` is a third state, different from pass and fail.
4. The tool does not automate an interactive login.
5. A missing CLI stops the plan. The tool does not write a half-configured state.
6. No runtime dependencies. Comments give the reason, not only the action.
7. Problem codes are stable identifiers. `--json` and `--dry-run` exist.

## 4. Assessment

### 4.1 Defects that stop the product

| ID | Defect | Evidence | Confidence |
|---|---|---|---|
| D1 | The npm command does not start. `bin/coding-plans.mjs:21` imports `../src/util/mjs`. The correct path is `../src/util/log.mjs`. `npm run doctor` fails for the same reason. | `node bin/coding-plans.mjs help` gives `ERR_MODULE_NOT_FOUND`. `dist/cli.mjs` works because the bundler rewrites the path. | Confirmed |
| D2 | Each thrown error becomes `TypeError: error is not a function`. In `bin/coding-plans.mjs:200-205` the parameter `error` hides the logger `error`. | `node dist/cli.mjs doctor --plan bogus` | Confirmed |
| D3 | `fix` cannot install a peer package on Windows. `src/fix/peers.mjs:92` starts the bare name `npm`. On Windows `npm` is `npm.cmd`. The file `src/util/exec.mjs` states the rule that this call breaks. | `run('npm', ['--version'])` gives `spawn npm ENOENT` | Confirmed |
| D4 | `fix` cannot find the Codex vendor binary. `src/detect/cli.mjs:126-134` and `:197` add `node_modules` to roots that already end in `node_modules`. | The binary exists under `C:\nvm4w\nodejs\node_modules\@openai\codex\...\bin\codex.exe`. `findVendorBinary('codex')` returns `undefined`. | Confirmed |
| D5 | The login instruction is wrong: `claude claude auth login` and `codex codex login`. `src/check/auth.mjs:78-80` adds the CLI name to a list that already starts with it. | Output of `authInstruction()` and of `doctor` | Confirmed |

Effect of D3 and D4 together: on a clean Windows machine, `fix` reports `no real codex executable found` and cannot install peers. The main function of the package does not operate there. The reference machine hides this, because `~/.local/bin/codex.exe` dates from 2026-09-12 and has no provenance file.

### 4.2 Defects in correctness and safety

| ID | Defect | Location | Confidence |
|---|---|---|---|
| D6 | The staleness check is never called. `README.md` says that `doctor` reports a stale link. A hand copy has no provenance file, so the check could not see it. | `src/setup.mjs:15` (import only), `src/fix/executable.mjs:173` | By reading |
| D7 | Target directory selection is unsafe. The code takes the first `PATH` entry that exists. It does not test write access and can select a system directory. It reads `env.PATH` only, not `env.Path`. It can create `~/.local/bin` during `--dry-run`. | `src/fix/executable.mjs:27-49` | By reading |
| D8 | After a link, `fix` does not test that the CLI is now spawnable. If the fallback directory is not on `PATH`, `fix` reports success. | `src/fix/executable.mjs:142-164` | By reading |
| D9 | `CLINE_BIN_PATH` has the lowest priority. An override must have the highest. | `src/detect/cline.mjs:82-85` | By reading |
| D10 | Unknown flags are ignored. `--plan` with no value causes D2. The documented exit code 2 for bad usage does not occur in these cases. | `bin/coding-plans.mjs:60-61`, `:87-89` | By reading; D2 path confirmed |
| D11 | On POSIX, a file without the execute permission counts as spawnable in `detectCli`. Two functions use different rules. | `src/detect/cli.mjs:44-50` and `:66-71` | By reading |
| D12 | A symlink with an absolute target is resolved incorrectly (`join` in place of `resolve`). | `src/fix/executable.mjs:119-124` | By reading |
| D13 | A timeout kills only the direct child. On Windows the CLI can leave child processes, and the wait can continue. | `src/util/exec.mjs:73-76`, `:156-159` | Not verified |
| D14 | `setup` runs `verify` after a failed `fix`, and `verify` calls the model when authentication is known to be absent. This uses quota for a certain failure. | `src/setup.mjs:226-230` | By reading |
| D15 | `--model` changes the host layer only. The CLI layer has the model id in a second place. | `src/check/verify.mjs:30-36`, `src/plans.mjs:39`, `:75` | By reading |
| D16 | `doctor --json` prints the account email and the raw authentication text. A user can paste this into an issue. | `src/check/auth.mjs:32-38` | Confirmed (field present) |
| D17 | The copy takes `codex.exe` only. The vendor directory also holds `rg.exe` and two sandbox helpers in sibling directories. The effect on Codex functions is unknown. | Vendor directory listing | Not verified |

### 4.3 Defects in quality and maintenance

| ID | Defect | Confidence |
|---|---|---|
| D18 | Tests cover detection only. No test loads `bin/`, runs `dist/`, parses arguments, or exercises `setup.mjs`, `verify.mjs`, `auth.mjs`, or `detect/cline.mjs`. A one-line smoke test finds D1 and D2. | Confirmed (10 pass, 8 skipped) |
| D19 | Live tests return early when the CLI or the host is absent. They then pass with no assertion. | By reading |
| D20 | There is no continuous integration, no lint configuration, and no changelog. | Confirmed |
| D21 | Dead code and stale comments: `interactiveAuthRequired`, `requiredPeerNames`, `probePeerExport`, `clineVersion`, unused imports (`canExecute` in `auth.mjs`, `resolve` in `cline.mjs`, `checkStaleness` in `setup.mjs`), a leftover marker at `src/detect/cli.mjs:279`, a duplicated `globalRoots`, a comment about a hard link that the code does not make, a bundler comment that contradicts the code, and plan fields that nothing reads (`selfResolvesExecutable`, `auth.status`). | By reading |
| D22 | The claim "plan-agnostic" is not true. Detection has `if (name === "claude")` and Codex-only vendor paths. Authentication has tables keyed by plan id. A third plan needs edits in four modules. | By reading |
| D23 | Model ids will age. `gpt-5.5` and `sonnet` are fixed in code. `README.md` names `gpt-5.6-sol` and then quotes an error about `gpt-6-sol`. One of the two is wrong. | By reading |
| D24 | `package.json` `files` omits `dist/`, but `README.md` gives `node dist/cli.mjs` as an install-free path. | By reading |
| D25 | A new clone on Windows gets CRLF source files (`* text=auto` with the Git default). Only `dist/` is fixed to LF. | Not verified on a new clone |
| D26 | The bundler uses regular expressions. It works today. Two modules that import the same name from two different built-in modules would break it. | By reading |
| D27 | The CLI prints nothing during `verify`. A run can be silent for 4 minutes for each layer. `logStep` exists but nothing calls it. There is no `--version` flag and no command that reverses `fix`. | By reading |

### 4.4 Risks outside the code

1. **npm name (not verified).** `README.md` tells users to run `npm install -g cline-coding-plans`. I did not query the npm registry, because that sends the project name to an external service. If the name is not registered, the instruction fails, and another party can register the name.
2. **Upstream dependency.** The real correction belongs in Cline or in `ai-sdk-provider-codex-cli`. When upstream corrects it, the `fix` command loses most of its purpose. `doctor` and `verify` keep their value.
3. **Verification cost.** Each `verify` makes two model calls for each plan. Each call carries the full system prompt of an agent to get one word back.

### 4.5 Overall judgement

- Diagnosis and design intent: very good. The two-layer verification with the provider id check is the best part.
- Implementation: prototype quality. Five confirmed defects stop the product. All five have small corrections.
- Evidence quality: the commit message reports a pass on one machine. That machine was already repaired by hand, so the pass does not prove that `fix` works.
- Size: about 1,900 lines of source and 215 lines of tests. The corrections do not need a redesign.

## 5. Status

| Item | State on 2026-11-20 |
|---|---|
| Version | 0.1.0, tag `v0.1`, two commits, one author, last commit 2026-09-29 |
| Unit tests | 10 pass, 0 fail, 8 live tests skipped (`npm test`) |
| Bundle | `npm run build:dist` output equals the committed `dist/` after line-ending normalisation |
| `bin/` entry | Broken (D1) |
| `dist/` entry | `help`, `plans`, `doctor` work |
| Local tools | Node 26.7.0, Cline 3.0.65, `@cline/llms` 0.0.86, Codex 0.154.0, Claude Code 2.1.316, peers 2.3.0 and 4.3.3 |
| `doctor`, Codex plan | Healthy: spawnable from `~/.local/bin/codex.exe`, peer present, authenticated |
| `doctor`, Claude plan | Reports not authenticated (status code 1). I do not know the cause. This agent session can change the environment that the CLI sees. Run `claude auth status` in your own terminal to confirm. |
| Live verification | Last claimed pass: commit message of 2026-09-29. Not repeated. |
| Working tree | New files from this assessment. One new line in `.gitignore` for the `graft/` tool cache. |

## 6. Proposed improvements

### 6.1 Make the product operate (highest return)

1. Correct D1, D2, D5, D9, D10. Add a test that starts `bin/` and `dist/` and checks exit codes.
2. Add continuous integration on Windows, macOS and Linux with Node 22 and the current release. The Windows job is the important one.
3. Correct D3: resolve the package manager to an absolute path, or start `npm-cli.js` with the current Node executable.
4. Correct D4: find the vendor binary from the location of the shim on `PATH`, and build the package name from platform and architecture. Add Windows on ARM.
5. Correct D7 and D8: select only a user-owned directory that is on `PATH` and accepts a write. Test spawnable state after the link. Report failure if it is not spawnable.
6. Connect the staleness check to `doctor` (D6). Make `fix` copy again when the copy is stale.
7. Add an `undo` command that removes what `fix` created. A tool that writes to `PATH` must be reversible.

### 6.2 Lower the cost of verification (asymmetric return)

1. Run the host layer first. It includes everything that the CLI layer proves. Run the CLI layer only when the host layer fails or the host is absent. This removes half of the model calls on the success path.
2. Do not call a model when `doctor` already shows a certain failure (D14).
3. In the CLI layer, let the CLI use its own default model. Then no model id in this package can go out of date (D15, D23). Not verified: the host layer still needs a model id for Codex, because the Cline default is rejected.
4. Print the token usage that the host returns. The value `aggregateUsage` is already captured and is not shown.

### 6.3 Make the tool clear and safe for users

1. Print a progress line before each long wait (D27).
2. Remove the email and the raw text from `--json` by default. Add `--include-raw` for local debugging (D16).
3. Add `--version`. Reject unknown flags with exit code 2.
4. Show the missing Cline host as a warning in `doctor`.
5. Test what Codex loses without its sibling helpers (D17). Then confirm or change the link strategy (decision 1).

### 6.4 Reduce maintenance cost

1. Delete the dead code in D21. Less code lowers the token cost of each later session.
2. Move the per-plan detection and authentication rules into `src/plans.mjs`, so that the catalogue is the only place that knows a plan (D22). Do this only if a third plan is expected.
3. Keep the regex bundler. Guard it with the smoke test and a check that `dist/` is current. A replacement gives little return while it works.
4. Correct `README.md` where it differs from the code (D6, D23, D24). Add a changelog.
5. Set `*.mjs text eol=lf` in `.gitattributes` (D25).

### 6.5 Strategy

1. Report the defect to Cline with the reproduction from this project. An upstream correction helps every user, with or without this package.
2. Decide the publication state of the npm name (decision 3).
3. Position the package as "doctor and verify for CLI-backed providers". That function stays useful after the upstream correction.

## 7. Staged plan by model

### 7.1 Rules used

- Model class from the `session-dispatch` matrix: scoped work with a stated test goes to the Sonnet class. Mechanical documentation goes to the Haiku class. Acceptance runs one class above the author.
- Prices: `session-dispatch` table `2026-11-20`, Anthropic figures read on 2026-11-10 (10 days old, limit 14). Cache lifetime 1 hour. Baseline context 62,453 tokens (measured in this session).
- Turn counts are estimates with no measurement from this project. Expect an error of 50 percent in either direction.
- All stages touch the same files. They run in series.
- The operator uses a subscription plan. The USD figures are API list-price equivalents. The real effect is on plan quota.

### 7.2 Stages

| Stage | Work | Model | Effort | Turns | Cost USD | Time | Oracle |
|---|---|---|---|---|---|---|---|
| 0 | This assessment | `claude-fable-5-2` | high | done | see `docs/STATUS.md` | done | Operator review |
| 1 | Repair and guard: D1, D2, D5, D9, D10, D11, D12, D21. Smoke tests for `bin/` and `dist/`. CI on three operating systems. | `claude-sonnet-5-5` | high | 60 | 3.75 | 40 min | `npm test` passes with the new tests. CI is green. |
| 2 | Fix path on Windows: D3, D4, D6, D7, D8, D13, D17, `undo`. | `claude-sonnet-5-5` | high | 90 | 6.07 | 70 min | New test: a sandbox `PATH` with shims only, plus the real vendor binary. `fix` must make `codex` spawnable in the sandbox. |
| 3 | Verification cost and CLI behaviour: section 6.2, D14, D15, D16, D19, D23, D27. | `claude-sonnet-5-5` | medium | 70 | 4.47 | 50 min | Unit tests with an injected spawn function. Call count for each scenario is asserted. |
| 4 | Documentation and metadata: `README.md` corrections, changelog, `package.json`, `.gitattributes`. | `claude-haiku-5-5` | medium | 25 | 0.36 | 10 min | A checklist in the handoff. `npm test` stays green. |
| 5 | Adversarial acceptance of stages 1 to 4. One approved live run. | `claude-opus-5-5` | high | 48 | 8.01 | 45 min | A written list of defects found, or none. Live result for both plans. |
| 6 (optional) | Draft the upstream report. Prepare the release. The operator sends and publishes. | `claude-opus-5-5` | high | 25 | 4.28 | 25 min | Operator approval of each outgoing text. |

Totals: stages 1 to 5 cost **22.66 USD** and take about 3 hours 35 minutes of model time. Stage 6 adds 4.28 USD.

Notes on model selection:

1. Stage 2 contains design choices. I move those choices into decision 1 and into the handoff contract. The work then has a stated test and fits the Sonnet class. The same stage on `claude-opus-5-5` costs 17.14 USD. Raise the class only if the Sonnet session fails on reasoning.
2. Stage 4 is small. The Haiku session passes 100,000 tokens of context after about 4 turns, so most turns pay the long-context tier. The calculator prices each turn at its tier, and 0.36 USD includes this.
3. Stage 5 on Opus accepts work that Sonnet wrote. This follows the rule "one class above the author".

### 7.3 Cost of coordination

The operator approved autonomous handoffs. A session that a session starts cannot start sessions. This session must therefore stay open as the hub, and it runs on the most expensive model.

| Mode | Extra cost for stages 1 to 5 | What the operator does |
|---|---|---|
| A. Operator starts each stage from a card | 0 USD | One click for each stage |
| B. This session is the hub, lean checks (about 12 turns for each stage) | about 18 USD (scaled from a calculator run with 7 pieces) | Approves the gates only |
| C. This session is the hub, full checks (30 turns for each stage) | about 51 USD (calculator) | Approves the gates only |

Mode B or C costs about as much as, or more than, the work itself. See decision 2.

### 7.4 Gates in every mode

The operator must approve each of these: a live test, a real `fix` run on this machine, `git push`, `npm publish`, and each message to an external party.

## 8. Decisions for the operator

### Decision 1: how `fix` makes Codex spawnable on Windows

| Option | Advantages | Disadvantages | Blast radius |
|---|---|---|---|
| 1. Copy `codex.exe` to a user directory on `PATH`. Record provenance. Detect a stale copy. Copy again in `fix`. Remove in `undo`. | One file in a user directory. Fully reversible. It is the condition that works on this machine today. | 298 MB copy. The copy goes stale after each Codex update until `fix` runs again. Sibling helpers are not copied (D17). | One file and one marker file |
| 2. Add the vendor `bin` directory to the user `PATH`. | No copy. Never stale. Helpers stay next to the binary. | Changes a persistent user setting. Needs a restart of Cline. Breaks if the npm prefix moves. More code and more risk. | The user environment of the account |
| 3. No write. `doctor` prints the exact manual command. | Zero risk. Least code. | The user does the repair. The package loses its `fix` function. | None |

Recommendation: option 1. It has the smallest blast radius of the options that repair the machine. Stage 2 tests D17. If Codex loses a function without its helpers, I will bring this decision back with that evidence. Confidence: medium.

### Decision 2: coordination mode

Options A, B and C are in section 7.3.

Recommendation: mode B, and set this session's effort to `medium` after the handoffs are written. If cost matters more than your time, select mode A: it saves about 18 USD for about five clicks. Your earlier answer selected autonomy, so I will use mode B unless you tell me differently.

### Decision 3: npm publication and upstream report

| Question | Options | Recommendation |
|---|---|---|
| Is `cline-coding-plans` published on npm? | You tell me, or you approve one registry query. | Tell me. If it is not published, stage 1 changes `README.md` to the clone-and-run instruction until a release. |
| Publish a release? | After stage 5, or not at all. | After stage 5 passes. You run `npm publish`. |
| Report the defect to Cline? | Yes after stage 2, or no. | Yes. Stage 6 drafts the text. You post it. |

## 9. Evidence

Commands that I ran on 2026-11-20 in `D:\Code\Cline\CodingPlans`. All are read-only for the repository.

| Check | Command | Result |
|---|---|---|
| D1 | `node bin/coding-plans.mjs help` | `ERR_MODULE_NOT_FOUND ... src\util\mjs` |
| `dist/` entry | `node dist/cli.mjs help`, `node dist/cli.mjs plans` | Exit 0 |
| D2 | `node dist/cli.mjs doctor --plan bogus` | `TypeError: error is not a function` |
| D3 | `run('npm', ['--version'])` from `src/util/exec.mjs` | `spawn npm ENOENT` |
| D4 | `findVendorBinary('codex')` | `undefined`, and the binary exists in the vendor directory |
| D5 | `authInstruction(plan)` for both plans | `claude claude auth login`, `codex codex login` |
| Tests | `npm test` | 18 tests: 10 pass, 8 skipped |
| Bundle | Build in a scratch copy, compare with `git show HEAD:dist/...` | Identical after CR removal |
| Machine state | `node dist/cli.mjs doctor --json` (email and raw text removed before I read the output) | Section 5 |
| Copy age | `ls ~/.local/bin` | `codex.exe`, 298 MB, 2026-09-12, no `.coding-plans.json` |

## 10. Limits of this assessment

1. I did not run `verify`, `setup`, `fix`, or the live tests.
2. I did not read the Cline source. The statements about `community.ts` come from this project's `README.md` and comments.
3. I did not test on macOS or Linux. Statements about POSIX come from reading the code.
4. I did not query npm or GitHub.
5. Model ids for OpenAI in `src/plans.mjs` are not checked against a current list.
6. This document follows the ASD-STE100 writing rules. I did not check each word against the STE dictionary.
