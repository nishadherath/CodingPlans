# Changelog

Back to the [README](README.md).

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
