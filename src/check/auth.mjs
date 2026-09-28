// Authentication checks.
//
// Both plans authenticate through the CLI's own credential store
// (capability "local-auth"), not an API key typed into Cline. That means:
//
//   * There is nothing for us to write. Cline's provider settings for these
//     ids have `configFields: []` on purpose.
//   * The login flows are INTERACTIVE. `claude auth login` opens a browser,
//     prints a code, then blocks on stdin. Spawned from a non-TTY parent it
//     can never complete, and killing it mid-flight leaves the user staring at
//     a dead localhost callback. So we diagnose and instruct, we never automate.

import { canExecute } from "../detect/cli.mjs";
import { run } from "../util/exec.mjs";

/** Pull a boolean-ish field out of a JSON blob on stdout. */
function parseJsonLoose(text) {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start < 0 || end <= start) return undefined;
	try {
		return JSON.parse(text.slice(start, end + 1));
	} catch {
		return undefined;
	}
}

const AUTH_STATUS_PARSERS = {
	"claude-code": (stdout) => {
		const json = parseJsonLoose(stdout);
		if (!json) return { authenticated: false, raw: stdout };
		return {
			authenticated: Boolean(json.loggedIn),
			method: json.authMethod,
			subscription: json.subscriptionType,
			email: json.email,
			raw: stdout,
		};
	},
	"openai-codex-cli": (stdout, stderr) => {
		// `codex login status` prints a human sentence, not JSON, and exits
		// non-zero when signed out. Treat non-zero as "not authenticated".
		const text = `${stdout}\n${stderr}`.trim();
		const authenticated = /logged in|logged-in/i.test(text) && !/not logged in|no credentials/i.test(text);
		return { authenticated, raw: text };
	},
};

const STATUS_ARGS = {
	"claude-code": ["auth", "status"],
	"openai-codex-cli": ["login", "status"],
};

/**
 * Check whether a plan's CLI is authenticated.
 *
 * @returns {Promise<{authenticated:boolean, method?:string, subscription?:string,
 *   raw?:string, error?:string, statusCode?:number}>}
 */
export async function checkAuth(plan, executable, { timeoutMs = 45_000 } = {}) {
	if (!executable) {
		return { authenticated: false, error: "CLI executable not found" };
	}
	const args = STATUS_ARGS[plan.id] ?? ["login", "status"];
	try {
		const result = await run(executable, args, { timeoutMs, rejectOnNonZero: false });
		const parser = AUTH_STATUS_PARSERS[plan.id];
		const parsed = parser ? parser(result.stdout, result.stderr) : { authenticated: result.code === 0, raw: result.stdout };
		return { ...parsed, statusCode: result.code };
	} catch (error) {
		// A CLI that cannot report status is a failure we must surface, not
		// silently treat as authenticated.
		return { authenticated: false, error: error.message };
	}
}

/** The exact command a human must run to fix authentication. */
export function authInstruction(plan) {
	return `${plan.cli} ${plan.auth.login.join(" ")}`;
}

/** Never spawn login ourselves: it needs a TTY and leaves dead callbacks. */
export function interactiveAuthRequired(plan) {
	return Boolean(plan.auth.requiresInteractive);
}
