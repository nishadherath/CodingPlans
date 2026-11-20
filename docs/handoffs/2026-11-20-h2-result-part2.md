---
stage: "H2 part 2: acceptance of the H3 corrections"
model: claude-opus-5-5
effort: high
created: 2026-11-20
reviewed: "git diff 3c283b6..HEAD (code 00f301e, 755c6a4, 8a7a60d; docs 51a2bfc, 26a536d)"
---

# H2 part 2: acceptance of the H3 corrections

## Verdict

**Accept with listed defects.** The argument arrays of the three adapters agree with the `--help` texts of the installed CLIs (Claude Code 2.1.316, Codex 0.167.0-alpha.4.1, `agy` 1.5.13). Version selection and the path override are correct. One defect is corrected (D10). Two documentation defects and one small usability defect stay open. No defect blocks install. D1 to D5 and D8 show no regression. D9 is corrected by `8a7a60d`.

## Oracle

- `npm test`: `ℹ tests 178 / pass 170 / fail 0 / skipped 8` after D10. `npm run check:bundles`: "bundles are current".
- No live dispatch, no install, no push.

## Defects

| Id | Severity | File and line | Proof | State |
|---|---|---|---|---|
| D10 | correct soon | `src/dispatch/parse.mjs:119` (`USAGE_LIMIT`) | `failureCode("Context limit reached")`, `"time limit reached"`, `"output token limit reached"` and `"Error: ENOENT at line 429"` gave `usage-limit`. `SKILL.md` then tells the caller to stop dispatching to a working target and to report a reset time that does not exist. | corrected in `3496597`. `limit reached` needs a plan period (`hour`, `weekly` ...). `429` needs `error`, `status`, `code` or `http` before it. `hit your 5-hour limit` now matches. The test failed before the change. |
| D11 | correct soon | `src/dispatch/harnesses/codex.mjs:57-70`; `SKILL.md:61`; contract 7.2 | A read run passes nothing that removes the MCP servers or hooks of `~/.codex/config.toml`. On this machine that file has 3 `[mcp_servers.*]` and 8 `[hooks.*]` sections (section names counted, no values read). The Codex warning names only computer-use and connected apps. Low confidence: I think that MCP servers and hooks run outside the shell sandbox. A live check by the hub is needed. | open |
| D12 | minor | `SKILL.md:60,62`; contract 7.1, 7.3 | `claude --help`: `--restricted` ignores the user, project and local settings, but "managed settings and --settings still apply". So "no hooks" is false for managed hooks. Antigravity: the deny rule covers only `command(*)`. `~/.gemini/config/mcp_config.json` lists 5 MCP servers. No live run tested an MCP or browser tool in read mode, so "file read and search tools only" is not proved for either target. | open |
| D13 | minor | `src/dispatch/resolve.mjs:220` | `HARNESS_DISPATCH_CLAUDE_PATH='"C:\...\node.exe"'` (quotes included, a common PowerShell mistake) gives "must be an absolute path. Got a relative path." The message does not name the quotes. | open |

## Checks that passed (with proof)

1. **Argument arrays.**
   - Claude read: `-p --output-format json --permission-prompts none --permission-mode manual --restricted --strict-mcp-config [--model] [--effort] [--resume id] [--json-schema text] --disallowedTools Edit Write NotebookEdit`. `--disallowedTools <tools...>` is variadic and comes last. The prompt is on stdin, so nothing follows it. Write and resume keep the same order.
   - Codex: `exec resume --help` lists `-c`, `-m`, `--json`, `-o`, `--output-schema` and `--skip-git-repo-check`, and `[SESSION_ID] [PROMPT]`. It has no `-C` and no `-s`. The adapter matches this, and `approval_policy="never"` goes on both paths.
   - Antigravity: `--mode plan --settings <one JSON argument>`, then `--conversation` and `--json-schema`. The help lists each of these flags.
2. **Version selection.** Results of `compareVersions`: `alpha.4.1 < release`; `alpha.10 > alpha.9`; `beta > alpha.9`; `0.10.0 > 0.9.9`; `null` is lower than any version. Each probe has a 20 s limit and a tree kill, and the probes run in parallel. A candidate that cannot start is skipped. If no candidate answers, the first one is used, and the run then reports `not-startable`. Measured cost: Codex has 4 candidates here (path, 2 npm shims, Desktop), and `diagnose` takes 2.2 s for each `hd run --to codex`. This is acceptable against a run of 30 s or more. `hd list` takes 2.0 s.
3. **Path override.** An absolute file gives `ok`. A relative path gives `usage`. A folder or a missing file gives `not-installed`. On Windows, a `.cmd` file gives `not-startable`. A root-relative `\Windows\...` path resolves on the current drive, which is correct.
4. **`permission-denied`** is not decided from text. It needs `denied_actions` that is not empty and an empty answer. No false positive is possible from the answer text. `usage-limit` and `not-authenticated` are read only from failed runs.
5. **Regression of D1 to D9.** D1 `index.mjs:136`, D2 `codex.mjs:114`, D3 `exec.mjs:63`, D4 `SKILL.md:16-20`, D5 `index.mjs:62` and D8 `detect/cli.mjs:38` are all present. D6 and D7 (POSIX) stay open. All four callers of `diagnose`, which is now async, use `await`.

## Author deviations 14 to 24

All 11 are accepted.
- 14: one commit for items 1 to 7. Accepted, because the items share files. The commit between the two has one failing test, so the history does not bisect cleanly at `00f301e`.
- 24: a Claude run with denials and no answer gives `bad-output`, not `permission-denied`, and `denied_actions` is filled. Accepted until a real capture exists. It differs from the rule for Antigravity.

## Not checked

- Any live run. These are not proved: Claude `--resume` with `--restricted`; Codex `sandbox_mode` enforced on `exec resume`; the Codex MCP servers and hooks in read mode (D11); the `agy` MCP and browser tools in read mode (D12).
- The Claude tools that `--restricted` keeps and that can have a side effect outside the files (for example scheduling or remote-trigger tools). They were not listed.
- A real spawn of an override path with spaces. The code uses no shell, so Node quotes the path. This was not executed.
- POSIX behaviour. The Codex Desktop candidates exist only on Windows.
- Cost: not measured for this stage.
