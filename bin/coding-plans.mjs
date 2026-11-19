#!/usr/bin/env node
// coding-plans - CLI front end.
//
// Commands are intentionally small and composable so a human can run one step
// at a time, which is how the original problem was actually diagnosed:
//   doctor  -> what is wrong
//   fix     -> repair what can be repaired non-interactively
//   verify  -> prove it works, through the real Cline host

import process from "node:process";
import { doctor, fix, setup, verify } from "../src/setup.mjs";
import { listPlans, PLAN_IDS } from "../src/plans.mjs";
import {
	configureLogger as configure,
	logDetail as detail,
	logError as error,
	logHeading as heading,
	logInfo as info,
	logSuccess as success,
	logWarn as warn,
} from "../src/index.mjs";

const USAGE = `
coding-plans - enable CLI-backed coding plans in Cline (Claude Code, OpenAI Codex)

Usage:
  coding-plans <command> [options]

Commands:
  doctor              Inspect configuration. Read-only. Exit 1 if unhealthy.
  fix                 Link CLIs onto PATH and install optional peer packages.
  verify              Run layered verification (CLI layer + real Cline host).
  setup               fix, then verify. The usual entry point.
  plans               List the supported plans.
  help                Show this help.

Options:
  --plan <id>         Plan to act on. Repeatable. Default: all.
                       One of: ${PLAN_IDS.join(", ")}
  --json              Emit machine-readable JSON.
  --quiet             Suppress progress output (errors still print).
  --dry-run           Show what would change without changing it.
  --cwd <path>        Workspace to run the verification in.
  --model <id>        Override the model used for verification.
  --no-host           Verify the CLI layer only; skip the Cline host run.
  --timeout <ms>      Per-verification timeout. Default 240000.
  --no-color          Disable ANSI colour.

Exit codes:
  0  everything requested succeeded
  1  one or more plans are unhealthy (see output)
  2  bad usage
`;

function parseArgs(argv) {
	const args = { plans: [], flags: {} };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		switch (a) {
			case "--plan":
				args.plans.push(argv[++i]);
				break;
			case "--json":
				args.flags.json = true;
				break;
			case "--quiet":
				args.flags.quiet = true;
				break;
			case "--dry-run":
				args.flags.dryRun = true;
				break;
			case "--no-host":
				args.flags.host = "skip";
				break;
			case "--no-color":
				process.env.NO_COLOR = "1";
				break;
			case "--cwd":
				args.flags.cwd = argv[++i];
				break;
			case "--model":
				args.flags.modelId = argv[++i];
				break;
			case "--timeout":
				args.flags.timeoutMs = Number(argv[++i]);
				break;
			default:
				if (a.startsWith("-")) args.unknown = a;
				else args.command = a;
		}
	}
	return args;
}

function printDoctor(report) {
	for (const r of report.results) {
		heading(`${r.name}  (${r.plan})`);
		detail(`cli:            ${r.cli} ${r.version ?? ""}`.trimEnd());
		detail(`installed:      ${r.installed}`);
		detail(`spawnable:      ${r.spawnable}   (${r.reason})`);
		if (r.executable) detail(`executable:     ${r.executable}`);
		detail(`peer package:   ${r.peerPackage} ${r.peerPresent ? "present" : "MISSING"}`);
		detail(`authenticated:  ${r.auth?.authenticated ? "yes" : "no"}${r.auth?.subscription ? ` (${r.auth.subscription})` : ""}`);
		for (const p of r.problems) {
			const line = `[${p.code}] ${p.message}`;
			if (p.severity === "error") error(line);
			else warn(line);
		}
	}
	if (report.host.clinePath) detail(`cline host: ${report.host.clinePath}`);
}

