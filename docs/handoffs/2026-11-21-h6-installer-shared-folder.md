---
model: claude-sonnet-5-5
effort: high
agent: sub-agent of the hub session (Agent tool)
stage: H6, installer targets and document consistency
---

# H6: one shared skill folder for four harnesses, release 0.2.3

Back to the [status](../STATUS.md).

## Goal

Stage H5 proved which folders each harness reads ([the record](2026-11-20-h5-skill-loading-check.md)). The installer does not agree with those facts: it puts a second copy in the own folders of ZCode and OpenCode, and it reports Cline as not supported. The operator decided on 2026-11-21: remove the two own copies, and correct the Cline support. The operator also wants the documents and the repository clean, current and consistent.

## Decisions already made

1. Four harnesses use the shared folder `~/.agents/skills`: ZCode, OpenCode, Cline and DeepSeek Harness. They have no folder of their own in the installer.
2. Three harnesses keep their own folder: Claude Code (`.claude/skills`), Codex (`.codex/skills`), Antigravity (`.gemini/config/skills`). Antigravity does not read the shared folder.
3. The installer keeps one target id for each harness, so an operator can name a harness. The ids `zcode`, `opencode`, `cline` and the new id `deepseek` resolve to the folder of the target `agents`. No target is "unsupported".
4. One folder gets one step. If `--target zcode --target cline` is given, the plan has one step for `.agents/skills/harness-dispatch`. A run without `--target` has at most four steps: `claude`, `codex`, `antigravity`, `agents`.
5. The plan output names the harnesses that the shared folder serves, so the operator sees the reason for the folder.
6. The installer gets no code for the old folders. The hub removed the two old copies on 2026-11-21 with the old installer (`--uninstall --target zcode --target opencode --apply`).
7. The release is version 0.2.3, because `SKILL.md` changes (the list of folders).
8. The hub owns `docs/STATUS.md` and `AGENTS.md`. Do not change them. Do not change the files in `docs/handoffs/` and `docs/analysis/`: they are records.
9. `skill/harness-dispatch/SKILL.md` holds a rule that the operator wrote (the paragraph on Codex Desktop and CLI on Windows). Do not change that paragraph. Change only the list of skill folders, and a statement that the facts below disprove.

## Verified facts (hub, 2026-11-21)

| Harness | Folders that it reads for user skills | Proof |
|---|---|---|
| Claude Code | `~/.claude/skills` | The harness lists the skill |
| Codex | `~/.codex/skills` | A headless run read the skill |
| Antigravity | `~/.gemini/config/skills`, and not `~/.agents/skills` | Its skill list |
| ZCode | `~/.zcode/skills`, `~/.agents/skills` | `zcode.cjs skills list` |
| OpenCode | `~/.config/opencode/skill` or `skills`, `~/.claude/skills`, `~/.agents/skills` | Its log |
| Cline (CLI 3.0.65) | `~/.cline/skills`, `~/.agents/skills` | Its skill list |
| DeepSeek Harness | `~/.dsh/skills`, `~/.agents/skills` | Its slash menu |

State of the machine now: copies of version 0.2.2 are in `~/.claude/skills`, `~/.codex/skills`, `~/.gemini/config/skills` and `~/.agents/skills`. No copy is in `~/.zcode/skills` or `~/.config/opencode/skill`. OpenCode also reads `~/.claude/skills`, so it still finds the skill two times and still writes one "duplicate skill name" warning. That does no harm.

## Files

- `scripts/install-skill.mjs` (180 lines): `TARGETS`, `plan`, the help text.
- `test/dispatch/installer.test.mjs` (153 lines).
- `skill/harness-dispatch/SKILL.md`: the sentence that lists the skill folders.
- Version: `package.json`, `src/dispatch/envelope.mjs` (`VERSION`), then `npm run build:dist`. The documents that name the version: `docs/usage.md`, `docs/safety.md`.
- User documents: `README.md`, `CHANGELOG.md`, `docs/install.md`, `docs/usage.md`, `docs/safety.md`, `docs/troubleshooting.md`, `docs/development.md`, `docs/README.md`, `docs/legacy-cline-providers.md`.
- Specification: `docs/design/harness-dispatch-contract.md` (the installer section). Keep it in agreement with the code.

## Work

1. Change the installer as the decisions say. Keep the code small and keep the reason in comments. Keep dry run as the default, the marker file, `--home`, `--uninstall`.
2. Change the tests. Cover: the default plan, each id that resolves to the shared folder, one step for one folder, `--uninstall`, an unknown id.
3. Set the version to 0.2.3 and rebuild the bundles.
4. Add the entry `0.2.3 (2026-11-21)` to `CHANGELOG.md`: the installer change, the H5 result (all five harnesses load the skill), the removal of the two old copies, and a note for a machine that has the old copies (remove the folders `~/.zcode/skills/harness-dispatch` and `~/.config/opencode/skill/harness-dispatch` by hand).
5. Make the user documents and the specification consistent with the facts above and with each other. Look for: statements that Cline is not supported or has no folder; the old list of six folders; statements that a harness is "not checked"; the old version number; a link or a file name that does not exist; a sentence that contradicts `docs/STATUS.md` sections "Proof state" and "Known limits". Write in ASD-STE100 style (`AGENTS.md` section 7). Do not add a new document.
6. Look for files that do not belong in the repository (stray output, temporary files, files that `git status` shows as untracked). Report them. Do not delete a tracked file without a reason that you state.

## Limits

