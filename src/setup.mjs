// Orchestration: the public API.
//
// Flow per plan, in order, with a hard gate at each step:
//
//   1. detect   — is the CLI installed AND spawnable?
//   2. gate     — if not installed, STOP. Do not "install" a plan whose
//                 prerequisite is missing; that produces a provider entry that
//                 fails at first use with an opaque spawn error.
//   3. fix      — make it spawnable (the PATHEXT trap).
//   4. peers    — ensure the optional peer package resolves for the host.
//   5. auth     — diagnose; never automate an interactive login.
//   6. verify   — CLI layer, then the real Cline host layer.

import { detectCli } from "./detect/cli.mjs";
import { checkStaleness, ensureSpawnable } from "./fix/executable.mjs";
import { globalRoots, installPeers, isPeerPresent } from "./fix/peers.mjs";
import { authInstruction, checkAuth } from "./check/auth.mjs";
import { verifyPlan } from "./check/verify.mjs";
import { getPlan, listPlans } from "./plans.mjs";
import { detectCline, findLlmsPackage, readOptionalPeers } from "./detect/cline.mjs";

/** Resolve the plan list from a possibly-empty user selection. */
export function resolvePlans(selection) {
	if (!selection || selection.length === 0) return listPlans();
	if (selection === "all") return listPlans();
	return selection.map((id) => getPlan(id));
}

async function hostContext(options = {}) {
	const detected = options.clinePath ? { path: options.clinePath } : await detectCline();
	const clinePath = detected?.path;
	const manifest = findLlmsPackage({ extraRoots: options.extraRoots ?? [] });
	return {
		clinePath,
		llmsManifest: manifest,
		llms: readOptionalPeers(manifest),
		roots: globalRoots(clinePath),
	};
}

/** Problem codes are stable identifiers for scripting; messages are for humans. */
function summarize(entries) {
	const errors = entries.flatMap((e) => e.problems.filter((p) => p.severity === "error"));
	const warnings = entries.flatMap((e) => e.problems.filter((p) => p.severity === "warn"));
	return { errors, warnings, ok: errors.length === 0 };
}

/** Inspect without changing anything. */
export async function doctor({ selection, options = {} } = {}) {
	const plans = resolvePlans(selection);
	const host = await hostContext(options);
	const results = [];

	for (const plan of plans) {
		const detection = await detectCli(plan.cli);
		const entry = {
			plan: plan.id,
			name: plan.name,
			cli: plan.cli,
			installed: detection.installed,
			spawnable: detection.spawnable,
			executable: detection.executable,
			version: detection.version,
			reason: detection.reason,
			problems: [],
		};

		// HARD GATE: a plan whose CLI is absent cannot be enabled.
		if (!detection.installed) {
			entry.problems.push({
				severity: "error",
				code: "cli-missing",
				message: `${plan.cli} CLI not found. Install it with: ${plan.installHint}`,
			});
			results.push(entry);
			continue;
		}

		// The exact failure this package exists to prevent.
		if (!detection.spawnable) {
			entry.problems.push({
				severity: "error",
				code: "cli-not-spawnable",
				message:
					`${plan.cli} is installed but not spawnable by name. Cline's Bun host uses uv_spawn, ` +
					`which ignores Windows PATHEXT, so an npm shim fails with ENOENT. ` +
					`A real executable exists at: ${detection.userDir ?? detection.vendorBinary ?? "unknown"}`,
			});
		}

		const peerPresent = isPeerPresent(plan.peerPackage, host.roots);
		entry.peerPackage = plan.peerPackage;
		entry.peerPresent = peerPresent;
		if (!peerPresent) {
			entry.problems.push({
				severity: "error",
				code: "peer-missing",
				message: `Optional peer '${plan.peerPackage}' is not resolvable by the Cline host; Cline will throw "requires the optional ... package" on first use.`,
			});
		}

		entry.auth = await checkAuth(plan, detection.executable);
		if (entry.auth.authenticated) {
			entry.authenticated = true;
		} else {
			entry.problems.push({
				severity: "error",
				code: "not-authenticated",
				message: `${plan.cli} is not authenticated. Run this yourself in a terminal: ${authInstruction(plan)}`,
			});
		}

		results.push(entry);
	}

	return { host, results, summary: summarize(results) };
}

