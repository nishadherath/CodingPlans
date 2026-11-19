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

const UNAUTHENTICATED =
	/not\s+(?:logged|signed)\s+in|(?:please\s+)?(?:run\s+)?\/?login\b|invalid\s+api\s+key|authentication\s+(?:failed|required|error)|unauthori[sz]ed|\b401\b|missing\s+credentials|no\s+credentials/i;

/**
 * True when the text of a FAILED run looks like a sign-in problem.
 * Never call it on the answer of a successful run.
 */
export function looksUnauthenticated(text) {
	return UNAUTHENTICATED.test(String(text ?? ""));
}