- Do not run `install-skill.mjs --apply`. Do not run `hd run`, `verify`, `setup`, or a test with `CODING_PLANS_LIVE=1`. Do not run `git commit`, `git push` or `git tag`. Leave your changes in the working tree on the branch that is checked out.
- Do not edit `dist/` or `skill/harness-dispatch/scripts/hd.mjs` by hand. `npm run build:dist` writes them.
- No new dependency. Node 22 or later, ESM.
- Text files use LF.

## Oracle and definition of done

All of these are true:

1. `npm test` reports 0 fail.
2. `npm run check:bundles` reports that the bundles are current.
3. `node bin/harness-dispatch.mjs --version` prints `0.2.3`.
4. `node scripts/install-skill.mjs` (dry run) shows steps for the four folders only, and no step for `.zcode` or `.config/opencode`.
5. `node scripts/install-skill.mjs --target cline --target zcode --target deepseek` (dry run) shows one step, for `.agents/skills/harness-dispatch`.
6. `grep -rn -i "not supported\|unsupported" scripts/install-skill.mjs docs/install.md` finds no statement about Cline.

## Shape of the answer

Reply with: the result of each oracle line (the command and its last output line); a list of the files that you changed, one line each with the reason; a list of each inconsistency that you found and did not correct, with the file and line; a list of stray files. No other text.

## When you cannot continue

Report in five lines: what you tried, what failed, the exact error, what you need, and your best next step. Do not work around a refused permission.

## Projection (for the operator, not an instruction to the agent)

- Sub-agent, `claude-sonnet-5-5`, effort high: about 2.0 USD, 15 to 25 minutes.
- Hub (`claude-fable-5-2`): review of the diff, status, release, about 12 calls, about 3.4 USD, 15 minutes.
- Price source: `session-dispatch` table `pricing/2026-11-20.json`, Anthropic figures fetched 2026-11-10 (11 days of 14), direct API list price.

## Exact next action

Read `AGENTS.md` sections 7 and 8, then `scripts/install-skill.mjs` and its test, then do the work above. After the report, the hub reviews the diff, updates `docs/STATUS.md` and `AGENTS.md`, commits, merges to `main`, tags `v0.2.3` and pushes (the operator approved the push on 2026-11-21). A new install of version 0.2.3 needs a separate approval.

## Session dispatch decision

Run because the operator asked for it, the stage has more than 10 calls, and the hub session was summarised once.

**Inputs.** W 1,000,000, K 970,000, C0 303,206, B 69,145 (usage tool, measured). Compacted: yes. ttl `1h`. T 35, range 25 to 45 (estimate). F 3,000, O 1,500 (defaults). R 12,000, H 2,500 (estimates). M 0. L 0. To 12, coordinator: this session (count: start 1, note 1, review of the diff 4, status and commit 3, release 3). Task type: scoped module work with a stated test, class sonnet; effort high, because the installer is an operator interface. Design-heavy: no, the design decisions are in this file. Outward steps: push and tag, in the hub only, approved by the operator.

**Calculator** (`dispatch.mjs`, formula 2026-11-11, table `2026-11-20`):

```
cost_continue on claude-fable-5-2 = 7.29 USD
cost_fresh on claude-sonnet-5-5   = 5.55 USD  (piece 2.04, cost_coord 3.41 for To 12, handoff 0.10)
crosses = false
Draft verdict: fresh, by cost, margin 1.74 USD (31.4 percent of the smaller; band 10).
```

**Plan.** One piece: a sub-agent on `claude-sonnet-5-5`, effort high, with the oracle above. The coordinator is the hub at high (model note `models/claude-fable-5-2.md` applied, xhigh not measured). The hub reviews the diff before the commit: the reviewer is two classes above the author. A sub-agent and not a session, because the hub needs the result in this turn and holds the release approval.

**Guardrails.** 1: more than 10 calls. 2: not design-heavy. 3: the piece has no outward step; the push is the hub's, and the operator approved it in the request. 4, 5: model from the table, table in date. 6: the hub review is the acceptance; no separate session, and this gap is stated. 7: inside the caps. 8: no class change in a session.

**Adversarial pass.**

1. The case to continue: the hub knows the documents and the facts, the installer is 180 lines, and stage H5 showed that the hub's coordination costs more than To says. A sub-agent's edits to nine documents need a careful review.
2. Inputs. C0, B: measured. T: at T 25 the two plans cost the same (about 5.0 USD each). To: at To 18 the plan costs about 7.2 USD, the same as to continue. Task type: no hidden design decision. R: the sub-agent reads the documents itself. M: no long pause is expected.
3. Adverse value: T 25 with To 18. To continue is then cheaper by about 1.7 USD.
4. T 25 is the low end of the stated range, and To 18 is above the count. The verdict is kept and recorded as fragile: it flips at T of 25 or less, or at To of 18 or more. A reason outside the price supports it: the hub review gives this stage a reviewer of a higher class, and the hub-written stages had none.

**Verdict:** fresh for the code and document work, as a sonnet sub-agent at high effort. The hub keeps the review, the status and the release.

**Cost of deciding.**

| Row | Figure | Source |
|---|---|---|
| Context at start | 303,206 tokens | usage tool |
| Context at end | about 312,000 tokens | self-estimate |
| Input tokens read | about 2,500 (calculator output, dry run, folder lists) | self-estimate |
| Output tokens | about 5,500, of which the record is about 900 | self-estimate |
| Wall clock | about 8 minutes | self-estimate |
| Priced | 2,500 at 16.00 and 5,500 at 40.00 USD per million: about 0.26 USD on `claude-fable-5-2`, table `2026-11-20` | computed |
