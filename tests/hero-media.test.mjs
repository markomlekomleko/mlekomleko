import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The hero must never point at a file that returns 404, and the web exports must stay
 * inside the budgets in docs/OPUS-REDIZAJN-PLAN.md section 10.
 */
async function heroManifestPaths() {
  const source = await readFile(path.join(root, "app/lib/hero-media.ts"), "utf8");
  if (/export const heroMedia: HeroMedia \| null = null/.test(source)) return [];
  return [...source.matchAll(/"(\/media\/hero\/[^"]+)"/g)].map((match) => match[1]);
}

test("every hero media path in the manifest exists in public/", async () => {
  const paths = await heroManifestPaths();
  assert.ok(paths.length > 0, "manifest should list media or be explicitly null");
  for (const publicPath of paths) {
    const file = path.join(root, "public", publicPath.replace(/^\//, ""));
    const info = await stat(file).catch(() => null);
    assert.ok(info?.isFile(), `missing hero media file: ${publicPath}`);
    assert.ok(info.size > 0, `empty hero media file: ${publicPath}`);
  }
});

test("hero web exports stay inside the performance budgets", async () => {
  const budgets = {
    "hero-desktop.mp4": 5 * 1024 * 1024,
    "hero-mobile.mp4": 2.5 * 1024 * 1024,
    "poster-desktop.webp": 250 * 1024,
    "poster-mobile.webp": 150 * 1024,
  };
  for (const [name, limit] of Object.entries(budgets)) {
    const file = path.join(root, "public/media/hero", name);
    const info = await stat(file).catch(() => null);
    if (!info) continue;
    assert.ok(info.size <= limit, `${name} is ${info.size} bytes, budget is ${limit}`);
  }
});

test("the manifest records whether the hero material is temporary or final", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "public/media/hero/manifest.json"), "utf8"));
  assert.ok(["temporary", "final"].includes(manifest.status));
  const source = await readFile(path.join(root, "app/lib/hero-media.ts"), "utf8");
  assert.ok(
    source.includes(`status: "${manifest.status}"`),
    "app/lib/hero-media.ts and public/media/hero/manifest.json disagree about the media status",
  );
});
