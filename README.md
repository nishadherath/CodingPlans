# CodingPlans

Enable **CLI-backed coding plans** as model providers in [Cline](https://cline.bot) —
currently **Claude Code** and **OpenAI Codex** — and prove they actually work.

Cline already ships both providers (`claude-code` and `openai-codex-cli`). What it
does *not* ship is the setup, and the setup is where it breaks. This package
automates the parts that can be automated, refuses to fake the parts that cannot,
and verifies the result through the same code path Cline actually uses.

---

## Why this exists

Adding these providers is four things, and three of them fail silently:

| # | Requirement | How it fails when missed |
|---|---|---|
| 1 | The CLI is installed | `spawn ENOENT` at first use |
| 2 | The CLI is **spawnable by name** | `ENOENT: uv_spawn 'codex'` — see below |
| 3 | The optional peer package resolves | `The ... provider requires the optional 'ai-sdk-provider-*' package` |
| 4 | The CLI is authenticated | `Failed to authenticate: OAuth session expired` |

### The bug this package was written for

`claude-code` and `openai-codex-cli` are **not symmetric** in Cline's own source.
From `sdk/packages/llms/src/providers/vendors/community.ts`:

```ts
// Claude: Cline resolves a real executable path itself.
if (defaultSettings.pathToClaudeCodeExecutable === undefined) {
    const executable = resolveClaudeExecutable();      // scans for claude.exe
    ...
}

// Codex: Cline forwards options and stops. No path resolution at all.
const provider = createCodexExec(readOptions(config));
```

So Codex falls through to `ai-sdk-provider-codex-cli`, which tries
`createRequire(...).resolve("@openai/codex/package.json")` and, failing that
inside a Bun-compiled binary, spawns the bare string `"codex"`.

**On Windows that is not spawnable.** `npm` installs `codex` as an extensionless
shim plus `codex.cmd`. Bun's `uv_spawn` does not apply `PATHEXT`, so both fail.
Only a real `codex.exe` works — and npm ships that only inside
`node_modules/@openai/codex/node_modules/@openai/codex-win32-*/vendor/.../bin/`.

`claude` works because the Claude Code installer puts a genuine `claude.exe` in
`~/.local/bin`. **That asymmetry is the whole bug**, and it is why "it's
installed" and "it works" are tracked as two separate facts throughout this tool.

---

## Install

```bash
npm install -g cline-coding-plans
# or, with no install at all:
node dist/cli.mjs doctor
```

Requires **Node 22+** (matching `@cline/llms`) and no other dependencies.

## Use

```bash
coding-plans doctor      # read-only diagnosis; exit 1 if unhealthy
coding-plans fix         # link CLIs onto PATH, install optional peers
coding-plans verify      # prove it works, through the real Cline host
coding-plans setup       # fix, then verify
coding-plans plans       # list supported plans
```

Useful flags: `--plan <id>` (repeatable), `--json`, `--dry-run`, `--no-host`,
`--cwd <path>`, `--model <id>`, `--timeout <ms>`, `--no-color`.

Exit codes: `0` healthy · `1` unhealthy · `2` bad usage.

### Programmatic

```js
import { setup, detectCli } from "cline-coding-plans";

const { results, summary } = await setup({ selection: ["openai-codex-cli"] });
if (!summary.ok) console.error(summary.errors);
```

---

## What each command does

### `doctor` — read-only

Per plan, reports and gates on:

- **installed** — any artefact on disk (PATH, `~/.local/bin`, `~/.claude/local`,
  Windows `Programs`, the npm vendor directory, or a bounded filesystem walk).
- **spawnable** — a **real executable** on `PATH`. On Windows a `.cmd`/`.bat`
  shim deliberately does not count, because that is the failure mode above.
- **peer package** — the optional dependency, resolved from the same
  `node_modules` roots Cline's host would use.
- **authenticated** — parsed per CLI (`claude auth status` is JSON;
  `codex login status` is a human sentence plus an exit code).
- **stale link** — a previously *copied* binary (Windows fallback when symlinks
  are unavailable) compared against its source version.

**Hard gate:** if the CLI is not installed the plan is refused with an install
hint, rather than "fixed" into a state that fails at first use.

### `fix` — non-interactive repair only

1. If the CLI is not spawnable, link a real executable onto a `PATH` dir.
   Prefers a symlink; falls back to a copy on Windows / no-symlink filesystems,
   and records provenance next to the copy so `doctor` can detect staleness.
   The target directory is chosen to be one already on `PATH` — on the reference
   machine that is the same `~/.local/bin` that already holds `claude.exe`.
2. Install the missing optional peer package globally, so it is resolvable by
   the Cline host.

**It never performs an interactive login.** `claude auth login` and `codex login`
open a browser and then block on stdin for a code. Spawned from a non-TTY parent
they cannot complete, and killing one mid-flight leaves the user staring at a
dead `localhost:<port>/callback`. This tool reports the exact command to run and
gets out of the way.

### `verify` — layered proof

| Layer | What it proves | Why it exists |
|---|---|---|
| **CLI** | The CLI answers a trivial prompt on its own | Cheap; isolates a broken CLI from a broken host |
| **Host** | The real `cline` binary returns a `run_result` for **our** provider id | The only layer that reproduces the production spawn path |

The host layer asserts `run_result.model.provider === plan.id`, so a green CLI
layer can never be mistaken for end-to-end proof. This distinction is the whole
reason the tool exists: during development the provider layer returned `PONG`
while the compiled host failed with `ENOENT`.

A missing host is reported as **`UNVERIFIED`**, distinct from pass and from fail.

---

## Cross-platform notes

- **Windows** is the hard case; see the bug above. Symlinks need Developer Mode
  or admin, so a copy is used and staleness is tracked.
- **POSIX** needs none of this — `codex` on `PATH` is a real executable. The
  checks still run and report accurately.
- **Discovery is PATH-driven**, not hard-coded to one layout, so nvm, fnm,
  volta, asdf, Homebrew, distro packages, and arbitrary Windows drive layouts
  all work.
- `globalRoots()` is intentionally cross-platform rather than host-conditional:
  machines routinely hold several layouts at once, and probing a missing
  directory is free.

## Model selection

Cline's built-in default for `openai-codex-cli` is **`gpt-5.6-sol`**, which real
ChatGPT accounts reject:

> The 'gpt-6-sol' model is not supported when using Codex with a ChatGPT account.

This package defaults to **`gpt-5.5`** (verified working) and documents the
other candidates in `src/plans.mjs`. Override with `--model`.

## Adding a plan

Edit `src/plans.mjs`. A plan declares its `cli`, `peerPackage`, `peerRange`,
`defaultModelId`, `modelCandidates`, `installHint`, and how to verify. The
gate logic, fixer, and doctor are all plan-agnostic.

---

## Repository layout

```
src/plans.mjs            plan catalogue (the Cline contract per provider)
src/detect/cli.mjs       installed vs spawnable; vendor-binary discovery
src/detect/cline.mjs     locate the compiled Cline host + @cline/llms
src/fix/executable.mjs   link a real executable onto PATH; staleness
src/fix/peers.mjs        global node_modules roots; install optional peers
src/check/auth.mjs       per-CLI auth parsing; never automates login
src/check/verify.mjs     the two verification layers
src/setup.mjs            doctor / fix / verify / setup orchestration
bin/coding-plans.mjs     CLI
scripts/build-dist.mjs   single-file bundler
test/detect.test.mjs     unit tests (no network, no spend)
test/live.test.mjs       opt-in live tests
```

## Tests

```bash
node --test test/            # unit only — free, no credentials
CODING_PLANS_LIVE=1 node --test test/live.test.mjs   # opt-in, costs money
```

Unit tests reproduce the Windows shim-only state in a temp `PATH` and assert it
is reported as *not spawnable* — the original bug, as a regression test.

## License

Apache-2.0


