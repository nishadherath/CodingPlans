// Depth guard: stop dispatch loops between harnesses.
//
// Why: an agent in harness A can dispatch to B, and B has this skill too. B
// could dispatch back to A, with no person at any prompt. Each `run` passes
// the depth plus 1 to its target. A `run` is refused when the depth reaches
// the maximum. The default maximum is 1, so a dispatched agent cannot dispatch.

export const DEPTH_VAR = "HARNESS_DISPATCH_DEPTH";
export const MAX_DEPTH_VAR = "HARNESS_DISPATCH_MAX_DEPTH";
const DEFAULT_MAX_DEPTH = 1;

/** A non-negative integer from text, or undefined when the text is not one. */
function parseCount(value) {
	if (value === undefined || value === "") return undefined;
	return /^\d{1,6}$/.test(String(value).trim()) ? Number(value) : undefined;
}

/**
 * Read the depth and the maximum from the environment.
 *
 * An unset depth is 0. A depth that is set but not a number is treated as
 * "at the maximum": a broken guard must stop work, not allow it.
 */
export function readDepth(env = process.env) {
	const max = parseCount(env[MAX_DEPTH_VAR]) ?? DEFAULT_MAX_DEPTH;
	const raw = env[DEPTH_VAR];
	if (raw === undefined || raw === "") return { depth: 0, max, valid: true };
	const depth = parseCount(raw);
	return depth === undefined ? { depth: max, max, valid: false } : { depth, max, valid: true };
}

/** `{ allowed, depth, max, message }`. */
export function checkDepth(env = process.env) {
	const { depth, max, valid } = readDepth(env);
	if (depth < max) return { allowed: true, depth, max, message: "" };
	const why = valid
		? `The dispatch depth is ${depth} and the maximum is ${max}.`
		: `${DEPTH_VAR} is not a number.`;
	return {
		allowed: false,
		depth,
		max,
		message: `${why} A dispatched agent cannot dispatch again. Do the task yourself, or ask the operator to raise ${MAX_DEPTH_VAR}.`,
	};
}

/** A copy of the environment with the depth plus 1. */
export function withDepth(env = process.env) {
	const { depth } = readDepth(env);
	return { ...env, [DEPTH_VAR]: String(depth + 1) };
}
