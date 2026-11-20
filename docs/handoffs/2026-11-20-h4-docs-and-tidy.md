---
stage: "H4 documentation and repository tidy"
model: claude-sonnet-5-5
effort: medium
status: ready
created: 2026-11-20
from: "Hub session (claude-fable-5-2)"
---

# H4: documentation and repository tidy

## Goal

A person who opens this repository for the first time must learn, from linked Markdown files, what the skill `harness-dispatch` is, why it exists, what it lets them do, and how to install and use it. The repository must also be tidy before the hub merges it to `main` and tags it.

Done means: the document set below exists, each statement in it is true for the code at the head of `feat/harness-dispatch`, `npm test` and `npm run check:bundles` pass, and your final note lists what you changed and what you left.

## Decisions already made

- Write all documentation in ASD-STE100 style: short sentences, active voice, one topic for each sentence, the same word for the same thing. No em-dashes.
- The skill is the main product. The Cline provider tool is legacy. It keeps its code and gets one legacy document.
- Do not change behaviour. No change to the logic in `src/`, `skill/harness-dispatch/SKILL.md` or the bundles, except the version string and a rebuild if a tidy item needs it.
- **Do not install the skill.** Do not run `scripts/install-skill.mjs --apply` on the real home directory. The documents describe the install; nobody performs it.
- No live dispatch (`hd run` against a real target, `claude -p`, `codex exec`, `agy -p`). `help`, `--version`, `hd list`, `hd doctor`, `hd models --to antigravity` and the installer dry run are permitted.
- No merge, no tag, no push. The hub does those after your work passes its check.
- Version of this release: `0.2.0`. Tag (made by the hub): `v0.2.0`.

## Document set

Each file links to the others where a reader needs them. `README.md` links to every file in this list, directly or through `docs/README.md`.

