// Output parsing helpers shared by the adapters and the envelope.
//
// A target CLI prints JSON, JSON Lines, or text with a status line before the
// JSON. The helpers here accept all three without guessing about content.

/** Replace values that must never reach a result envelope. */
export function redact(text) {
	return String(text ?? "")
		.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, "[email]")
		.replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[secret]")
		.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, "Bearer [secret]")
		.replace(/\b(?:sk|pk|key|token)-[A-Za-z0-9_-]{16,}/gi, "[secret]");
}

/** The last `max` characters of a text, redacted and on one line. */
export function tailText(text, max = 300) {
	const flat = redact(text).replace(/\s+/g, " ").trim();
	return flat.length > max ? `...${flat.slice(flat.length - max)}` : flat;
}

/**
 * Parse one JSON object from text.
 *
 * Order: the whole text; then the last line that is an object; then the span
 * from the first "{" to the last "}". Returns undefined when nothing parses.
 */
export function parseJsonLoose(text) {
	const source = String(text ?? "").trim();
	if (!source) return undefined;
	const attempt = (candidate) => {
		try {
			const value = JSON.parse(candidate);
			return value !== null && typeof value === "object" ? value : undefined;
		} catch {
			return undefined;
		}
	};
	const whole = attempt(source);
	if (whole !== undefined) return whole;
	const lines = source.split("\n");
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i].trim();
		if (line.startsWith("{") || line.startsWith("[")) {
			const value = attempt(line);
			if (value !== undefined) return value;
		}
	}
	const first = source.indexOf("{");
	const last = source.lastIndexOf("}");
	return first >= 0 && last > first ? attempt(source.slice(first, last + 1)) : undefined;
}

/** Every line of a text that parses as a JSON object, in order. */
export function parseJsonLines(text) {
	const events = [];
	for (const raw of String(text ?? "").split("\n")) {
		const line = raw.trim();
		if (!line.startsWith("{")) continue;
		try {
			const value = JSON.parse(line);
			if (value !== null && typeof value === "object") events.push(value);
		} catch {
			// A banner line or a cut line. Skip it.
		}
	}
	return events;
}

/**
 * The human text of an error message.
 *
 * Codex puts a JSON document in the message, for example
 * `{"type":"error","status":400,"error":{"message":"..."}}`. Return the inner
 * message when the text parses and has one. Else return the text unchanged.
 */
export function unwrapMessage(text) {
	const object = parseJsonLoose(text);
	if (object && !Array.isArray(object)) {
		const inner = pickString(object.error?.message, object.message);
		if (inner) return inner;
	}
	return String(text ?? "");
}

/** The first argument that is a finite number, else null. */
export function pickNumber(...values) {
	for (const value of values) {
		if (typeof value === "number" && Number.isFinite(value)) return value;
	}
	return null;
}

/** The first argument that is a non-empty string, else null. */
export function pickString(...values) {
	for (const value of values) {
		if (typeof value === "string" && value.trim()) return value;
	}
	return null;
}

// The last four patterns come from a real failed run: Claude Code printed
// "Failed to authenticate: OAuth session expired and could not be refreshed".
const UNAUTHENTICATED =
	/not\s+(?:logged|signed)\s+in|(?:please\s+)?(?:run\s+)?\/?login\b|invalid\s+api\s+key|authentication\s+(?:failed|required|error)|unauthori[sz]ed|\b401\b|missing\s+credentials|no\s+credentials|failed\s+to\s+authenticate|oauth|session\s+(?:has\s+)?expired|could\s+not\s+be\s+refreshed/i;

/**
 * True when the text of a FAILED run looks like a sign-in problem.
 * Never call it on the answer of a successful run.
 */
export function looksUnauthenticated(text) {
	return UNAUTHENTICATED.test(String(text ?? ""));
}

// Usage and rate limits. A real Codex run printed "You've hit your usage limit.
// Visit .../settings/usage to purchase more credits or try again at 12:10 PM."
// The other phrases are the common wording of the other services.
const USAGE_LIMIT =
	/usage\s+limit|rate[\s-]?limit|quota\s+(?:exceeded|exhausted|reached)|exceeded\s+your\s+(?:\w+\s+)?quota|too\s+many\s+requests|\b429\b|hit\s+your\s+(?:\w+\s+)?limit|limit\s+reached/i;

/**
 * True when the text of a FAILED run reports a usage or rate limit.
 * Never call it on the answer of a successful run.
 */
export function looksUsageLimited(text) {
	return USAGE_LIMIT.test(String(text ?? ""));
}

/**
 * The `error.code` for a failed run, from its text. A limit is checked before
 * a sign-in problem: the wording is more specific, and the caller must not
 * dispatch again to that target (SKILL.md).
 */
export function failureCode(text) {
	if (looksUsageLimited(text)) return "usage-limit";
	return looksUnauthenticated(text) ? "not-authenticated" : "target-error";
}

/**
 * Text for the `denied_actions` of a target: "command: Bash".
 * `agy` prints an array of `{ action, display_name }`. Anything else gives [].
 */
export function deniedActions(list) {
	if (!Array.isArray(list)) return [];
	const texts = [];
	for (const item of list) {
		if (typeof item === "string" && item.trim()) texts.push(redact(item.trim()));
		else if (item && typeof item === "object") {
			const action = pickString(item.action);
			// agy: { action, display_name }. Claude Code: { tool_name, tool_use_id, tool_input }.
			const name = pickString(item.display_name, item.displayName, item.name, item.tool_name);
			if (action && name) texts.push(redact(`${action}: ${name}`));
			else if (action || name) texts.push(redact(action ?? name));
		}
	}
	return texts;
}
