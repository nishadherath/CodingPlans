// Adapter tests: `buildInvocation` against tables of exact argument arrays,
// and `parseOutput` against fixtures. Both functions are pure, so these tests
// start no process.

import { test } from "node:test";
import assert from "node:assert/strict";

import { DispatchError } from "../../src/dispatch/envelope.mjs";
import antigravity from "../../src/dispatch/harnesses/antigravity.mjs";
import claude from "../../src/dispatch/harnesses/claude.mjs";
import codex from "../../src/dispatch/harnesses/codex.mjs";
import { HARNESSES, TARGET_IDS, getHarness } from "../../src/dispatch/harnesses/index.mjs";
import { fixture, makeCtx, makeRequest, makeResult } from "./helpers.mjs";

const SCHEMA_TEXT = '{ "type": "object" }';
const schema = { path: "/abs/schema.json", text: SCHEMA_TEXT };

test("the registry lists the three version 1 targets", () => {
	assert.deepEqual(TARGET_IDS, ["claude", "codex", "antigravity"]);
	assert.equal(getHarness("codex"), codex);
	assert.equal(getHarness("nope"), undefined);
	for (const adapter of HARNESSES) {
		for (const key of ["id", "name", "cli", "capabilities", "resolve", "buildInvocation", "parseOutput"]) {
			assert.ok(adapter[key] !== undefined, `${adapter.id} lacks ${key}`);
		}
	}
});

// ---------------------------------------------------------------- claude

const CLAUDE_BASE = ["-p", "--output-format", "json", "--permission-prompts", "none"];

const claudeTable = [
	["read-only default", {}, [...CLAUDE_BASE, "--permission-mode", "manual"]],
	["write", { access: "write" }, [...CLAUDE_BASE, "--permission-mode", "acceptEdits"]],
	[
		"model and effort",
		{ model: "sonnet", effort: "high" },
		[...CLAUDE_BASE, "--permission-mode", "manual", "--model", "sonnet", "--effort", "high"],
	],
	["resume", { resume: "abc-123" }, [...CLAUDE_BASE, "--permission-mode", "manual", "--resume", "abc-123"]],
	["schema", { schema }, [...CLAUDE_BASE, "--permission-mode", "manual", "--json-schema", '{"type":"object"}']],
];

for (const [name, overrides, expected] of claudeTable) {
	test(`claude buildInvocation: ${name}`, () => {
		const invocation = claude.buildInvocation(makeRequest(overrides), makeCtx());
		assert.deepEqual(invocation.args, expected);
		assert.equal(invocation.stdin, "Say OK.");
		assert.deepEqual(invocation.tempFiles, []);
	});
}

test("claude never passes a bypass flag", () => {
	for (const access of ["read", "write"]) {
		const args = claude.buildInvocation(makeRequest({ access }), makeCtx()).args.join(" ");
		assert.doesNotMatch(args, /dangerously|bypass/i);
	}
});

test("claude parseOutput: success", () => {
	const parsed = claude.parseOutput(makeResult({ stdout: fixture("claude", "synthetic-success.json") }));
	assert.equal(parsed.ok, true);
	assert.equal(parsed.text, "OK");
	assert.equal(parsed.session_id, "11111111-2222-3333-4444-555555555555");
	assert.equal(parsed.cost_usd, 0.0123);
	assert.equal(parsed.model, "claude-sonnet-5-5");
	assert.deepEqual(parsed.usage, { input_tokens: 12, output_tokens: 5, cache_read_tokens: 3000, reasoning_tokens: null, total_tokens: null });
});

test("claude parseOutput: structured output", () => {
	const parsed = claude.parseOutput(makeResult({ stdout: fixture("claude", "synthetic-structured.json") }));
	assert.equal(parsed.ok, true);
	assert.deepEqual(parsed.structured, { answer: 4 });
});

test("claude parseOutput: an array of messages uses the last result", () => {
	const parsed = claude.parseOutput(makeResult({ stdout: fixture("claude", "synthetic-array.json") }));
	assert.equal(parsed.text, "OK from array");
});

