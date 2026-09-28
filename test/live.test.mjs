// Live verification. Opt-in, because it costs money and needs real credentials.
//
//   CODING_PLANS_LIVE=1 node --test test/live.test.mjs
//
// This is the layer that caught the original defect. The provider layer
// (@cline/llms) returned PONG while the compiled Cline host failed with
// `ENOENT: uv_spawn 'codex'`, because only the host reproduces the real spawn
// path. Both layers are therefore asserted.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { detectCli } from "../src/detect/cli.mjs";
import { detectCline } from "../src/detect/cline.mjs";
import { checkAuth } from "../src/check/auth.mjs";
import { verifyCliDirect, verifyViaClineHost } from "../src/check/verify.mjs";
import { getPlan, listPlans } from "../src/plans.mjs";

const live = process.env.CODING_PLANS_LIVE === "1";
const opts = { skip: live ? false : "set CODING_PLANS_LIVE=1 to run live checks" };

let clinePath;

before(async () => {
	if (!live) return;
	clinePath = (await detectCline())?.path;
});

for (const plan of listPlans()) {
	test(`${plan.id}: CLI is installed and spawnable`, opts, async () => {
		const detection = await detectCli(plan.cli);
		if (!detection.installed) {
			// Not a failure: the CLI may legitimately be absent in CI.
			return;
		}
		assert.ok(
			detection.spawnable,
			`${plan.cli} is installed at ${detection.executable} but is not spawnable by name. ` +
				`Cline's Bun host uses uv_spawn, which ignores Windows PATHEXT. Run: coding-plans fix --plan ${plan.id}`,
		);
	});

	test(`${plan.id}: is authenticated`, opts, async () => {
		const detection = await detectCli(plan.cli);
		if (!detection.installed) return;
		const auth = await checkAuth(plan, detection.executable);
		assert.ok(auth.authenticated, `${plan.cli} not authenticated. Run: ${plan.auth.login.join(" ")}`);
	});

	test(`${plan.id}: answers a trivial prompt`, opts, async () => {
		const detection = await detectCli(plan.cli);
		if (!detection.installed) return;
		const result = await verifyCliDirect(getPlan(plan.id), detection.executable);
		assert.ok(result.ok, `CLI layer failed: ${result.error ?? "unexpected response"}`);
	});

	test(`${plan.id}: works through the real Cline host`, opts, async () => {
		const detection = await detectCli(plan.cli);
		if (!detection.installed) return;
		if (!clinePath) return; // host absent; nothing to assert against
		const result = await verifyViaClineHost(plan, clinePath, { cwd: process.cwd() });
		if (result.skipped) return;
		assert.ok(result.ok, `host layer failed: ${result.error ?? "no run_result"}`);
		// Guard against a false pass: the host must have used OUR provider.
		assert.equal(result.provider, plan.id);
	});
}
