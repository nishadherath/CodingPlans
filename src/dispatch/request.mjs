// Request validation and defaults.
//
// The command line parser gives raw strings. This module turns them into one
// request object, or into a usage error. It does no I/O: the caller reads the
// prompt and the schema file, and passes their text in.

import { resolve } from "node:path";

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
export const ACCESS_MODES = ["read", "write"];
export const DEFAULT_ACCESS = "read";
export const DEFAULT_TIMEOUT_SEC = 600;
export const DEFAULT_MAX_CHARS = 20000;
const MAX_TIMEOUT_SEC = 86400;

/** A positive integer from text, or undefined. */
function positiveInt(value) {
	return /^\d{1,9}$/.test(String(value).trim()) && Number(value) > 0 ? Number(value) : undefined;
}

/**
 * Validate a raw request.
 *
 * @param {object} raw
 *   Strings from the command line: to, model, effort, access, cwd, resume,
 *   timeout, maxChars, out. `prompt` is the final prompt text. `schema` is
 *   `{ path, text }` or undefined.
 * @param {object} options
 * @param {string[]} options.targets  Known target ids.
 * @param {string}   options.cwd      The default working directory.
 * @returns {{ request: object } | { error: { code: string, message: string } }}
 */
export function validateRequest(raw, { targets, cwd }) {
	const usage = (message) => ({ error: { code: "usage", message } });

	if (!raw.to) return usage(`--to is required. Known targets: ${targets.join(", ")}.`);
	if (!targets.includes(raw.to)) return usage(`Unknown target "${raw.to}". Known targets: ${targets.join(", ")}.`);

	if (typeof raw.prompt !== "string" || raw.prompt.trim() === "") {
		return usage("The prompt is empty. Give --prompt, --prompt-file, or text on stdin.");
	}

	const access = raw.access ?? DEFAULT_ACCESS;
	if (!ACCESS_MODES.includes(access)) return usage(`--access must be one of: ${ACCESS_MODES.join(", ")}.`);

	if (raw.effort !== undefined && !EFFORTS.includes(raw.effort)) {
		return usage(`--effort must be one of: ${EFFORTS.join(", ")}.`);
	}

	for (const name of ["model", "resume"]) {
		// A value that starts with "-" is almost always a flag that lost its value.
		if (raw[name] !== undefined && (raw[name].trim() === "" || raw[name].startsWith("-"))) {
			return usage(`--${name} needs a value that does not start with "-".`);
		}
	}

	let timeoutSec = DEFAULT_TIMEOUT_SEC;
	if (raw.timeout !== undefined) {
		timeoutSec = positiveInt(raw.timeout);
		if (timeoutSec === undefined || timeoutSec > MAX_TIMEOUT_SEC) {
			return usage(`--timeout must be a whole number of seconds from 1 to ${MAX_TIMEOUT_SEC}.`);
		}
	}

	let maxChars = DEFAULT_MAX_CHARS;
	if (raw.maxChars !== undefined) {
		maxChars = positiveInt(raw.maxChars);
		if (maxChars === undefined) return usage("--max-chars must be a positive whole number.");
	}

	return {
		request: {
			to: raw.to,
			prompt: raw.prompt,
			model: raw.model ?? null,
			effort: raw.effort ?? null,
			access,
			cwd: resolve(cwd, raw.cwd ?? "."),
			resume: raw.resume ?? null,
			schema: raw.schema ?? null,
			timeoutSec,
			maxChars,
			out: raw.out ? resolve(cwd, raw.out) : null,
		},
	};
}
