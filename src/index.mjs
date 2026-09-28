// Public entry point for programmatic use.
//
//   import { setup, doctor, verify } from "cline-coding-plans";
//   const { verify } = await setup({ selection: ["openai-codex-cli"] });

export { doctor, fix, setup, verify, resolvePlans } from "./setup.mjs";
export { PLANS, PLAN_IDS, getPlan, listPlans } from "./plans.mjs";
export { detectCli, findSpawnableOnPath, findAllOnPath, probeVersion } from "./detect/cli.mjs";
export { detectCline, findLlmsPackage, readOptionalPeers } from "./detect/cline.mjs";
export { ensureSpawnable, checkStaleness, pickTargetDir } from "./fix/executable.mjs";
export { installPeers, isPeerPresent, globalRoots } from "./fix/peers.mjs";
export { checkAuth, authInstruction } from "./check/auth.mjs";
export { verifyCliDirect, verifyViaClineHost, verifyPlan } from "./check/verify.mjs";
export { ExecError, run, tryRun, stream } from "./util/exec.mjs";
// Re-export the logger surface under flat names. The CLI imports these
// directly instead of `import * as log`, because a namespace re-export
// (`export * as log`) is not a form the single-file bundler can rewrite into
// its internal namespace objects.
export {
	configure as configureLogger,
	error as logError,
	warn as logWarn,
	success as logSuccess,
	failure as logFailure,
	heading as logHeading,
	detail as logDetail,
	step as logStep,
	info as logInfo,
} from "./util/log.mjs";