function printFix(report) {
	for (const r of report.results) {
		heading(`${r.plan}${r.dryRun ? "  (dry run)" : ""}`);
		for (const a of r.actions) {
			if (a.action === "link-executable") {
				if (a.method === "already-spawnable") info(`executable ok: ${a.target}`);
				else if (a.method === "unavailable") error(`executable: ${a.note}`);
				else success(`executable ${a.method}: ${a.source} -> ${a.target}`);
			} else if (a.action === "install-peer") {
				if (a.alreadyPresent) info(`peer present: ${a.spec}`);
				else if (a.dryRun) info(`would run: ${a.command}`);
				else if (a.error) error(`peer install failed: ${a.error}`);
				else success(`peer installed: ${a.spec}`);
			}
		}
		for (const p of r.problems) {
			if (p.severity === "error") error(`[${p.code}] ${p.message}`);
			else warn(`[${p.code}] ${p.message}`);
		}
	}
	if (report.host.clinePath) detail(`cline host: ${report.host.clinePath}`);
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	configure({ json: args.flags.json, quiet: args.flags.quiet });

	if (args.flags.timeoutMs !== undefined && !Number.isFinite(args.flags.timeoutMs)) {
		error("--timeout must be a number");
		return 2;
	}

	switch (args.command) {
		case undefined:
		case "help":
		case "--help":
		case "-h":
			console.log(USAGE);
			return 0;

		case "plans":
			for (const p of listPlans()) {
				console.log(`${p.id.padEnd(18)} ${p.name}`);
				console.log(`${" ".repeat(18)} cli=${p.cli}  peer=${p.peerPackage}  model=${p.defaultModelId}`);
			}
			return 0;

		case "doctor": {
			const report = await doctor({ selection: args.plans, options: args.flags });
			if (args.flags.json) console.log(JSON.stringify(report, null, 2));
			else printDoctor(report);
			return report.summary.ok ? 0 : 1;
		}

		case "fix": {
			const report = await fix({ selection: args.plans, options: args.flags });
			if (args.flags.json) console.log(JSON.stringify(report, null, 2));
			else printFix(report);
			return report.summary.ok ? 0 : 1;
		}

		case "verify": {
			const report = await verify({ selection: args.plans, options: args.flags });
			if (args.flags.json) console.log(JSON.stringify(report, null, 2));
			else printVerify(report);
			return report.summary.ok ? 0 : 1;
		}

		case "setup": {
			const report = await setup({ selection: args.plans, options: args.flags });
			if (args.flags.json) console.log(JSON.stringify(report, null, 2));
			else {
				printFix(report.fix);
				printVerify(report.verify);
			}
			const ok = report.fix.summary.ok && report.verify.summary.ok;
			heading(ok ? "All requested plans are ready." : "Some plans need attention (see above).");
			return ok ? 0 : 1;
		}

		default:
			error(`Unknown command: ${args.command}`);
			console.log(USAGE);
			return 2;
	}
}

main().then(
	(code) => process.exit(code),
	// The parameter must not be named `error`: that would hide the logger.
	(err) => {
		error(err?.stack ?? String(err));
		process.exit(1);
	},
);

const STATUS_LABEL = {
	verified: "verified end-to-end",
	"cli-only": "CLI layer only (host check disabled)",
	unverified: "UNVERIFIED - Cline host not found",
	"host-failed": "FAILED at the Cline host layer",
	"cli-failed": "FAILED at the CLI layer",
	"missing-cli": "FAILED - CLI not installed",
};

function printVerify(report) {
	for (const r of report.results) {
		heading(`${r.plan}`);
		if (r.cli) detail(`cli layer:  ${r.cli.ok ? "PASS" : "FAIL"}  (${r.cli.ms}ms)${r.cli.error ? ` - ${r.cli.error}` : ""}`);
		if (r.host) {
			if (r.host.skipped) detail(`host layer: SKIP - ${r.host.error ?? ""}`);
			else detail(`host layer: ${r.host.ok ? "PASS" : "FAIL"}  (${r.host.ms}ms)${r.host.provider ? ` provider=${r.host.provider}` : ""}${r.host.error ? ` - ${r.host.error}` : ""}`);
		}
		if (r.status === "verified") success(`${r.plan}: ${STATUS_LABEL[r.status]}`);
		else if (r.status === "cli-only") info(`${r.plan}: ${STATUS_LABEL[r.status]}`);
		else error(`${r.plan}: ${STATUS_LABEL[r.status] ?? "not healthy"}`);
	}
}

