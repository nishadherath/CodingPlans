# Changelog

Back to the [README](README.md).

## Documentation update (2026-11-21, tag `v0.2.3-docs.3`)

- The public repository was replaced by a new one with the same name. It holds only the clean history. The first repository is private. The new repository does not serve the old commit ids.
- The record of stage H7 and the status file state this. The skill and its version are unchanged from 0.2.3.

## Documentation update (2026-11-21, tag `v0.2.3-docs.2`)

- The repository is public. A scan of all files and of the full history found no credential and no e-mail address.
- The history was written again to remove three private items: a stray capture file, a Windows account name in an old version of a handoff file, and details of a different project in an incident record. 65 commits became 63. All commit ids after the second commit are new, and all release tags were created again. A clone from before this date cannot merge with the new history: make a new clone.
- `LICENSE`: the copyright line names the owner of this repository.
- The record is `docs/handoffs/2026-11-21-h7-public-repository-check.md`. The skill and its version are unchanged from 0.2.3.

## Documentation update (2026-11-21, tag `v0.2.3-docs.1`)

- The operator approved the install of version 0.2.3. The four skill folders now hold version 0.2.3, identical to the repository.
- `docs/STATUS.md` records the install. The skill and its version are unchanged from 0.2.3.

## 0.2.3 (2026-11-21)

- Installer: four skill folders for seven harnesses. The folders are `.claude/skills`, `.codex/skills`, `.gemini/config/skills` and the shared folder `.agents/skills`. ZCode, OpenCode, Cline and DeepSeek Harness read the shared folder. The ids `zcode`, `opencode`, `cline` and the new id `deepseek` select it. A run with more than one of these ids gives one step. The plan names the harnesses that read each folder.
- Installer: the own folders of ZCode (`.zcode/skills`) and OpenCode (`.config/opencode/skill`) are removed from the target list, because a second copy only made these harnesses find the skill two times. The target `cline` is no longer "not supported".
- Result of stage H5 (2026-11-21): all five harnesses that were not checked before load the skill. They are ZCode, Antigravity, Cline, OpenCode and DeepSeek Harness. Each proof is output of the harness itself. Antigravity does not read the shared folder. The record is in `docs/STATUS.md`.
- On the operator's machine, the two old copies in `~/.zcode/skills` and `~/.config/opencode/skill` were removed on 2026-11-21 with the old installer.
- `SKILL.md`: the list of skill folders has four entries and names the harnesses of the shared folder. The rule for Codex is unchanged.
- Note for a machine with the old copies: remove the folders `~/.zcode/skills/harness-dispatch` and `~/.config/opencode/skill/harness-dispatch` by hand. The new installer does not touch them.
- Documents: the folder list, the proof state and the version number agree with these facts.

## Documentation update (2026-11-20, tag `v0.2.2-docs.1`)

- `docs/STATUS.md` is written again from the present state: release, install record, proof state, known limits, open work, history and measured cost. The old stage lists are removed.
- New result: each of the three targets answered a test dispatch through an installed copy of the skill.
- `README.md` links to the status file. `AGENTS.md` states that the skill is installed.
- The skill and its version are unchanged from 0.2.2. The installed copies need no update.

## 0.2.2 (2026-11-20)

- `SKILL.md`: a rule for Codex Desktop and CLI on Windows, written by the operator. Codex uses the absolute path of the launcher and asks for approval of the exact `node .../scripts/hd.mjs` command when its sandbox blocks the launch or the writes of the target.
- The skill works from inside OpenAI Codex. The operator tested this by hand. The documents no longer say that Codex as the caller fails.
- Headless test by the hub: `codex exec` loaded the skill and ran `hd doctor`. Its automatic review refused `hd run`, because nobody could approve it, and Codex reported the restriction as the new rule instructs.
- No change in the script. The skill is installed again in the six harness folders, so each copy holds the new rule.

## Documentation update (2026-11-20, tag `v0.2.1-docs.1`)

- `README.md` now has the usage instructions: the two methods, the result fields, the common flags and the rules for good results.
- `docs/usage.md` has a short section on the two methods.
- The skill and its version are unchanged from 0.2.1. The installed copies need no update.

## 0.2.1 (2026-11-20)

- No change in behaviour. The version number changes so that the installed copies and the tag agree.
- The skill was installed for the first time on the operator's machine, in six harness folders. `docs/STATUS.md` records the install.

## 0.2.0 (2026-11-20)

The repository is now the skill `harness-dispatch`.

- Added the skill `harness-dispatch`: one script, `hd.mjs`, with no dependencies. An agent in one harness sends a task to another and gets one JSON result.
- Added three targets: Claude Code, OpenAI Codex and Google Antigravity. Dispatch, `--resume`, `--schema`, `--access write` and enforced read access were proved by live runs on Windows 11.
- Added the commands `run`, `list`, `doctor` and `models`, the depth guard, and the path override `HARNESS_DISPATCH_<ID>_PATH`.
- Added the installer `scripts/install-skill.mjs`. It makes a dry run by default and writes a marker file in each folder that it makes.
- Repaired the legacy `coding-plans` command so that it starts (defects D1 and D2 of the assessment).
- Added the user documents in `docs/`.
- Renamed the package to `harness-dispatch` and marked it `private`.
- Known limits: Codex read runs keep the built-in web tool. Antigravity read runs did not test MCP and browser tools. Codex as the caller failed in its Windows sandbox. POSIX is not tested, and two POSIX defects are open (D6, D7).

## 0.1.0

The first Cline provider tool, `coding-plans`: it checks and repairs the Cline providers `claude-code` and `openai-codex-cli`. See [docs/legacy-cline-providers.md](docs/legacy-cline-providers.md).