test("claude parseOutput: is_error with a sign-in problem", () => {
	const parsed = claude.parseOutput(makeResult({ code: 1, stdout: fixture("claude", "synthetic-error.json") }));
	assert.equal(parsed.ok, false);
	assert.equal(parsed.error.code, "not-authenticated");
	assert.doesNotMatch(parsed.error.message, /@/, "no account email in the message");
});

test("claude parseOutput: output that is not JSON", () => {
	assert.equal(claude.parseOutput(makeResult({ stdout: "plain text" })).error.code, "bad-output");
	assert.equal(claude.parseOutput(makeResult({ code: 2, stderr: "boom" })).error.code, "target-error");
});

test("claude authCheck reads only loggedIn", () => {
	assert.equal(claude.authCheck.parse(makeResult({ stdout: '{"loggedIn":true,"email":"a@b.c"}' })), true);
	assert.equal(claude.authCheck.parse(makeResult({ stdout: '{"loggedIn":false}' })), false);
	assert.equal(claude.authCheck.parse(makeResult({ stdout: "x" })), null);
});

// ----------------------------------------------------------------- codex

const CODEX_NEW = ["exec", "--json", "--skip-git-repo-check", "-o", "TMP/last-message.txt"];

const codexTable = [
	[
		"read-only default",
		{ cwd: "/work" },
		[...CODEX_NEW, "-C", "/work", "-c", 'sandbox_mode="read-only"', "-"],
	],
	["write", { cwd: "/work", access: "write" }, [...CODEX_NEW, "-C", "/work", "-c", 'sandbox_mode="workspace-write"', "-"]],
	[
		"model and effort",
		{ cwd: "/work", model: "gpt-x", effort: "xhigh" },
		[...CODEX_NEW, "-C", "/work", "-m", "gpt-x", "-c", 'model_reasoning_effort="xhigh"', "-c", 'sandbox_mode="read-only"', "-"],
	],
	[
		"schema",
		{ cwd: "/work", schema },
		[...CODEX_NEW, "-C", "/work", "-c", 'sandbox_mode="read-only"', "--output-schema", "/abs/schema.json", "-"],
	],
	[
		"resume has no -C and puts the id before the prompt marker",
		{ cwd: "/work", resume: "sess-1", model: "gpt-x" },
		["exec", "resume", "--json", "--skip-git-repo-check", "-o", "TMP/last-message.txt", "-m", "gpt-x", "-c", 'sandbox_mode="read-only"', "sess-1", "-"],
	],
];

for (const [name, overrides, expected] of codexTable) {
	test(`codex buildInvocation: ${name}`, () => {
		const invocation = codex.buildInvocation(makeRequest({ to: "codex", ...overrides }), makeCtx());
		assert.deepEqual(invocation.args, expected);
		assert.equal(invocation.stdin, "Say OK.");
		assert.deepEqual(invocation.tempFiles, ["TMP/last-message.txt"]);
	});
}

test("codex never passes a bypass flag and never uses -s on resume", () => {
	const args = codex.buildInvocation(makeRequest({ to: "codex", resume: "x", access: "write" }), makeCtx()).args;
	assert.doesNotMatch(args.join(" "), /dangerously|bypass|danger-full-access/i);
	assert.ok(!args.includes("-s") && !args.includes("-C"));
});

test("codex parseOutput: the -o file is the answer, events give id and usage", () => {
	const invocation = { tempFiles: ["TMP/last-message.txt"] };
	const parsed = codex.parseOutput(makeResult({ stdout: fixture("codex", "synthetic-events.jsonl") }), {
		invocation,
		tempContents: { "TMP/last-message.txt": "Final from file\n" },
		request: makeRequest({ to: "codex" }),
	});
	assert.equal(parsed.ok, true);
	assert.equal(parsed.text, "Final from file");
	assert.equal(parsed.session_id, "0199a213-81c0-7800-8aa1-bbab2a035a53");
	assert.deepEqual(parsed.usage, { input_tokens: 24763, output_tokens: 122, cache_read_tokens: 24448, reasoning_tokens: 64, total_tokens: null });
	assert.equal(parsed.cost_usd, null);
});

