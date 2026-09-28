// Structured console output. Everything a run prints is machine-greppable so
// CI logs stay readable, and `quiet` silences progress without silencing
// errors or the final JSON report.

const state = { quiet: false, json: false };

export function configure(opts = {}) {
	state.quiet = Boolean(opts.quiet);
	state.json = Boolean(opts.json);
}

export const symbols = {
	ok: "✓",
	fail: "✗",
	warn: "!",
	info: "·",
	step: "→",
};

const paint = {
	ok: (s) => `[32m${s}[0m`,
	fail: (s) => `[31m${s}[0m`,
	warn: (s) => `[33m${s}[0m`,
	dim: (s) => `[2m${s}[0m`,
	bold: (s) => `[1m${s}[0m`,
};

// Colour is only meaningful on a real TTY; CI consoles and redirected output
// get plain ASCII so log diffs stay stable.
const useColor = () => process.stdout.isTTY && !process.env.NO_COLOR;

function color(fn, text) {
	return useColor() ? paint[fn](text) : text;
}

export const colorOk = (s) => color("ok", s);
export const colorFail = (s) => color("fail", s);
export const colorWarn = (s) => color("warn", s);
export const colorDim = (s) => color("dim", s);
export const colorBold = (s) => color("bold", s);

export function step(message) {
	if (state.json || state.quiet) return;
	console.log(`${colorDim(symbols.step)} ${message}`);
}

export function info(message) {
	if (state.json || state.quiet) return;
	console.log(`${colorDim(symbols.info)} ${message}`);
}

export function warn(message) {
	// Warnings are never suppressed by --quiet: they are the actionable part.
	console.log(`${colorWarn(symbols.warn)} ${message}`);
}

export function error(message) {
	console.error(`${colorFail(symbols.fail)} ${message}`);
}

export function success(message) {
	if (state.json) return;
	console.log(`${colorOk(symbols.ok)} ${message}`);
}

export function failure(message) {
	error(message);
}

export function heading(message) {
	if (state.json) return;
	console.log(`\n${colorBold(message)}`);
}

export function detail(message) {
	if (state.json || state.quiet) return;
	console.log(`  ${colorDim(message)}`);
}

export function isJson() {
	return state.json;
}
