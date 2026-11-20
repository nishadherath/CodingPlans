# Development

This document is for a person who changes the code: the layout, the tests, the bundles, and how to add a target.
Back to the [README](../README.md). The specification is [the contract](design/harness-dispatch-contract.md). The records of the project are in [docs/README.md](README.md).

Rules: Node 22 or later, ESM, no runtime dependency. Do not add one without a decision from the operator.

## Layout

```
skill/harness-dispatch/SKILL.md          instructions for the calling agent (hand-written)
skill/harness-dispatch/scripts/hd.mjs    generated bundle. Do not edit.
src/dispatch/cli.mjs                     argument parser, main(argv, io)
src/dispatch/index.mjs                   dispatch, listTargets, doctor, listModels
src/dispatch/request.mjs                 validation and defaults
src/dispatch/envelope.mjs                the result envelope, VERSION, exit codes
src/dispatch/guard.mjs                   the depth guard
src/dispatch/resolve.mjs                 find the program of a target, choose by version
src/dispatch/parse.mjs                   shared output helpers (denied actions, usage limit, redaction)
src/dispatch/harnesses/                  one adapter for each target, and the registry (index.mjs)
src/util/exec.mjs                        start a process, time limit, stop the process tree
bin/harness-dispatch.mjs                 entry point of `hd` in this repository
scripts/install-skill.mjs                the installer
scripts/build-dist.mjs                   the bundler
dist/                                    generated bundles of the legacy tool. Do not edit.
src/check, src/detect, src/fix, src/plans.mjs, src/setup.mjs, bin/coding-plans.mjs
                                         the legacy Cline provider tool
test/                                    tests and fixtures
docs/                                    documents and project records
```

## Commands

```powershell
npm test                # unit tests. Free. No model call.
npm run check:bundles   # fails when a committed bundle differs from its source
npm run build:dist      # rebuild dist/ and the skill bundle
npm run hd -- list      # run hd from this repository
```

Change `src/` or `bin/`, then run `npm run build:dist`, then run the tests. The bundle `hd.mjs` is committed. The skill ships it, so a stale bundle ships old code.
The files use LF line endings (`.gitattributes`). The bundles must be byte-reproducible.

## Tests

- `test/dispatch/*.test.mjs` test the skill. `test/detect.test.mjs` and `test/legacy.test.mjs` test the legacy tool.
- **No test calls a model.** No test writes to the real home folder or to a real `PATH` folder. The installer tests use `--home` with a temporary folder.
- `npm run test:live` runs the opt-in live tests of the legacy Cline tool. They need `CODING_PLANS_LIVE=1` and cost money. There is no live test for the dispatch skill. Run live dispatches by hand, with the approval of the operator.
- `test/docs.test.mjs` checks that each relative link in the user documents points to an existing file, and that `README.md` reaches each document.

### Fixtures

The fixtures are in `test/fixtures/<harness>/`. They are the output of a target.

- `real-*`: captured from a real run on 2026-11-20. A tool call line with private desktop state was removed from `codex/real-schema-trimmed.stdout.jsonl`.
- `synthetic-*`: written by hand. Use them for a shape that no real capture has, or when a test asserts exact values. Keep the `synthetic-` prefix, so that a reader knows.

Prefer a real fixture. A parser written from memory of the output format was wrong more than once.

## Add a target

A target is one adapter file and one line in the registry.

1. Read the `--help` of the target CLI. Do not write flags from memory.
2. Add `src/dispatch/harnesses/<id>.mjs`. It exports one object:

   ```js
   export default {
     id, name, cli,
     capabilities: { resume, schema, models, efforts },
     resolve(env),                 // { command, prefixArgs } with an absolute path, or undefined
     candidates(env),              // optional: all copies. The highest version wins.
     prepare(request, { command, prefixArgs, exec }),  // optional, async: a call that uses no model
     buildInvocation(request, ctx),  // { args, stdin, tempFiles }. Pure.
     parseOutput(result, ctx),       // { ok, text, session_id, usage, structured, cost_usd, model, denied_actions, error }. Pure.
     authCheck: { args, parse },   // optional
     listModels: { args, parse },  // optional
   };
   ```

3. Add the adapter to `HARNESSES` in `src/dispatch/harnesses/index.mjs`.
4. Map `read` and `write` access. Prove read access by a live run with a forced prompt before you claim it. See [safety](safety.md) for how earlier mappings failed.
5. Add tests: a table of requests with the exact argument arrays, `parseOutput` with fixtures, and a `dispatch` test with an injected `exec`.
6. Add the id to `TARGETS` in `scripts/install-skill.mjs` only if the harness can hold a skill.
7. Update `skill/harness-dispatch/SKILL.md`, the documents here, and the contract. Run `npm run build:dist` and `npm test`.

`buildInvocation` and `parseOutput` stay pure so that tests can call them with tables and fixtures. The safety rules (no shell, no bypass flag, depth guard, tree kill) are in section 8 of the contract.

## The legacy tool

The Cline provider tool keeps its code and its tests. Its documentation is [legacy-cline-providers.md](legacy-cline-providers.md). Do not remove its modules.