test("codex parseOutput: without the -o file the last agent message counts", () => {
	const parsed = codex.parseOutput(makeResult({ stdout: fixture("codex", "synthetic-events.jsonl") }), {
		invocation: { tempFiles: ["TMP/x"] },
		tempContents: { "TMP/x": null },
		request: makeRequest({ to: "codex" }),
	});
	assert.equal(parsed.text, "OK from events");
});

test("codex parseOutput: structured output from a schema run", () => {
	const parsed = codex.parseOutput(makeResult({ stdout: fixture("codex", "synthetic-events.jsonl") }), {
		invocation: { tempFiles: ["TMP/x"] },
		tempContents: { "TMP/x": '{"answer":4}' },
		request: makeRequest({ to: "codex", schema }),
	});
	assert.deepEqual(parsed.structured, { answer: 4 });
});

test("codex parseOutput: turn.failed is a target error, auth text is detected", () => {
	const failed = codex.parseOutput(makeResult({ code: 1, stdout: fixture("codex", "synthetic-failed.jsonl") }), {});
	assert.equal(failed.ok, false);
	assert.equal(failed.error.code, "target-error");
	const auth = codex.parseOutput(makeResult({ code: 1, stdout: fixture("codex", "synthetic-auth-failed.jsonl") }), {});
	assert.equal(auth.error.code, "not-authenticated");
	assert.doesNotMatch(auth.error.message, /@/);
});

test("codex parseOutput: exit 0 without a final message is bad output", () => {
	const parsed = codex.parseOutput(makeResult({ stdout: '{"type":"thread.started","thread_id":"t"}' }), {});
	assert.equal(parsed.error.code, "bad-output");
});

// H2: an `error` event with exit 0 and no final message must keep its text.
test("codex parseOutput: exit 0, an error event and no final message is a target error with that text", () => {
	const stdout = '{"type":"thread.started","thread_id":"t"}\n{"type":"error","message":"stream disconnected before completion"}';
	const parsed = codex.parseOutput(makeResult({ stdout }), {});
	assert.equal(parsed.error.code, "target-error");
	assert.match(parsed.error.message, /stream disconnected/);
});

test("codex authCheck", () => {
	assert.equal(codex.authCheck.parse(makeResult({ stdout: "Logged in using ChatGPT" })), true);
	assert.equal(codex.authCheck.parse(makeResult({ code: 1, stdout: "Not logged in" })), false);
	assert.equal(codex.authCheck.parse(makeResult({ stdout: "???" })), null);
});

// ----------------------------------------------------------- antigravity

const AGY_TAIL = ["--output-format", "json", "--print-timeout", "600s"];

const agyTable = [
	["read-only default", {}, ["-p", "Say OK.", ...AGY_TAIL, "--mode", "plan"]],
	["write", { access: "write" }, ["-p", "Say OK.", ...AGY_TAIL, "--mode", "accept-edits"]],
	[
		"model and effort",
		{ model: "gemini-4-neon-high", effort: "max", timeoutSec: 90 },
		["-p", "Say OK.", "--output-format", "json", "--print-timeout", "90s", "--model", "gemini-4-neon-high", "--effort", "max", "--mode", "plan"],
	],
	["resume and schema", { resume: "conv-1", schema }, ["-p", "Say OK.", ...AGY_TAIL, "--mode", "plan", "--conversation", "conv-1", "--json-schema", "/abs/schema.json"]],
];

for (const [name, overrides, expected] of agyTable) {
	test(`antigravity buildInvocation: ${name}`, () => {
		const invocation = antigravity.buildInvocation(makeRequest({ to: "antigravity", ...overrides }), makeCtx());
		assert.deepEqual(invocation.args, expected);
		assert.equal(invocation.stdin, null);
	});
}

test("antigravity refuses a prompt of more than 24000 characters", () => {
	assert.doesNotThrow(() => antigravity.buildInvocation(makeRequest({ prompt: "x".repeat(24000) }), makeCtx()));
	assert.throws(
		() => antigravity.buildInvocation(makeRequest({ prompt: "x".repeat(24001) }), makeCtx()),
		(error) => error instanceof DispatchError && error.code === "prompt-too-long",
	);
});

