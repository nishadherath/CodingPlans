---
stage: "H2 harness-dispatch acceptance"
model: claude-opus-5-5
effort: high
status: ready
created: 2026-11-20
from: "Stage 0 hub session (claude-fable-5-2)"
---

# H2: adversarial acceptance of harness-dispatch

## Goal

Find the defects in the H1 build before the operator installs the skill in six harnesses. The author was `claude-sonnet-5-5`. You are one class above the author. Assume that the code has defects that its own tests do not show.

Done means: a written verdict (`accept`, `accept with listed defects`, or `reject`) in `docs/handoffs/2026-11-20-h2-result.md`, with each defect proved by a command or a test, and `npm test` green at the end.

## Scope

Commits `436f612` to the head of `feat/harness-dispatch`. Compare them with `docs/design/harness-dispatch-contract.md`.

## Decisions already made

- The contract is the specification. A CLI's `--help` text wins over the contract where they differ.
- You may correct a defect yourself when the correction is small (about 20 lines), you add a test that fails before it, and `npm test` stays green. Commit each correction separately. List larger defects and do not correct them.
- Do not redesign. Do not change the envelope schema or the command line unless a defect requires it.
- Do not install the skill. Do not push.

## Files and links that matter

- `docs/design/harness-dispatch-contract.md`: the specification.
- `docs/handoffs/2026-11-20-h1-result.md`: the author's final note with its deviations. Check each one. Do not trust it.
- `src/dispatch/` (about 1,300 lines), `src/util/exec.mjs`, `scripts/install-skill.mjs`, `scripts/build-dist.mjs`, `skill/harness-dispatch/SKILL.md`, `test/dispatch/`.
- `test/fixtures/`: three real captures (`antigravity/real-ok.stdout.json`, `claude/real-auth-expired.stdout.json`, `codex/real-model-not-supported.stdout.jsonl`). All other fixtures are synthetic.
- `AGENTS.md`: conduct, ASD-STE100 style, gates.

## Verified facts (hub, 2026-11-20)

- `npm test`: 131 tests, 123 pass, 0 fail, 8 skipped.
- `node scripts/build-dist.mjs --check`: "bundles are current".
- `hd list` and `hd doctor` give one JSON line. `hd run --to nope` gives exit code 2. `HARNESS_DISPATCH_DEPTH=1 hd run ...` gives exit code 4.
- `scripts/install-skill.mjs` with no flag is a dry run and changes no file.
- No `dangerously`, `bypassPermissions` or `shell: true` text is in `src/dispatch`, `bin/harness-dispatch.mjs` or `scripts/install-skill.mjs`.
- On this machine `codex` resolves to a hand copy at `~/.local/bin/codex.exe`. The npm shim path of `resolve` (contract section 7.2) is therefore not exercised here unless a test removes that directory from `PATH`.
- `claude` CLI login is expired. The Codex account rejects `gpt-6.2-astra` (configured default) and `gpt-5.5`. `agy` works.

## Where to look first

These are the places where a defect is most probable. They are leads, not a complete list.

1. `resolve`: the `codex.cmd` shim to `.js` entry path on Windows. Paths with spaces. A shim that names no `.js` file. `agy` not on `PATH`.
2. Timeout: does the process tree stop on Windows, and does the envelope arrive with `timeout` when the child ignores the kill?
3. `agy` prompt as an argument: quotes, new lines, a leading `-`, non-ASCII text, the 24,000 character limit.
4. `stdin` prompts for `claude` and `codex`: an empty prompt, a prompt from a terminal with no pipe, `--prompt` and `--prompt-file` together.
5. Each failure path must print exactly one JSON line on `stdout` and use the correct exit code. Include a child that prints nothing, prints two JSON objects, or prints text before the JSON.
6. Codex `resume`: the argument order, and the options that `resume` does not accept.
7. `--schema`: a missing file, a file that is not JSON, and the difference between `claude` (schema text) and the others (file path).
8. Temporary files and the log file: cleanup, name collisions between two runs at the same time, content that must not be there (environment, email).
9. Depth guard: is the variable set for the child in every path, and what happens with a value that is not a number?
10. Installer: `--uninstall` without the marker file, a target folder that exists and has other content, `--home` with a relative path, path traversal through `--target`.
11. `SKILL.md`: does each command in it run as written, on PowerShell and on a POSIX shell? Is it under 120 lines? Does a harness that gives no skill folder path still find `hd.mjs`?
12. Bundle parity: does `hd.mjs` behave as `bin/harness-dispatch.mjs` for each command?
13. POSIX: read the code for Windows-only assumptions. You cannot run it there.
14. `README.md` and `package.json`: statements that the code does not support.

## Gates

Stop and ask the hub before: a live dispatch (`hd run` against a real target, or any `claude -p`, `codex exec`, `agy -p`), `install-skill.mjs --apply` on the real home directory, `git push`, a release, or a message to an external party. Use a temporary `--home` for installer tests.

The hub asks the operator for approval of one live `hd run --to antigravity` with `--access read`. Do not run it until the hub tells you that it is approved.

## If you are blocked

Write five lines: what you tried, what failed (with the output), the probable cause, the options, and your recommendation.

## Exact next action

Read the contract, then read `src/dispatch/index.mjs` and `src/dispatch/resolve.mjs`.

## Result file format

`docs/handoffs/2026-11-20-h2-result.md`: the verdict; a table of defects (id, severity `blocks install` / `correct soon` / `minor`, file and line, the command that proves it, corrected by you or open); the author's deviations and your judgement of each; the `npm test` summary line; what you did not check. Commit the file. Then give the same content in your final note, in not more than 40 lines.

## Cost projection

API list price, `session-dispatch` table `2026-11-20`. The projection is for the operator. It is not a limit for you.

| Piece | Projected USD | T projected | Calls measured | Measured USD | Source |
|---|---|---|---|---|---|
| H2 acceptance (`claude-opus-5-5`, high) | 8.00 | 48 | pending | pending | `node scripts/session-cost.mjs <transcript>` |

## Time projection

About 45 minutes of model time. Operator review of the result: 10 minutes.

## Session dispatch decision

Decided in the H1 handoff (`docs/handoffs/2026-11-20-h1-harness-dispatch-build.md`, Step B, piece H2). The inputs did not change: fresh session, matrix row 4, one class above the author, effort high, in series after H1.
