#!/usr/bin/env node
// Produce single-file, dependency-free redistributables.
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
//
// Three outputs:
//   dist/coding-plans.mjs                    library bundle of src/index.mjs
//   dist/cli.mjs                             the legacy CLI, pointed at the bundle
//   skill/harness-dispatch/scripts/hd.mjs    the dispatch skill script
//
// `node scripts/build-dist.mjs --check` writes nothing. It exits 1 when a
// committed output differs from what the sources would build.
//
// Supported module syntax: named imports and exports, `import * as`,
// `import x from` (relative), `export { a } from`, and `export default <name>;`
// (an identifier on its own line). Not supported: `export *`, computed
// default expressions, default imports of `node:*` modules.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Sources may have CRLF line endings on Windows. The bundles are pinned to LF
// (.gitattributes), so every read is normalised. Then the output is the same
// on every machine.
const readSource = (file) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

// Specifier bodies must not contain `}`; using [\s\S]*? lets a match run
// across several import statements and swallow unrelated text.
const IMPORT_NAMED = /^[ \t]*import\s*\{([^}]*)\}\s*from\s*["'](\.[^"']+)["'];?[ \t]*$/gm;
const IMPORT_STAR = /^[ \t]*import\s*\*\s*as\s+([A-Za-z0-9_$]+)\s+from\s*["'](\.[^"']+)["'];?[ \t]*$/gm;
const IMPORT_DEFAULT = /^[ \t]*import\s+([A-Za-z0-9_$]+)\s*,?\s*from\s*["'](\.[^"']+)["'];?[ \t]*$/gm;
const EXPORT_FROM = /^[ \t]*export\s*\{([^}]*)\}\s*from\s*["'](\.[^"']+)["'];?[ \t]*$/gm;
const EXPORT_DECL = /^[ \t]*export\s+(?:async\s+function|function|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm;
const EXPORT_DEFAULT = /^[ \t]*export\s+default\s+([A-Za-z0-9_$]+);?[ \t]*$/gm;
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
	let source = readSource(file);
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

	// `export default name;` becomes `default: name` in the module's return object.
	source = source.replace(EXPORT_DEFAULT, (m, name) => {
		exported.add(`default: ${name}`);
		return "";
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
		const original = readSource(file);
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

/**
 * Build one bundle.
 *
 * @param {string} entry   Entry module, relative to the repository root.
 * @param {string} header  First comment line of the bundle.
 * @param {"library"|"script"} mode
 *   library: re-export the entry's public names.
 *   script:  also run `main(argv)` of the entry when Node starts the bundle as
 *            a script, and set the exit code from its result.
 */
function buildBundle(entry, header, mode) {
	const modules = collect(entry);
	const entryFile = join(root, entry);

	// Declare every namespace up front. The transformed bodies reference these
	// consts at IIFE-invocation time (not at module-evaluation time), so a
	// top-to-bottom `const` would otherwise hit a temporal dead zone.
	const decls = [...modules.keys()].map((f) => `let ${nsName(f)};`);
	const out = [];
	out.push(header);
	out.push("// Generated by scripts/build-dist.mjs. Do not edit by hand.");
	out.push("");
	if (mode === "script") {
		// Aliased names cannot collide with a module's own imports.
		out.push('import { realpathSync as __realpath } from "node:fs";');
		out.push('import { fileURLToPath as __fileURLToPath } from "node:url";');
	}
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
	const exported = transform(entryFile).exported.filter((name) => !name.startsWith("default:"));
	out.push(`const __entry = ${nsName(entryFile)};`);
	out.push(`export const { ${exported.join(", ")} } = __entry;`);
	out.push(`export default __entry;`);

	if (mode === "script") {
		// Start `main` only when this file is the script that Node runs. A test
		// that imports the bundle must not trigger a run. The exit code is set
		// and not forced with process.exit(), so that stdout can drain.
		out.push("const __isScript = (() => {");
		out.push("\ttry {");
		out.push("\t\treturn Boolean(process.argv[1]) && __realpath.native(process.argv[1]) === __realpath.native(__fileURLToPath(import.meta.url));");
		out.push("\t} catch {");
		out.push("\t\treturn false;");
		out.push("\t}");
		out.push("})();");
		out.push("if (__isScript) process.exitCode = await __entry.main(process.argv.slice(2));");
	}
	return { text: out.join("\n"), count: modules.size };
}

/**
 * The dist CLI is the bin's own source with every relative `../src/*` import
 * repointed at the single bundled file. Two files ship: the library and the
 * CLI that drives it.
 */
function buildLegacyCli() {
	return readSource(join(root, "bin", "coding-plans.mjs")).replace(/from\s*["']\.\.\/src\/[^"']+["']/g, 'from "./coding-plans.mjs"');
}

const library = buildBundle("src/index.mjs", "// cline-coding-plans — single-file distribution.", "library");
const dispatch = buildBundle("src/dispatch/cli.mjs", "// harness-dispatch — single-file script of the skill.", "script");

const outputs = [
	{ path: "dist/coding-plans.mjs", text: library.text, note: `${library.text.length} bytes, ${library.count} modules` },
	{ path: "dist/cli.mjs", text: buildLegacyCli() },
	{ path: "skill/harness-dispatch/scripts/hd.mjs", text: dispatch.text, note: `${dispatch.text.length} bytes, ${dispatch.count} modules` },
];

if (process.argv.includes("--check")) {
	const stale = outputs.filter(({ path, text }) => {
		const file = join(root, path);
		return !existsSync(file) || readSource(file) !== text;
	});
	for (const { path } of stale) console.error(`stale: ${path}`);
	if (stale.length === 0) console.log("bundles are current");
	process.exit(stale.length === 0 ? 0 : 1);
}

for (const { path, text, note } of outputs) {
	const file = join(root, path);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, text, "utf8");
	console.log(`wrote ${path}${note ? ` (${note})` : ""}`);
}