test("antigravity parseOutput: success maps thinking tokens to reasoning tokens", () => {
	const parsed = antigravity.parseOutput(makeResult({ stdout: fixture("antigravity", "synthetic-success.json") }));
	assert.equal(parsed.ok, true);
	assert.equal(parsed.text, "OK from agy");
	assert.equal(parsed.session_id, "conv-123");
	assert.deepEqual(parsed.usage, { input_tokens: 50, output_tokens: 7, cache_read_tokens: 30, reasoning_tokens: 11, total_tokens: 98 });
});

test("antigravity parseOutput: good only with exit 0 and status SUCCESS", () => {
	const failure = antigravity.parseOutput(makeResult({ stdout: fixture("antigravity", "synthetic-failure.json") }));
	assert.equal(failure.ok, false);
	assert.equal(failure.error.code, "target-error");
	const badExit = antigravity.parseOutput(makeResult({ code: 1, stdout: fixture("antigravity", "synthetic-success.json") }));
	assert.equal(badExit.ok, false, "status SUCCESS with exit code 1 is not good");
	assert.equal(antigravity.parseOutput(makeResult({ stdout: "no json" })).error.code, "bad-output");
	assert.equal(antigravity.parseOutput(makeResult({ code: 1, stderr: "unknown model" })).error.code, "target-error");
});

test("antigravity models: the status line is skipped", () => {
	const models = antigravity.listModels.parse(makeResult({ stdout: fixture("antigravity", "models.txt") }));
	assert.deepEqual(models, [
		{ id: "gemini-4-neon-high", label: "Gemini 4 Neon (High)" },
		{ id: "claude-opus-5-5-low", label: "Claude Opus 5.5 (Low)" },
	]);
});

test("antigravity has no auth check, and reports unknown", () => {
	assert.equal(antigravity.authCheck, null);
});

// ------------------------------------------------- real captured output
// These fixtures come from live runs that the operator approved (hub session,
// 2026-11-20). Two of the three are failures: the Claude session had expired,
// and the Codex default model was not allowed for the account.

test("claude real output: an expired OAuth session is not-authenticated", () => {
	const parsed = claude.parseOutput(makeResult({ code: 1, stdout: fixture("claude", "real-auth-expired.stdout.json") }));
	assert.equal(parsed.ok, false);
	assert.equal(parsed.error.code, "not-authenticated");
	assert.equal(parsed.session_id, "93b9c78e-4a7b-4242-8e02-5b6f6777da80", "field names match the real output");
	assert.equal(parsed.cost_usd, 0);
	assert.equal(parsed.usage.input_tokens, 0);
});

test("codex real output: warnings do not fail a run, the inner error text is shown", () => {
	const parsed = codex.parseOutput(makeResult({ code: 1, stdout: fixture("codex", "real-model-not-supported.stdout.jsonl") }), {});
	assert.equal(parsed.ok, false);
	assert.equal(parsed.session_id, "01a1f602-4089-7082-930d-89e098a69fe6");
	assert.equal(parsed.error.code, "target-error");
	assert.match(parsed.error.message, /model is not supported when using Codex with a ChatGPT account/);
	assert.doesNotMatch(parsed.error.message, /[{}]/, "the JSON wrapper is removed");
});

test("codex real output: warning items alone, with exit 0 and no message, are bad output", () => {
	const warnings = fixture("codex", "real-model-not-supported.stdout.jsonl").split("\n").filter((line) => !/turn\.failed|"type":"error"/.test(line)).join("\n");
	assert.equal(codex.parseOutput(makeResult({ code: 0, stdout: warnings }), {}).error.code, "bad-output");
});

test("antigravity real output: success", () => {
	const parsed = antigravity.parseOutput(makeResult({ stdout: fixture("antigravity", "real-ok.stdout.json") }));
	assert.equal(parsed.ok, true);
	assert.equal(parsed.text, "OK", "the final newline is removed");
	assert.equal(parsed.session_id, "dc0f94f7-4854-4e1b-b050-a831c3aa8aae");
	assert.deepEqual(parsed.usage, { input_tokens: 22362, output_tokens: 634, cache_read_tokens: 0, reasoning_tokens: 632, total_tokens: 22996 });
});