| File | Content |
|---|---|
| `README.md` | Replace the present file. In this order: what the skill is (3 sentences); why it exists; what you can do with it (concrete examples: a second opinion from a different vendor's model, a task on a cheaper model, work on a subscription that has quota left); how it works in one short paragraph and one diagram in text; quick start (`hd list`, `hd doctor`, one `hd run` example); supported targets and callers as a table with the proof state; known limits (short, with a link); links to the other documents; licence. Not more than about 150 lines. |
| `docs/install.md` | Requirements (Node 22 or later, the target CLIs, a sign-in for each). The installer: dry run, `--apply`, `--target`, `--home`, `--uninstall`, the marker file. The folder of each harness. What each caller harness needs so that its shell can run `node` (Antigravity: an allow rule `command(node)`; Claude Code CLI: a `Bash(node:*)` rule). Manual install by copy. How to check the install. |
| `docs/usage.md` | Each command and flag, checked against `node bin/harness-dispatch.mjs help`. How to give the prompt. One example for each target. The envelope, field by field. The exit codes and error codes. `--resume`, `--schema`, `--access`. The depth guard. The environment variables. How to write a good brief. |
| `docs/safety.md` | What read access and write access mean for each target, exactly as the live runs prove it. The known limits. The rule about content from a source that you do not trust. What the skill never does (no bypass flags, no shell, no fixed model id). |
| `docs/troubleshooting.md` | One entry for each `error.code`: the cause and the action. Also: an old Codex CLI on `PATH`, a target that is not signed in, a usage limit, a caller that cannot run `node`, the log file. |
| `docs/development.md` | Repository layout. Tests, bundles, fixtures (real and synthetic). How to add a target (the adapter interface). The rule: no live dispatch in tests. |
| `docs/legacy-cline-providers.md` | The content of the present `README.md` from "Enable CLI-backed coding plans" to the end, with a first paragraph that says it is the legacy tool, that its known defects are in `docs/analysis/2026-11-20-project-assessment.md`, and that its repair is deferred. Do not rewrite the body. |
| `docs/README.md` | An index of `docs/`: the user documents above, then the project records (`STATUS.md`, `design/`, `analysis/`, `handoffs/`) with one line for each. |
| `CHANGELOG.md` | `0.2.0` (2026-11-20): the skill, the three targets, the installer, the legacy command repaired (D1, D2). `0.1.0`: the first Cline provider tool. |

Sources of truth, in this order: the code and `hd help`; `docs/design/harness-dispatch-contract.md`; `skill/harness-dispatch/SKILL.md`; "Final proof status" and the sections after it in `docs/handoffs/2026-11-20-h3-live-verification.md`; "Known limits" in `docs/STATUS.md`. When a document and the code differ, the code wins and you write what the code does.

State of proof that the documents must give (2026-11-20, live runs on Windows 11):

- Targets: Claude Code, Codex, Antigravity. Dispatch, `--resume`, `--schema`, `--access write` and enforced read access are proved on each.
- Callers: Claude Code desktop, Claude Code CLI and Antigravity are proved. Codex as the caller failed (its Windows sandbox refused to start `node.exe`). ZCode, OpenCode and Cline are not tested as callers; the installer has their folders.
- Limits: Codex read runs keep the built-in web tool. Antigravity read runs: MCP and browser tools were not tested. In write mode, Claude Code refuses each shell command that needs approval. POSIX is not tested, and two POSIX defects are open (D6, D7 in `docs/handoffs/2026-11-20-h2-result.md`). The Codex CLI must be recent: version 0.154.0 was rejected by the service, and the skill selects the newest Codex binary that it finds, including the one inside Codex Desktop.

## Tidy list

1. `package.json`: `name` `harness-dispatch`, `version` `0.2.0`, add `"private": true` (it stops an accidental `npm publish`; the operator has not decided to publish), keywords for the skill, a script `hd` for `node bin/harness-dispatch.mjs`. Keep the legacy `bin` entry. Make the `--version` output of `hd` agree with `0.2.0` and rebuild the bundles if the version is in them.
2. Rename `test/dispatch/part1.test.mjs` and `part3.test.mjs` to names that say what they test. Use `git mv`.
3. Remove each fixture that no test reads. Remove each synthetic fixture that a real one replaces, if its test can use the real one with no loss.
4. `docs/handoffs/2026-11-20-h1-harness-dispatch-build.md` holds the Windows account name in three paths. Replace it with `%USERPROFILE%` or `%LOCALAPPDATA%` forms. Search all tracked files for the same name and do the same.
5. `.gitattributes`: make text files LF in the working tree for every text type in the repository (`* text=auto eol=lf`), keep the `dist` and skill bundle rules, then run `git add --renormalize .` and commit the result alone. The working tree is LF now, so the diff must be empty or line-ending only.
6. `AGENTS.md` section 8 "Project facts": make the commands and paths current. Do not change sections 1 to 7.
7. Look for files that are not used: stale scripts, empty folders, leftover markers such as `// MARKER_SPLIT_DETECT_CLI` in `src/detect/cli.mjs` (remove that one line and rebuild the bundles). Do not remove legacy modules.
8. Add `test/docs.test.mjs`: each relative link in `README.md`, `CHANGELOG.md` and `docs/*.md` (not the sub-folders) points to a file that exists, and each file of the document set can be reached from `README.md`.
9. Do not edit `docs/STATUS.md`. The hub owns it.

## Verified facts (hub, 2026-11-20)

- Head of `feat/harness-dispatch`: the commit that holds this file. `npm test`: 192 tests, 184 pass, 0 fail, 8 skipped. `check:bundles`: current.
- The repository on GitHub is private. `main` equals `origin/main` at `cb19250`. The only branches are `main` and `feat/harness-dispatch`. There is one worktree.
- `hd list` on this machine finds `claude` 2.1.316, `codex` 0.167.0-alpha.4.1 (Codex Desktop) and `agy` 1.5.13.

## Unresolved questions

- None that block you. If a statement that the table asks for is not true in the code, write the true statement and list the difference in your note.

## If you are blocked

Write five lines: what you tried, what failed (with the output), the probable cause, the options, your recommendation.

## Exact next action

Run `node bin/harness-dispatch.mjs help` and read `skill/harness-dispatch/SKILL.md`, then write `README.md`.

## Final note format

The commits (hash and one line), the `npm test` summary line, the list of documents with their line counts, each tidy item as done or not done with the reason, and each place where the code differed from this handoff. Not more than 30 lines, ASD-STE100.

## Cost projection

API list price, `session-dispatch` table `2026-11-20`. The projection is for the operator. It is not a limit for you.

| Piece | Projected USD | T projected | Calls measured | Measured USD | Source |
|---|---|---|---|---|---|
| H4 documentation and tidy (`claude-sonnet-5-5`, medium) | 2.98 | 35 | pending | pending | `node scripts/session-cost.mjs <transcript>` |
| Hub: check, merge, tag, push, clean-up (`claude-fable-5-2`) | 2.63 | 8 | pending | pending | same |

## Time projection

H4: about 35 minutes of model time. Hub: about 10 minutes. No operator step is needed unless the push asks for credentials.

## Session dispatch decision

Date: 2026-11-20. Decided by: `claude-fable-5-2`, effort high, Claude Code desktop. Price table `pricing/2026-11-20.json` (Anthropic family 10 days old, limit 14). Formula 2026-11-11. Model note `models/claude-fable-5-2.md` applied.

| Input | Value | Source |
|---|---|---|
| W, K, C0 | 1,000,000; 970,000; 605,000 | Usage tool: 602,266 measured, plus this turn |
| B | 67,408 | Usage tool total minus Messages |
| ttl, compacted | 1h, no | Harness |
| T, F, O | 35 (range 25 to 70); 3,000; 3,000 | Estimates. O is the writing-heavy value. |
| R, H | 30,000; 3,000 | Contract, `SKILL.md`, H3 evidence sections, `STATUS.md`, this file: estimate from sizes |
| M, L | 0, 0 | No pause planned. The sources are on disk. |
| To, coordinator | 8, this session | Check 4, merge and push 3, record 1. The operator's instruction gives the merge and push to the hub. |
| Task type | Matrix row 2 (scoped work with a stated test) for H4 | The document set, the sources and the link test are named. |
| Irreversible or outward-facing steps | Merge to `main`, tag, push, branch deletion | Done by the hub (Fable class), on the operator's instruction of 2026-11-20 |

```
cost_continue on claude-fable-5-2, T 35 = 12.53 USD
cost_fresh on claude-sonnet-5-5, T 35   =  5.73 USD (piece 2.98, handoff 0.12, cost_coord 2.63)
existing H1 session, sonnet, C0 about 430,000, T 35 = 3.76 USD by hand, plus the same cost_coord
```

Draft verdict: fresh, by cost, margin 6.80 USD (119 percent of the smaller). A fresh session is also 26 percent cheaper than the existing H1 session, and a writer who has not seen the build reads the documents as a new user does.

Guardrails: 1: T is above 10. 2: not design-heavy; no compaction ahead (C_end 815,000 for the continue side, and the hub adds about 50,000). 3: the outward steps stay with the hub and have the operator's instruction. 4, 5: table in date. 6: the hub checks the documents against the code; no separate acceptance session, because the stage changes no behaviour. 7: under the cap. 8: no class change.

Adversarial pass. Opposite verdict: the hub knows every limit and every proof, and a fresh writer can state a limit wrongly, which is the one error that matters in these documents. Inputs: T can double (many documents); R omits the source files that the writer opens to check flags; the effort `medium` can be too low for accuracy. Recompute at T 70 and To 16: continue 27.13 USD (and it crosses the compaction point), fresh 11.77 USD. The verdict holds, and at T 70 the continue side also breaks guardrail 2's spirit. Mitigation for the accuracy risk: the proof state is written in this handoff, and the hub reads `README.md` and `docs/safety.md` in full before the merge.

Cost of deciding: context at start 602,266 (usage tool); at end about 612,000 (self-estimate); output about 3,500 tokens (self-estimate); about 6 minutes; about 0.30 USD, table `2026-11-20`.
