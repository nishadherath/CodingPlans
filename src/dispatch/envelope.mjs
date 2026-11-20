// The result envelope: the one JSON object that `hd` prints on stdout.
//
// Every code path, success or failure, builds its output here. One builder
// keeps the field set and the field order the same for each result, so the
// calling agent can parse a failure with the code that parses a success.

import { redact } from "./parse.mjs";

export const SCHEMA = "harness-dispatch/1";
export const VERSION = "0.2.1";

/** Process exit code for each `error.code`. */
const EXIT_CODES = {
	"target-error": 1,
	timeout: 1,
	"bad-output": 1,
	"not-authenticated": 1,
	"permission-denied": 1,
	"usage-limit": 1,
	usage: 2,
	"prompt-too-long": 2,
	"not-installed": 3,
	"not-startable": 3,
	"depth-exceeded": 4,
};

/** A failure that already has an `error.code` of the contract. */
export class DispatchError extends Error {
	constructor(code, message) {
		super(message);
		this.name = "DispatchError";
		this.code = code;
	}
}

/** The `denied_actions` of an envelope: an array of non-empty strings. */
function normalizeDenied(list) {
	return Array.isArray(list) ? list.filter((item) => typeof item === "string" && item.trim() !== "") : [];
}

/** Exit code of `hd` for an error object, or 0 for no error. */
export function exitCodeFor(error) {
	if (!error) return 0;
	return EXIT_CODES[error.code] ?? 1;
}

/** An `error` object that is safe to print: no email, no secret. */
export function makeError(code, message) {
	return { code, message: redact(message) };
}

/** A usage record in which each field is a number or null. */
export function normalizeUsage(usage = {}) {
	const number = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
	return {
		input_tokens: number(usage.input_tokens),
		output_tokens: number(usage.output_tokens),
		cache_read_tokens: number(usage.cache_read_tokens),
		reasoning_tokens: number(usage.reasoning_tokens),
		total_tokens: number(usage.total_tokens),
	};
}

/** Cut a text to `maxChars`. Do not leave half of a surrogate pair. */
export function truncateText(text, maxChars) {
	const value = typeof text === "string" ? text : "";
	if (!(maxChars > 0) || value.length <= maxChars) return { text: value, truncated: false };
	let end = maxChars;
	const last = value.charCodeAt(end - 1);
	if (last >= 0xd800 && last <= 0xdbff) end -= 1;
	return { text: value.slice(0, end), truncated: true };
}

/**
 * Build the envelope. Missing fields get the neutral value of the contract.
 * `exit_code` is the exit code of `hd` itself, and follows `error.code`.
 */
export function buildEnvelope(fields = {}) {
	const error = fields.error ?? null;
	return {
		schema: SCHEMA,
		ok: error === null && fields.ok !== false,
		harness: fields.harness ?? null,
		model: fields.model ?? null,
		effort: fields.effort ?? null,
		access: fields.access ?? null,
		session_id: fields.session_id ?? null,
		text: typeof fields.text === "string" ? fields.text : "",
		structured: fields.structured ?? null,
		truncated: fields.truncated === true,
		usage: normalizeUsage(fields.usage),
		cost_usd: typeof fields.cost_usd === "number" && Number.isFinite(fields.cost_usd) ? fields.cost_usd : null,
		duration_ms: Number.isFinite(fields.duration_ms) ? Math.round(fields.duration_ms) : 0,
		exit_code: exitCodeFor(error),
		error,
		denied_actions: normalizeDenied(fields.denied_actions),
		log_file: fields.log_file ?? null,
	};
}

/** An envelope for a failure that happened before or without a target answer. */
export function errorEnvelope(code, message, fields = {}) {
	return buildEnvelope({ ...fields, error: makeError(code, message) });
}
