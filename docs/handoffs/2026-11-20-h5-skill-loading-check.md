---
model: claude-sonnet-5-5
effort: medium
agent: sub-agent of the hub session (Agent tool)
stage: H5, skill loading check
---

# H5: check that five harnesses load the skill

Back to the [status](../STATUS.md).

## Goal

The operator wants proof that each of these harnesses loads the installed skill `harness-dispatch`: Antigravity, ZCode, DeepSeek Harness, Cline and OpenCode.
"Loads" means: the harness finds the skill and offers it to its agent. A folder on disk is not proof.

This stage does the part that needs no model call. The hub does the part that needs a model, after the operator approves it.

## Decisions already made

- You do not make a model call. You do not start a chat, a prompt or a task in a harness. A model call uses plan quota, and only the operator approves that.
- You do not install, copy, move or delete a skill. You do not change a settings file. You do not run `install-skill.mjs --apply`.
- You do not run a command that downloads a package (`npx`, `pnpm add`, `cline skill`, `dsh plugin`, an update command).
- You write no file in the repository. Use the scratchpad folder of your session for temporary files.
- You do not print a credential, a token, an API key or an account e-mail. Some configuration files hold them (`credentials.json`, `provider_config.json`, `globalState.json`). Read only the keys that you need, and replace each secret with `<redacted>`.

## Verified facts (hub, 2026-11-20, Windows 11)

Installed copies of the skill, version 0.2.2, each with `SKILL.md` and `scripts/hd.mjs`:

- `~/.gemini/config/skills/harness-dispatch` (Antigravity)
- `~/.zcode/skills/harness-dispatch` (ZCode)
- `~/.config/opencode/skill/harness-dispatch` (OpenCode). The folder `~/.config/opencode/skills` does not exist.
- `~/.agents/skills/harness-dispatch` (shared agents folder)
- `~/.claude/skills/harness-dispatch`, `~/.codex/skills/harness-dispatch`
- Cline: no copy. `~/.cline` has no `skills` folder.
- DeepSeek Harness: no copy. The installer has no entry for it.

Programs:

| Harness | Program | Notes |
|---|---|---|
| Antigravity | `%LOCALAPPDATA%\agy\bin\agy.exe`, version 1.5.13 | Subcommands: `plugin`, `agents`, `models`, `mcp`, `help`. The flag `--disable-slash-commands` names "skill expansion". Desktop app: `%LOCALAPPDATA%\Programs\Antigravity`. Data: `~/.gemini/config`, `~/.antigravity`. |
| ZCode | `%LOCALAPPDATA%\Programs\ZCode\ZCode.exe` (desktop) | No `zcode` on `PATH`. Data: `~/.zcode` (`cli`, `v2`, `skills`), `%APPDATA%\ZCode`. |
| DeepSeek Harness | `C:\nvm4w\nodejs\dsh.cmd`, version 0.1.5-rc.1; desktop app in `%LOCALAPPDATA%\Programs\DeepSeek Harness` | Profiles under `$DSH_HOME/profiles`. `dsh --dump-config` and `dsh --dump-default-config` print the profile tree and exit. Data: `~/.deepseek-harness`, `%APPDATA%\@deepseek-ai`. |
| Cline | `C:\nvm4w\nodejs\cline.cmd`, version 3.0.65 | Subcommands: `config`, `skill` (runs `npx skills`, do not run it), `plugin`, `doctor`. Data: `~/.cline`, `%LOCALAPPDATA%\Cline`, `%LOCALAPPDATA%\bot.cline.app`. |
| OpenCode | `%LOCALAPPDATA%\Programs\@opencode-aidesktop\OpenCode.exe` (desktop) | No `opencode` on `PATH`. The desktop app can hold a CLI program in `resources`. Configuration: `~/.config/opencode/opencode.jsonc`. Data: `%APPDATA%\ai.opencode.desktop`. |

A Node child process cannot start a `.cmd` shim by bare name. Use the absolute path.

## Work

For each of the five harnesses, find:

1. The folders that the harness reads skills from. The best source is the harness itself: its program code (an `app.asar` or a bundled script that you can search for the string `skills`), its help text, or a log. The vendor documentation is the second source.
2. If the installed copy is in one of those folders. For Cline and DeepSeek Harness: which folder a copy must be in, and if `~/.agents/skills` is read.
3. Proof that the harness found the skill, from a source that needs no model call: a command that lists skills, a start log, an index or state file that names `harness-dispatch`.
4. The exact command that makes one small model call to prove loading (for example a headless prompt "List the names of your available skills. Do not run a tool."), with the cheapest model that the harness offers. Do not run it. The hub asks the operator.

