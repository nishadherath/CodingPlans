// Layered verification.
//
// The lesson from the original debugging session: the provider layer passing
// is NOT sufficient evidence. On this machine the Codex provider returned PONG
// through @cline/llms while the compiled Cline binary failed with
//   ENOENT: uv_spawn 'codex'
// because the two hosts resolve modules differently. Only a test that actually
// drives the real host binary catches that class of defect.
//
// Each layer is therefore reported independently, and `doctor` requires the
// host layer to pass before declaring a plan healthy.

import { run, stream } from "../util/exec.mjs";
import { detectCli } from "../detect/cli.mjs";

const PONG = "pong";

function looksLikePong(text) {
	return new RegExp(`\\b${PONG}\\b`, "i").test(String(text ?? ""));
}

/**
 * Layer 1 — the CLI answers a trivial prompt on its own.
 *
 * Claude: `claude -p --output-format json ...` prints one JSON object whose
 *   `result` carries the text and whose `is_error` marks failure.
 * Codex:  `codex exec --experimental-json ...` prints JSONL; the assistant text
 *   arrives in an `item.completed` event of type `agent_message`.
 */
export async function verifyCliDirect(plan, executable, { timeoutMs = plan.verify.timeoutMs } = {}) {
	const started = Date.now();
	try {
		const result = await run(executable, plan.verify.args, {
			timeoutMs,
			rejectOnNonZero: false,
		});
		const combined = `${result.stdout}\n${result.stderr}`;

		if (plan.verify.expectJsonLines) {
			const agent = combined
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean)
				.map((l) => {
					try {
						return JSON.parse(l);
					} catch {
						return undefined;
					}
				})
				.find((e) => e?.item?.type === "agent_message");

			if (agent) {
				return { ok: looksLikePong(agent.item.text), layer: "cli", ms: Date.now() - started, text: agent.item.text };
			}
			// Surface the model's own refusal (e.g. an unsupported model id).
			const failure = combined
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean)
				.map((l) => {
					try {
						return JSON.parse(l);
					} catch {
						return undefined;
					}
				})
				.find((e) => e?.type === "error" || e?.type === "turn.failed");
			return {
				ok: false,
				layer: "cli",
				ms: Date.now() - started,
				error: failure?.message ?? combined.trim().slice(0, 500) ?? "no response",
			};
		}

		if (plan.verify.expectJsonEnvelope) {
			const start = combined.indexOf("{");
			const end = combined.lastIndexOf("}");
			let json;
			try {
				json = JSON.parse(combined.slice(start, end + 1));
			} catch {
				json = undefined;
			}
			if (json?.is_error) {
				return { ok: false, layer: "cli", ms: Date.now() - started, error: json.result ?? "provider error" };
			}
			if (json?.result !== undefined) {
				return { ok: looksLikePong(json.result), layer: "cli", ms: Date.now() - started, text: json.result };
			}
		}

		return {
			ok: looksLikePong(combined),
			layer: "cli",
			ms: Date.now() - started,
			text: combined.trim().slice(0, 300),
		};
	} catch (error) {
		return { ok: false, layer: "cli", ms: Date.now() - started, error: error.message };
	}
}

/**
 * Layer 2 — drive the real compiled Cline host.
 *
 * This is the only layer that reproduces the production spawn path. It writes
 * NDJSON to stdout; success is a `run_result` event carrying our sentinel and
 * the provider id we asked for.
 */
export async function verifyViaClineHost(plan, clinePath, { modelId = plan.defaultModelId, timeoutMs = 240_000, cwd, autoApprove = false } = {}) {
	if (!clinePath) {
		return { ok: false, layer: "host", skipped: true, error: "Cline host not found" };
	}

	const args = [
		"-P", plan.id,
		"-m", modelId,
		"--auto-approve", String(autoApprove),
		"-t", String(Math.ceil(timeoutMs / 1000)),
		"--json",
		'"Reply with exactly PONG"',
	];
	if (cwd) args.unshift("-c", cwd);

	const started = Date.now();
	let runResult;
	let failure;
	const lines = [];

	const outcome = await stream(clinePath, args, {
		timeoutMs,
		cwd,
		onLine: (line) => {
			lines.push(line);
			try {
				const event = JSON.parse(line);
				if (event.type === "run_result") runResult = event;
				if (event.type === "error" || event.type === "error_event") failure ??= event.message ?? event.error;
			} catch {
				// non-JSON chatter (e.g. coloured --json preamble)
			}
		},
	});

	if (runResult) {
		const providerOk = runResult.model?.provider === plan.id;
		return {
			ok: providerOk && looksLikePong(runResult.text),
			layer: "host",
			ms: runResult.durationMs ?? Date.now() - started,
			text: runResult.text,
			provider: runResult.model?.provider,
			usage: runResult.aggregateUsage,
		};
	}

	// No run_result: report the most specific signal we have.
	const tail = lines.slice(-6).join("\n").slice(0, 800);
	return {
		ok: false,
		layer: "host",
		ms: Date.now() - started,
		exitCode: outcome.code,
		timedOut: outcome.timedOut,
		error: failure ?? (tail || outcome.stderr || `host exited ${outcome.code}`),
	};
}

/**
 * Full stack for one plan.
 *
 * `host: "skip"` (from `--no-host`) and a missing Cline host both leave the
 * host layer unverified. That is reported as its own state rather than as a
 * pass, so a green CLI layer can never be mistaken for end-to-end proof —
 * which is precisely the confusion that hid the original ENOENT bug.
 */
export async function verifyPlan(plan, { host = "auto", clinePath, modelId, cwd, timeoutMs } = {}) {
	const detection = await detectCli(plan.cli);
	if (!detection.installed) {
		return { plan: plan.id, ok: false, status: "missing-cli", reason: `${plan.cli} CLI is not installed`, detection };
	}

	const cli = await verifyCliDirect(plan, detection.executable, { timeoutMs });
	const result = { plan: plan.id, detection, cli, host: undefined };

	if (!cli.ok) {
		result.host = { ok: false, skipped: true, reason: "cli-layer-failed", error: "skipped: CLI layer failed" };
		result.status = "cli-failed";
		result.ok = false;
		return result;
	}

	if (host === "skip") {
		result.host = { ok: false, skipped: true, reason: "disabled", error: "host layer disabled (--no-host)" };
		result.status = "cli-only";
		result.ok = true; // the caller explicitly asked for the cheaper guarantee
		return result;
	}

	if (!clinePath) {
		result.host = { ok: false, skipped: true, reason: "cline-host-not-found", error: "Cline host not found" };
		result.status = "unverified";
		result.ok = false;
		return result;
	}

	result.host = await verifyViaClineHost(plan, clinePath, { modelId, cwd, timeoutMs });
	result.status = result.host.ok ? "verified" : "host-failed";
	result.ok = result.host.ok === true;
	return result;
}
