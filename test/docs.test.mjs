// Documentation tests: each relative link in the user documents points to a
// file that exists, and each document of the set can be reached from README.md.
//
// Why: a broken link in a README is the first thing a new reader finds.
// These tests read files only. They start no process.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The documents under test: README.md, CHANGELOG.md and docs/*.md (no sub-folders). */
const documents = [
	"README.md",
	"CHANGELOG.md",
	...readdirSync(join(root, "docs"))
		.filter((name) => name.endsWith(".md"))
		.map((name) => `docs/${name}`),
];

/** The files that the document set must contain. */
const REQUIRED = [
	"README.md",
	"CHANGELOG.md",
	"docs/README.md",
	"docs/install.md",
	"docs/usage.md",
	"docs/safety.md",
	"docs/troubleshooting.md",
	"docs/development.md",
	"docs/legacy-cline-providers.md",
];

/** Markdown file targets of the relative links in a file. Fenced code is ignored. */
function relativeLinks(file) {
	const text = readFileSync(join(root, file), "utf8").replace(/```[\s\S]*?```/g, "");
	const found = [];
	for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
		const target = match[1];
		if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue;
		found.push(target.split("#")[0]);
	}
	return found.filter(Boolean);
}

test("the document set exists", () => {
	for (const file of REQUIRED) assert.ok(existsSync(join(root, file)), `${file} is missing`);
});

test("each relative link points to a file or folder that exists", () => {
	const broken = [];
	for (const file of documents) {
		for (const target of relativeLinks(file)) {
			const path = resolve(root, dirname(file), decodeURIComponent(target));
			if (!existsSync(path)) broken.push(`${file} -> ${target}`);
		}
	}
	assert.deepEqual(broken, []);
});

test("each document of the set can be reached from README.md", () => {
	const seen = new Set(["README.md"]);
	const queue = ["README.md"];
	while (queue.length > 0) {
		const file = queue.shift();
		for (const target of relativeLinks(file)) {
			const path = resolve(root, dirname(file), decodeURIComponent(target));
			const name = relative(root, path).replaceAll("\\", "/");
			if (name.endsWith(".md") && existsSync(path) && !seen.has(name)) {
				seen.add(name);
				queue.push(name);
			}
		}
	}
	const unreached = REQUIRED.filter((file) => !seen.has(file));
	assert.deepEqual(unreached, []);
});