Stop the work on one harness when you have the answer to items 1 to 4, or when two different sources give nothing.

## Oracle and definition of done

One row for each harness, with an evidence level:

- **A, observed:** output of the harness itself names `harness-dispatch`. Quote the line and give the command or the file path.
- **B, expected:** the program code or the vendor documentation names a folder, and the copy is in that folder. Give the file path and line, or the URL.
- **C, not known:** say what you tried.

The stage is done when each harness has a row with a level and a source that the hub can check with one command.

## Shape of the answer

Reply with one table (harness, skill folders that the harness reads, copy in place, evidence level, source, live command for the hub) and a list of defects found, one line each. An example of a defect: the installer writes to a folder that the harness does not read. No other text.

## When you cannot continue

Report in five lines: what you tried, what failed, the exact error, what you need, and your best next step. Do not work around a refused permission.

## Projection (for the operator, not an instruction to the agent)

- Sub-agent, `claude-sonnet-5-5`, medium effort: 1.70 USD or less, 10 to 15 minutes.
- Hub (`claude-fable-5-2`): start, check and record, about 10 turns, 1.6 to 2.0 USD, 10 minutes and the time for the operator's approval.
- Price source: `session-dispatch` table `pricing/2026-11-20.json`, Anthropic figures fetched 2026-11-10, direct API list price.

## Open questions

- Does a no-model proof exist for the desktop apps (ZCode, OpenCode, DeepSeek Harness)?
- Do Cline and DeepSeek Harness read `~/.agents/skills`?

## Exact next action

Read `AGENTS.md` section 8 for the project facts, then do the work above. The hub checks each row, asks the operator about the live checks, and writes the results to `docs/STATUS.md`.

## Result (hub, 2026-11-20)

The sub-agent made no model call and changed no file. The hub ran each check command below, and each one gave the stated result.

| Harness | Folders that the harness reads for user skills | Copy that it finds | Level | Source |
|---|---|---|---|---|
| ZCode (CLI 0.17.1 inside the desktop app) | `~/.zcode/skills`, `~/.agents/skills` | Both | A, observed | `node zcode.cjs skills list` in `%LOCALAPPDATA%\Programs\ZCode\resources\glm` prints `- harness-dispatch (user/zcode)` and `- harness-dispatch (user/agents)`, each with the path of its `SKILL.md`. The desktop app has the same root functions in `app.asar` (level B for the desktop app). |
| Antigravity (`agy` 1.5.13) | `~/.gemini/config/skills` | `~/.gemini/config/skills/harness-dispatch` | B, expected | The string `~/.gemini/config/skills/<name>/` is in `agy.exe` three times. The program names `.agents/skills` only for a workspace. Only the interactive command `/skills` lists skills. |
| Cline (CLI 3.0.65) | `~/.cline/skills`, `~/.agents/skills` | `~/.agents/skills/harness-dispatch` | B, expected | `@cline/shared/dist/storage/index.js`: `function _E(C){return R([...CE(C),_(L(),g),_(A,z,g)])}` with `g="skills"` and `z=".agents"`. `cline config` needs a terminal, so no list was possible. |
| DeepSeek Harness (`dsh` 0.1.5-rc.1) | `~/.dsh/skills`, `~/.agents/skills` | `~/.agents/skills/harness-dispatch` | B, expected | Package `@deepseek-ai/dsh-skill-filesystem`: `README.md`, section "Roots and priority" (rank 500, `user-agents`), and `lib/index.js` (`join(homedir(), ".agents")`). The `web` profile has the plugin off. The desktop app mounts it for each agent preset. |
| OpenCode (desktop app) | `~/.config/opencode/skill` or `skills`, `~/.claude/skills`, `~/.agents/skills` | All three | B, expected | `app.asar`: `OPENCODE_SKILL_PATTERN = "{skill,skills}/**/SKILL.md"` and `EXTERNAL_SKILL_PATTERN = "skills/**/SKILL.md"`. The log `~/.local/share/opencode/log/opencode.log` shows that the app read `~/.config/opencode/skill` on 2026-10-30. The app did not run after the install, so the log does not name `harness-dispatch`. |

Defects and facts for the operator:

- ZCode and OpenCode find the skill two times, because they also read the shared agents folder. The copies are identical.
- Cline and DeepSeek Harness need no installer target. The installer reports `cline` as not supported, and that message is now wrong.
- No proof without a model call exists for Antigravity, Cline and DeepSeek Harness. For OpenCode, one start of the desktop app writes a log that can give the proof.
- `dsh --profile web --help` printed nothing in 60 seconds and was stopped. Do not use it as a help command. No `dsh` process was left.

Measured cost of the sub-agent: 61 calls, 1.18 USD (`session-cost.mjs`, table `2026-11-20`). The projection was 30 calls and 1.70 USD or less.

## Session dispatch decision

Run because the operator asked for it and the hub session was summarised once.

**Inputs.** W 1,000,000, K 970,000, C0 147,631 (usage tool, measured). Compacted: yes. ttl `1h` (desktop app default, measured in earlier stages). B 65,176 (usage total less "Messages", measured). T 30, range 20 to 35 (estimate: five harnesses, 4 to 7 calls each). F 3,000 and O 1,500 (defaults). R 8,000 and H 2,500 (estimates). M 0. L 0: the unrecorded facts are in this file. To 8 (the floor by count), coordinator: this session. Task type: scoped work with a stated oracle, class sonnet, effort medium. Design-heavy: no. Outward steps: a model call in each harness; the hub holds them for the operator's approval, and the brief forbids them.

**Calculator** (`dispatch.mjs`, formula 2026-11-11, table `2026-11-20`, Anthropic fetched 2026-11-10, 10 days of 14):

```
cost_continue on claude-fable-5-2 = 5.25 USD  (reads 1.291, writes 2.160, output 1.800)
cost_fresh on claude-sonnet-5-5   = 3.81 USD  (handoff 0.100, first read 0.293, reads 0.422,
                                               writes 0.540, output 0.450, cost_coord 2.007)
crosses = false (C_end 282,631, K 970,000)
Draft verdict: fresh, by cost, margin 1.44 USD (37.8 percent of the smaller; band 10).
```

**Plan.** One piece: a sub-agent of the hub on `claude-sonnet-5-5`, effort medium, serial, with the oracle above. The piece costs 1.70 USD as the calculator prices it (a session baseline and the 1-hour write price; a sub-agent has a smaller baseline and writes at the 5-minute price, not priced here). The coordinator is the hub on `claude-fable-5-2` at high. Model note `models/claude-fable-5-2.md` applied: the coordinator stays at high, xhigh not measured. A sub-agent and not a session, because a started session could not run a gated step in stage H2, and the hub needs the result in this turn.

**Guardrails.** 1: more than 10 turns. 2: not design-heavy. 3: no outward step goes to the sonnet piece; the approval step is the hub's question to the operator. 4 and 5: the model comes from the table, and the table is in date. 6: no acceptance stage; the hub checks each row with one command. 7: inside the caps. 8: no class change in a session.

**Adversarial pass.**

1. The case to continue: the stage is an investigation, and each finding leads to the next. A sub-agent's report loses detail, and a wrong "loads" claim would go into the documents. The hub has three calls of discovery already.
2. Inputs. C0: measured. T: if T is 15, continue costs about 2.6 USD and the plan about 3.0 USD. Task type: no design decision is hidden; a new skill folder for Cline or DeepSeek Harness would be an installer change, and the brief sends that back as a defect. Prices: in date. R: small, the brief stands alone. M: one pause for the operator's approval can exceed 1 hour; a miss then costs the hub about 2.4 USD on both plans. Loss list: empty.
3. Adverse value: T 15 and To 12. The plan then costs more than to continue.
4. T 15 is below the stated range. The verdict is kept and recorded as fragile: it flips at T of about 18 or less. The loss of detail is limited by the evidence levels: each row must name a source that the hub checks.

**Verdict:** fresh for the discovery, as a sonnet sub-agent at medium effort. The hub keeps the live checks and the record.

**Cost of deciding.**

| Row | Figure | Source |
|---|---|---|
| Context at start | 147,631 tokens | usage tool |
| Context at end | about 163,000 tokens | self-estimate |
| Input tokens read | about 11,000 (model note, help texts, folder lists, calculator output) | self-estimate |
| Output tokens | about 4,500, of which the record is about 1,100 | self-estimate |
| Wall clock | about 9 minutes | self-estimate |
| Priced | 11,000 at 16.00 and 4,500 at 40.00 USD per million: about 0.36 USD on `claude-fable-5-2`, table `2026-11-20` | computed |
