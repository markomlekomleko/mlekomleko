#!/usr/bin/env node
/**
 * Compare two computed-style digest directories written by tests/visual/capture.spec.ts.
 *
 *   node tests/visual/digest-diff.mjs <dirA> <dirB> [--json out.json] [--only <substring>]
 *
 * A directory may be the capture root (containing `digest/`) or the digest folder
 * itself (containing `<project>/<slug>.json`). Prints, per route x viewport, how many
 * elements differ and the first 10 differences, plus elements present on one side only.
 * `--only` keeps just the captures whose `<project>/<slug>` contains the substring
 * (repeatable), e.g. `--only admin` for the admin route and every admin tab state.
 * Exits 1 when anything differs, 0 when both digests are identical.
 */
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ABSENT = "∅";

function usage(message) {
  if (message) console.error(message);
  console.error("Usage: node tests/visual/digest-diff.mjs <dirA> <dirB> [--json out.json] [--only <substring>]");
  process.exit(2);
}

function parseArgs(argv) {
  const positional = [];
  let json = null;
  const only = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--json") {
      json = argv[i + 1];
      if (!json) usage("--json needs a file path");
      i += 1;
    } else if (argv[i] === "--only") {
      if (!argv[i + 1]) usage("--only needs a substring");
      only.push(argv[i + 1]);
      i += 1;
    } else {
      positional.push(argv[i]);
    }
  }
  if (positional.length !== 2) usage();
  return { dirA: positional[0], dirB: positional[1], json, only };
}

function digestRoot(dir) {
  const resolved = path.resolve(dir);
  if (!existsSync(resolved)) usage(`Not found: ${dir}`);
  const nested = path.join(resolved, "digest");
  return existsSync(nested) ? nested : resolved;
}

async function listDigests(root) {
  const files = new Map();
  for (const project of await readdir(root, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    for (const file of await readdir(path.join(root, project.name))) {
      if (file.endsWith(".json")) files.set(`${project.name}/${file.slice(0, -5)}`, path.join(root, project.name, file));
    }
  }
  return files;
}

/** Expand the elisions the capture applies: defaults and currentColor borders. */
function expand(digest, key) {
  const raw = digest.elements[key];
  if (!raw) return null;
  const value = { ...digest.defaults, ...raw };
  if (digest.borderColorFallback === "color") {
    for (const side of ["top", "right", "bottom", "left"]) {
      const prop = `border-${side}-color`;
      if (!(prop in raw)) value[prop] = raw.color;
    }
  }
  return value;
}

function compareDigests(a, b) {
  const keysA = Object.keys(a.elements);
  const keysB = Object.keys(b.elements);
  const setB = new Set(keysB);
  const setA = new Set(keysA);
  const onlyA = keysA.filter((key) => !setB.has(key));
  const onlyB = keysB.filter((key) => !setA.has(key));
  const differences = [];
  let differingElements = 0;
  for (const key of keysA) {
    if (!setB.has(key)) continue;
    const left = expand(a, key);
    const right = expand(b, key);
    const props = new Set([...Object.keys(left), ...Object.keys(right)]);
    let differs = false;
    for (const prop of props) {
      const va = left[prop] ?? ABSENT;
      const vb = right[prop] ?? ABSENT;
      if (va !== vb) {
        differs = true;
        differences.push({ element: key, property: prop, a: va, b: vb });
      }
    }
    if (differs) differingElements += 1;
  }
  return { differingElements, differences, onlyA, onlyB };
}

async function main() {
  const { dirA, dirB, json, only } = parseArgs(process.argv.slice(2));
  const rootA = digestRoot(dirA);
  const rootB = digestRoot(dirB);
  const filesA = await listDigests(rootA);
  const filesB = await listDigests(rootB);
  const captures = [...new Set([...filesA.keys(), ...filesB.keys()])]
    .filter((capture) => only.length === 0 || only.some((part) => capture.includes(part)))
    .sort();

  const report = { a: rootA, b: rootB, totals: { captures: captures.length, differingCaptures: 0, differingElements: 0, differences: 0, onlyInA: 0, onlyInB: 0, missingCaptures: 0 }, captures: [] };

  for (const capture of captures) {
    const [project, slug] = capture.split("/");
    const fileA = filesA.get(capture);
    const fileB = filesB.get(capture);
    if (!fileA || !fileB) {
      report.totals.missingCaptures += 1;
      report.totals.differingCaptures += 1;
      report.captures.push({ project, slug, missing: fileA ? "b" : "a" });
      console.log(`✗ ${slug} @ ${project}: capture only in ${fileA ? "A" : "B"}`);
      continue;
    }
    const a = JSON.parse(await readFile(fileA, "utf8"));
    const b = JSON.parse(await readFile(fileB, "utf8"));
    const result = compareDigests(a, b);
    const changed = result.differingElements + result.onlyA.length + result.onlyB.length;
    report.totals.differingElements += result.differingElements;
    report.totals.differences += result.differences.length;
    report.totals.onlyInA += result.onlyA.length;
    report.totals.onlyInB += result.onlyB.length;
    if (changed) report.totals.differingCaptures += 1;
    report.captures.push({
      project,
      slug,
      elementsA: Object.keys(a.elements).length,
      elementsB: Object.keys(b.elements).length,
      differingElements: result.differingElements,
      differences: result.differences,
      onlyInA: result.onlyA,
      onlyInB: result.onlyB,
    });
    if (!changed) {
      console.log(`✓ ${slug} @ ${project}: identical (${Object.keys(a.elements).length} elements)`);
      continue;
    }
    console.log(
      `✗ ${slug} @ ${project}: ${result.differingElements} differing elements, ${result.differences.length} property differences, ${result.onlyA.length} only in A, ${result.onlyB.length} only in B`,
    );
    for (const difference of result.differences.slice(0, 10)) {
      console.log(`    ${difference.element}  ${difference.property}: ${difference.a} → ${difference.b}`);
    }
    for (const key of result.onlyA.slice(0, 5)) console.log(`    only in A: ${key}`);
    if (result.onlyA.length > 5) console.log(`    … ${result.onlyA.length - 5} more only in A`);
    for (const key of result.onlyB.slice(0, 5)) console.log(`    only in B: ${key}`);
    if (result.onlyB.length > 5) console.log(`    … ${result.onlyB.length - 5} more only in B`);
  }

  const t = report.totals;
  console.log(
    `\n${t.captures} captures compared: ${t.differingCaptures} differ, ${t.differingElements} differing elements, ${t.differences} property differences, ${t.onlyInA} elements only in A, ${t.onlyInB} only in B, ${t.missingCaptures} captures missing on one side.`,
  );
  if (json) {
    await writeFile(path.resolve(json), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`JSON report: ${path.resolve(json)}`);
  }
  process.exit(t.differingCaptures > 0 ? 1 : 0);
}

await main();
