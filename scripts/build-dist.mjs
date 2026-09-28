#!/usr/bin/env node
// Produce a single-file, dependency-free redistributable.
//
// Why bundle: the package is plain ESM with zero runtime dependencies, so
// inlining it into one .mjs removes the install step, node_modules resolution,
// and any version skew. `node dist/coding-plans.mjs` is the whole distribution.
//
// Approach: each module becomes an IIFE that returns a namespace object of its
// exports, and every relative import becomes a destructuring of that namespace.
// Namespacing (rather than naive concatenation) matters here: several modules
// each declare a module-local `isWindows`, so a flat concatenation would
// silently shadow. `node:fs` & friends are left as real imports.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Specifier bodies must not contain `}`; using [\s\S]*? lets a match run
// across several import statements and swallow unrelated text.
const IMPORT_NAMED = /^[ \t]*import\s*\{([^}]*)\}\s*from\s*["'](\.[^"']+)["'];?[ \t]*$/gm;
const IMPORT_STAR = /^[ \t]*import\s*\*\s*as\s+([A-Za-z0-9_$]+)\s+from\s*["'](\.[^"']+)["'];?[ \t]*$/gm;
const IMPORT_DEFAULT = /^[ \t]*import\s+([A-Za-z0-9_$]+)\s*,?\s*from\s*["'](\.[^"']+)["'];?[ \t]*$/gm;
const EXPORT_FROM = /^[ \t]*export\s*\{([^}]*)\}\s*from\s*["'](\.[^"']+)["'];?[ \t]*$/gm;
const EXPORT_DECL = /^[ \t]*export\s+(?:async\s+function|function|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm;
const EXPORT_LIST = /^[ \t]*export\s*\{([^}]*)\};?[ \t]*$/gm;

function resolveRelative(fromFile, spec) {
	const base = resolve(dirname(fromFile), spec);
	for (const c of [base, `${base}.mjs`, join(base, "index.mjs")]) {
		if (existsSync(c) && statSync(c).isFile()) return c;
	}
	throw new Error(`Cannot resolve "${spec}" from ${relative(root, fromFile)}`);
}

const nsName = (file) => "__ns_" + relative(root, file).split(sep).join("/").replace(/[^A-Za-z0-9]/g, "_");

/** Split `a, b as c` into [{imported, local}]. */
function parseSpecifiers(inner) {
	return inner
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => {
			const m = /^([A-Za-z0-9_$]+)(?:\s+as\s+([A-Za-z0-9_$]+))?$/.exec(s);
			if (!m) throw new Error(`Unsupported import/export specifier: "${s}"`);
			return { imported: m[1], local: m[2] ?? m[1] };
		});
}

function transform(file) {
	let source = readFileSync(file, "utf8");
	const exported = new Set();

	// Only RELATIVE imports are rewritten. `node:*` and bare specifiers are
	// left exactly as written so the bundle keeps working against the real
	// runtime rather than trying to inline builtins.
	const isRelative = (spec) => spec.startsWith(".");

	source = source.replace(IMPORT_NAMED, (m, inner, spec) => {
		if (!isRelative(spec)) return m;
		const ns = nsName(resolveRelative(file, spec));
		const parts = parseSpecifiers(inner).map(({ imported, local }) => (imported === local ? imported : `${imported}: ${local}`));
		return `const { ${parts.join(", ")} } = ${ns};`;
	});

	source = source.replace(IMPORT_STAR, (m, local, spec) => (isRelative(spec) ? `const ${local} = ${nsName(resolveRelative(file, spec))};` : m));

	source = source.replace(IMPORT_DEFAULT, (m, local, spec) => {
		if (!isRelative(spec)) return m;
		exported.add(local);
		return `const ${local} = ${nsName(resolveRelative(file, spec))}.default;`;
	});

	source = source.replace(EXPORT_FROM, (m, inner, spec) => {
		if (!isRelative(spec)) return m;
		const ns = nsName(resolveRelative(file, spec));
		const specs = parseSpecifiers(inner);
		for (const { local } of specs) exported.add(local);
		const decls = specs.map(({ imported, local }) => (imported === local ? local : `${imported}: ${local}`));
		return `const { ${decls.join(", ")} } = ${ns};`;
	});

	source = source.replace(EXPORT_DECL, (m, name) => {
		exported.add(name);
		return m.replace(/export\s+/, "");
	});

	source = source.replace(EXPORT_LIST, (m, inner) => {
		for (const { local } of parseSpecifiers(inner)) exported.add(local);
		return m.replace(/export\s*/, "");
	});

	return { source, exported: [...exported] };
}

/** Every relative specifier in the ORIGINAL source, before rewriting. */
function relativeSpecifiers(source) {
	return [...source.matchAll(/(?:from|import)\s*["'](\.[^"']+)["']/g)].map((m) => m[1]);
}