/**
 * Repair whatever can be repaired without user interaction: executable wiring
 * and optional peer installation. Authentication is reported, never performed.
 */
export async function fix({ selection, options = {} } = {}) {
	const { dryRun = false, cwd } = options;
	const plans = resolvePlans(selection);
	const host = await hostContext(options);
	const results = [];

	for (const plan of plans) {
		const detection = await detectCli(plan.cli);
		const entry = { plan: plan.id, actions: [], problems: [], dryRun };

		// HARD GATE: refuse to configure a plan whose CLI is missing, so we
		// never leave behind a half-working provider entry.
		if (!detection.installed) {
			entry.problems.push({
				severity: "error",
				code: "cli-missing",
				message: `Cannot enable '${plan.id}': the ${plan.cli} CLI is not installed. Install it first: ${plan.installHint}`,
			});
			results.push(entry);
			continue;
		}

		// 1. Make the CLI spawnable by bare name.
		if (detection.spawnable) {
			entry.actions.push({ action: "link-executable", changed: false, method: "already-spawnable", target: detection.executable });
		} else {
			const source = detection.userDir ?? detection.vendorBinary;
			const linked = await ensureSpawnable(plan.cli, { source, dryRun });
			entry.actions.push({ action: "link-executable", ...linked });
			if (!linked.changed && linked.method === "unavailable") {
				entry.problems.push({ severity: "error", code: "link-failed", message: linked.note });
			}
		}

		// 2. Ensure the optional peer resolves for the host.
		const spec = `${plan.peerPackage}@${plan.peerRange}`;
		if (isPeerPresent(plan.peerPackage, host.roots)) {
			entry.actions.push({ action: "install-peer", changed: false, alreadyPresent: true, spec: plan.peerPackage });
		} else {
			const result = await installPeers([spec], { dryRun, cwd });
			entry.actions.push({ action: "install-peer", spec, ...result });
			if (result.error) {
				entry.problems.push({ severity: "error", code: "peer-install-failed", message: result.error });
			}
		}

		// 3. Report auth state; never automate an interactive login.
		entry.auth = await checkAuth(plan, detection.executable);
		if (!entry.auth.authenticated) {
			entry.problems.push({
				severity: "warn",
				code: "manual-auth-required",
				message: `Run in your own terminal (it opens a browser and waits for a code): ${authInstruction(plan)}`,
			});
		}

		results.push(entry);
	}

	return { host, results, summary: summarize(results) };
}

/** Run the layered verification. Read-only. */
export async function verify({ selection, options = {} } = {}) {
	const plans = resolvePlans(selection);
	const host = await hostContext(options);
	const results = [];

	for (const plan of plans) {
		results.push(
			await verifyPlan(plan, {
				host: options.host ?? "auto",
				clinePath: host.clinePath,
				modelId: options.modelId,
				cwd: options.cwd,
				timeoutMs: options.timeoutMs,
			}),
		);
	}

	return {
		host,
		results,
		// `cli-only` (from --no-host) is a deliberate, caller-requested
		// reduction, so it is not an error. Every other non-verified state is.
		summary: summarize(
			results
				.filter((r) => r.status !== "verified" && r.status !== "cli-only")
				.map((r) => ({ problems: [{ severity: "error", code: `verify-${r.status ?? "failed"}`, message: planErrorText(r) }] })),
		),
	};
}

function planErrorText(r) {
	const parts = [];
	if (r.status === "missing-cli") parts.push(`${r.plan}: CLI not installed`);
	if (r.cli && !r.cli.ok) parts.push(`${r.plan}: CLI layer failed (${r.cli.error ?? "unexpected response"})`);
	if (r.host && !r.host.ok && !r.host.skipped) parts.push(`${r.plan}: Cline host layer failed (${r.host.error ?? "no run_result"})`);
	if (r.status === "unverified") parts.push(`${r.plan}: UNVERIFIED - Cline host not found`);
	return parts.join("; ");
}

/** One-shot: fix then verify. */
export async function setup({ selection, options = {} } = {}) {
	const fixResult = await fix({ selection, options });
	const verifyResult = await verify({ selection, options });
	return { fix: fixResult, verify: verifyResult };
}

export { detectCli, ensureSpawnable, checkAuth, verifyPlan, listPlans, getPlan };

