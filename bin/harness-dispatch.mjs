#!/usr/bin/env node
// harness-dispatch: send a task to a different coding agent CLI.
import { main } from "../src/dispatch/cli.mjs";
process.exitCode = await main(process.argv.slice(2));
