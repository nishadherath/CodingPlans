// The provider catalogue.
//
// Each entry mirrors the spec Cline ships in
// sdk/packages/llms/src/providers/builtins.ts. Those values are the contract:
// `providerId` selects the handler, `defaultModelId` is what Cline preselects,
// and `localCliCommand` is what a host probes before offering the provider.
//
// The `cli` field is what makes this package plan-aware: each provider has a
// hard prerequisite executable, and we refuse to "install" a plan whose CLI is
// absent rather than producing a half-configured provider.

export const PLANS = {
	"claude-code": {
		id: "claude-code",
		name: "Claude Code",
		cli: "claude",
		docsUrl: "https://code.claude.com/docs/en/setup",
		installHint: "curl -fsSL https://claude.ai/install.sh | bash   (or: npm i -g @anthropic-ai/claude-code)",
		peerPackage: "ai-sdk-provider-claude-code",
		peerRange: "^4",
		// Verified on this machine: the CLI honours an `sonnet` alias and
		// resolves it against the account's entitlements.
		defaultModelId: "sonnet",
		modelCandidates: ["sonnet", "opus", "haiku"],
		// Cline resolves this itself (pathToClaudeCodeExecutable), so the
		// provider works as long as *some* real claude executable is findable.
		selfResolvesExecutable: true,
		auth: {
			kind: "cli",
			login: ["claude", "auth", "login"],
			status: ["claude", "auth", "status"],
			// The OAuth flow prints a URL and then waits on stdin for the code.
			// A child process without a TTY cannot complete it, so the doctor
			// reports "run this yourself" instead of pretending to automate it.
			requiresInteractive: true,
			docsUrl: "https://code.claude.com/docs/en/setup",
		},
		verify: {
			args: ["-p", "--output-format", "json", "--model", "sonnet", "Reply with exactly: PONG"],
			// `claude -p` emits a single JSON object on stdout.
			expectJsonEnvelope: true,
			timeoutMs: 120_000,
		},
	},
	"openai-codex-cli": {
		id: "openai-codex-cli",
		name: "OpenAI Codex CLI",
		cli: "codex",
		docsUrl: "https://developers.openai.com/codex/cli",
		installHint: "npm i -g @openai/codex   (then: codex login)",
		peerPackage: "ai-sdk-provider-codex-cli",
		peerRange: "^2",
		// NOTE: Cline's built-in default is "gpt-5.6-sol". Real ChatGPT
		// accounts reject it with:
		//   "The 'gpt-6-sol' model is not supported when using Codex with a
		//    ChatGPT account."
		// so we must select a model the account actually serves.
		defaultModelId: "gpt-5.5",
		modelCandidates: ["gpt-5.5", "gpt-5.6-luna", "gpt-5.6-terra", "gpt-6-astra"],
		// Cline does NOT resolve a path for this provider: it passes options
		// straight through and ai-sdk-provider-codex-cli falls back to a bare
		// `codex` spawn. buildGatewayProviderOptions forwards nothing for
		// openai-codex-cli, so PATH wiring is the only lever we control.
		selfResolvesExecutable: false,
		auth: {
			kind: "cli",
			login: ["codex", "login"],
			status: ["codex", "login", "status"],
			requiresInteractive: true,
			docsUrl: "https://developers.openai.com/codex/cli",
		},
		verify: {
			// --experimental-json is what the provider hardcodes; the plain
			// --json spelling is not what it sends.
			args: ["exec", "--experimental-json", "--skip-git-repo-check", "-m", "gpt-5.5", "Reply with exactly: PONG"],
			expectJsonLines: true,
			timeoutMs: 120_000,
		},
	},
};

export const PLAN_IDS = Object.keys(PLANS);

export function getPlan(id) {
	const plan = PLANS[id];
	if (!plan) {
		throw new Error(`Unknown plan "${id}". Known plans: ${PLAN_IDS.join(", ")}`);
	}
	return plan;
}

export function listPlans() {
	return PLAN_IDS.map((id) => ({ ...PLANS[id] }));
}