function collect(entry) {
	const seen = new Map();
	const visiting = new Set();
	const visit = (file) => {
		if (seen.has(file) || visiting.has(file)) return;
		visiting.add(file);
		// Dependencies must be read from the ORIGINAL source: `transform`
		// rewrites `from "./x"` into a bare namespace reference, so scanning
		// the transformed text finds nothing to recurse into.
		const original = readFileSync(file, "utf8");
		for (const spec of relativeSpecifiers(original)) visit(resolveRelative(file, spec));
		visiting.delete(file);
		if (!seen.has(file)) seen.set(file, transform(file).source);
	};
	visit(join(root, entry));
	return seen;
}

/**
 * Hoist `import` declarations out of the module bodies.
 *
 * The bundle wraps each module in an IIFE, and ESM forbids `import`
 * declarations inside a function body. Each hoisted import is namespaced by
 * its owning module (`const {existsSync} = __node_fs_0;`) so that two modules
 * importing the same helper from `node:fs` do not collide. The alternative —
 * a flat top-level import — breaks as soon as any two modules disagree about
 * a binding name, which they immediately do.
 */
function hoistImports(modules) {
	const perModule = new Map(); // specifier -> Set(localName)
	for (const source of modules.values()) {
		for (const m of source.matchAll(/^[ \t]*import\s+([^;]*?)\s*from\s*["']([^"']+)["'];?[ \t]*$/gm)) {
			const clause = m[1].trim();
			const spec = m[2];
			const names = new Set();
			const braced = /\{([^}]*)\}/.exec(clause);
			if (braced) for (const s of parseSpecifiers(braced[1])) names.add(s.local);
			const bare = clause.replace(/\{[^}]*\}/, "").replace(/,/g, "").trim();
			if (bare && !bare.startsWith("*")) names.add(bare);
			const star = /\*\s*as\s+([A-Za-z0-9_$]+)/.exec(clause);
			if (star) names.add(star[1]);
			if (!perModule.has(spec)) perModule.set(spec, new Set());
			for (const n of names) perModule.get(spec).add(n);
		}
	}

	const lines = [];
	let i = 0;
	for (const [spec, names] of perModule) {
		const alias = `__imp_${i++}_${spec.replace(/[^A-Za-z0-9]/g, "_")}`;
		lines.push(`import * as ${alias} from "${spec}";`);
		lines.push(`const { ${[...names].join(", ")} } = ${alias};`);
	}
	return lines;
}

const modules = collect("src/index.mjs");

// Declare every namespace up front. The transformed bodies reference these
// consts at IIFE-invocation time (not at module-evaluation time), so a
// top-to-bottom `const` would otherwise hit a temporal dead zone.
const decls = [...modules.keys()].map((f) => `let ${nsName(f)};`);
const out = [];
out.push("// cline-coding-plans — single-file distribution.");
out.push("// Generated by scripts/build-dist.mjs. Do not edit by hand.");
out.push("");
out.push(...hoistImports(modules));
out.push("");
out.push(...decls);

for (const [file, source] of modules) {
	const rel = relative(root, file).split(sep).join("/");
	// Imports were hoisted above; strip them from the body.
	const body = source.replace(/^[ \t]*import\s+[^;]*?from\s*["'][^"']+["'];?[ \t]*$/gm, "");
	out.push(`// ${"=".repeat(70)}`);
	out.push(`// ${rel}`);
	out.push(`${nsName(file)} = (() => {`);
	out.push(body.trimEnd());
	out.push(`return { ${transform(file).exported.join(", ")} };`);
	out.push("})();");
	out.push("");
}

// Re-export the entry's public surface. A plain `export { a, b }` would
// reference bindings that live inside the module IIFEs and are not in scope
// here, so destructure the entry namespace into top-level consts instead —
// `export const { a, b } = ns` is valid and keeps everything resolvable.
const exported = transform(join(root, "src/index.mjs")).exported;
const entryNs = nsName(join(root, "src/index.mjs"));
out.push(`const __entry = ${entryNs};`);
out.push(`export const { ${exported.join(", ")} } = __entry;`);
out.push(`export default __entry;`);

mkdirSync(join(root, "dist"), { recursive: true });
const bundlePath = join(root, "dist", "coding-plans.mjs");
const text = out.join("\n");
writeFileSync(bundlePath, text, "utf8");

// The dist CLI is the bin's own source with every relative `../src/*` import
// repointed at the single bundled file. Two files ship: the library and the
// CLI that drives it.
const cliSource = readFileSync(join(root, "bin", "coding-plans.mjs"), "utf8").replace(
	/from\s*["']\.\.\/src\/[^"']+["']/g,
	'from "./coding-plans.mjs"',
);
writeFileSync(join(root, "dist", "cli.mjs"), cliSource, "utf8");

console.log(`wrote dist/coding-plans.mjs (${text.length} bytes, ${modules.size} modules)`);
console.log("wrote dist/cli.mjs");


