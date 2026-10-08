import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  collectCls,
  collectDigest,
  collectMarquee,
  collectPageMetrics,
  freezeAnimations,
  settleImages,
  type ClsReport,
  type DigestPayload,
  type MarqueeReport,
} from "./probes";

/**
 * Visual capture tool: screenshots, computed-style digest and design metrics.
 *
 *   VISUAL_OUT=output/qa/<run>/<label> [VISUAL_PARTS=shots,digest,metrics] npm run test:visual
 *
 * Determinism measures (the digest of two runs against the same build must match):
 * - every capture starts in a fresh browser context (no cache, storage or hover carry-over);
 * - the consent banner is dismissed with "Samo neophodno", then the pointer is parked
 *   outside the viewport so no element keeps a :hover style;
 * - the freeze stylesheet disables transitions, pauses animations and hides the caret;
 *   time-based animations are then finished (finite) or parked on frame 0 (infinite);
 * - smooth scrolling is forced off so programmatic scrolls land immediately;
 * - lazy images are switched to eager and awaited, fonts are awaited, and the page is
 *   back at scroll 0 before the digest is read;
 * - the pre-digest sequence is identical whatever VISUAL_PARTS says, so a digest-only
 *   rerun follows the same path as a full run.
 */

const OUT = process.env.VISUAL_OUT;
if (!OUT) throw new Error("VISUAL_OUT is required, e.g. VISUAL_OUT=output/qa/redesign-jm/baseline/dev");
const OUT_DIR = path.resolve(OUT);
const PARTS = new Set(
  (process.env.VISUAL_PARTS ?? "shots,digest,metrics")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean),
);
const SHOTS = PARTS.has("shots");
const DIGEST = PARTS.has("digest");
const METRICS = PARTS.has("metrics");

const FREEZE_CSS = [
  "*,*::before,*::after{transition:none!important;animation-play-state:paused!important;caret-color:transparent!important}",
  // Smooth scrolling would make programmatic scrolls land late; it is not part of the digest.
  "html{scroll-behavior:auto!important}",
  // The Next dev indicator only exists in dev; hiding it keeps dev and prod shots comparable.
  "nextjs-portal{display:none!important}",
].join("\n");

const HOME_SECTIONS = [
  ".site-header-stack",
  ".hero",
  ".marquee--band",
  "#izaberite-mleko",
  ".steps",
  ".origin",
  ".rhythm",
  ".faq",
  ".closing",
  ".site-footer",
];

const FALLBACK_PRODUCT = "sveze-kravlje-mleko-1l";

type RouteDef = { slug: string; path: string | "product" };

const ROUTES: RouteDef[] = [
  { slug: "home", path: "/" },
  { slug: "prodavnica", path: "/prodavnica" },
  { slug: "proizvod", path: "product" },
  { slug: "korpa", path: "/korpa" },
  { slug: "checkout", path: "/checkout" },
  { slug: "nalog", path: "/nalog" },
  { slug: "prijava", path: "/prijava" },
  { slug: "farme", path: "/farme" },
  { slug: "o-nama", path: "/o-nama" },
  { slug: "kako-funkcionise", path: "/kako-funkcionise" },
  { slug: "gde-kupiti", path: "/gde-kupiti" },
  { slug: "kontakt", path: "/kontakt" },
  { slug: "faq", path: "/faq" },
  { slug: "dostava-mleka-beograd", path: "/dostava-mleka/beograd" },
  { slug: "dostava-mleka-novi-sad", path: "/dostava-mleka/novi-sad" },
  { slug: "dostava", path: "/dostava" },
  { slug: "uslovi-kupovine", path: "/uslovi-kupovine" },
  { slug: "privatnost", path: "/privatnost" },
  { slug: "reklamacije", path: "/reklamacije" },
  { slug: "pravila-pretplate", path: "/pravila-pretplate" },
  { slug: "404", path: "/ovo-ne-postoji" },
  { slug: "admin", path: "/admin" },
];

const HERO_STEPS = [0, 25, 50, 75, 100];

// ---------------------------------------------------------------------------
// Output helpers

async function writeJson(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function projectDir(testInfo: TestInfo, ...parts: string[]) {
  return path.join(OUT_DIR, testInfo.project.name, ...parts);
}

async function writeDigest(page: Page, testInfo: TestInfo, name: string, meta: Record<string, unknown>) {
  if (!DIGEST) return;
  const digest: DigestPayload = await page.evaluate(collectDigest);
  const file = path.join(OUT_DIR, "digest", testInfo.project.name, `${name}.json`);
  await mkdir(path.dirname(file), { recursive: true });
  // One element per line keeps the files greppable and diffable with plain tools.
  const lines = Object.entries(digest.elements).map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`);
  const body = [
    "{",
    `"meta":${JSON.stringify({ ...meta, project: testInfo.project.name, viewport: page.viewportSize(), elementCount: lines.length })},`,
    `"defaults":${JSON.stringify(digest.defaults)},`,
    `"borderColorFallback":${JSON.stringify(digest.borderColorFallback)},`,
    `"elements":{`,
    lines.join(",\n"),
    "}",
    "}",
  ].join("\n");
  await writeFile(file, `${body}\n`);
}

type ProjectMetrics = {
  project: string;
  viewport: { width: number; height: number } | null;
  routes: Record<string, unknown>;
  states: Record<string, unknown>;
};

/** Read-modify-write so a crashed worker never loses earlier routes (workers: 1). */
async function updateMetrics(testInfo: TestInfo, page: Page, mutate: (metrics: ProjectMetrics) => void) {
  const file = projectDir(testInfo, "metrics.json");
  const current = (await readJson<ProjectMetrics>(file)) ?? {
    project: testInfo.project.name,
    viewport: page.viewportSize(),
    routes: {},
    states: {},
  };
  mutate(current);
  await writeJson(file, current);
  const merged: Record<string, ProjectMetrics> = {};
  for (const entry of await readdir(OUT_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "digest") continue;
    const projectMetrics = await readJson<ProjectMetrics>(path.join(OUT_DIR, entry.name, "metrics.json"));
    if (projectMetrics) merged[entry.name] = projectMetrics;
  }
  await writeJson(path.join(OUT_DIR, "metrics.json"), { generatedAt: new Date().toISOString(), projects: merged });
}

async function recordMetrics(testInfo: TestInfo, page: Page, kind: "routes" | "states", key: string, data: unknown) {
  await updateMetrics(testInfo, page, (metrics) => {
    metrics[kind][key] = data;
  });
}

// ---------------------------------------------------------------------------
// Page preparation

async function parkPointer(page: Page) {
  // Outside the viewport: nothing under the pointer, so no :hover styles leak in.
  await page.mouse.move(-10, -10);
}

async function acceptConsent(page: Page) {
  const button = page.getByRole("button", { name: "Samo neophodno" });
  if (!(await button.isVisible().catch(() => false))) return;
  await button.click();
  const hidden = await button
    .waitFor({ state: "hidden", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!hidden) {
    // Clicked before hydration: fall back to the production-readiness approach.
    await page.evaluate(() =>
      window.localStorage.setItem(
        "mleko-i-mleko-analytics-consent",
        JSON.stringify({ necessary: true, analytics: false, marketing: false }),
      ),
    );
    await page.reload({ waitUntil: "load" });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  }
}

async function scrollToY(page: Page, y: number) {
  await page.evaluate((top) => window.scrollTo({ top, left: 0, behavior: "instant" }), y);
}

async function waitFrames(page: Page) {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

type HeroState = { mode: string | null; video: string | null; settled: boolean };

/** Freeze, wait for media and fonts, and return to the top. Same steps for every part set. */
async function settle(page: Page, options: { hero: boolean }): Promise<HeroState | null> {
  await page.addStyleTag({ content: FREEZE_CSS });
  await page.evaluate(freezeAnimations);
  await page.evaluate(settleImages, 10_000);
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  let hero: HeroState | null = null;
  if (options.hero) {
    const settled = await page
      .waitForFunction(() => Boolean(document.querySelector('.hero[data-video="ready"], .hero[data-mode="static"]')), null, {
        timeout: 8_000,
      })
      .then(() => true)
      .catch(() => false);
    hero = await page.evaluate((ok) => {
      const element = document.querySelector(".hero");
      return { mode: element?.getAttribute("data-mode") ?? null, video: element?.getAttribute("data-video") ?? null, settled: ok };
    }, settled);
  }
  await page.waitForTimeout(400);
  await scrollToY(page, 0);
  await page.evaluate(freezeAnimations);
  await waitFrames(page);
  return hero;
}

type Opened = {
  status: number | null;
  finalUrl: string;
  title: string;
  cls: ClsReport | null;
  marquee: MarqueeReport;
  hero: HeroState | null;
};

/** Navigate and prepare a page for capture. */
async function openPage(page: Page, url: string, options: { home: boolean }): Promise<Opened> {
  const response = await page.goto(url, { waitUntil: "load" });
  // CLS is read before any interaction so the consent click cannot mask shifts.
  const cls = options.home ? await page.evaluate(collectCls, 3_000) : null;
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  await acceptConsent(page);
  await parkPointer(page);
  // Marquee state under default motion, before the freeze stylesheet pauses everything.
  const marquee = await page.evaluate(collectMarquee);
  const hero = await settle(page, { hero: options.home });
  return {
    status: response?.status() ?? null,
    finalUrl: new URL(page.url()).pathname,
    title: await page.title(),
    cls,
    marquee,
    hero,
  };
}

async function axeBlocking(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  const blocking = result.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  return {
    count: blocking.reduce((sum, violation) => sum + violation.nodes.length, 0),
    ids: blocking.map((violation) => violation.id),
    violations: blocking.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      count: violation.nodes.length,
      targets: violation.nodes.slice(0, 5).map((node) => node.target.join(" ")),
    })),
  };
}

async function viewportShot(page: Page, file: string) {
  await mkdir(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: false });
}

async function fullShot(page: Page, file: string) {
  await mkdir(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true });
}

async function sectionShot(page: Page, testInfo: TestInfo, selector: string, name: string) {
  const locator = page.locator(selector).first();
  if (!(await locator.count())) return false;
  const box = await locator.boundingBox();
  if (!box || box.width < 1 || box.height < 1) return false;
  const file = projectDir(testInfo, "sections", `${name}.png`);
  await mkdir(path.dirname(file), { recursive: true });
  await locator.screenshot({ path: file });
  return true;
}

function sectionName(selector: string) {
  return selector.replace(/^[.#]/, "");
}

async function resolveProductPath(page: Page) {
  const response = await page.request.get("/prodavnica");
  const html = await response.text();
  const match = /href="\/proizvodi\/([^"#?/]+)"/.exec(html);
  return `/proizvodi/${match ? match[1] : FALLBACK_PRODUCT}`;
}

// ---------------------------------------------------------------------------
// Captures

test.describe.configure({ mode: "default" });
test.setTimeout(180_000);

for (const route of ROUTES) {
  test(`route ${route.slug}`, async ({ page }, testInfo) => {
    const url = route.path === "product" ? await resolveProductPath(page) : route.path;
    const home = route.slug === "home";
    const opened = await openPage(page, url, { home });

    await writeDigest(page, testInfo, route.slug, { route: url, finalUrl: opened.finalUrl, status: opened.status });

    const metrics: Record<string, unknown> = {
      route: url,
      finalUrl: opened.finalUrl,
      status: opened.status,
      title: opened.title,
    };
    if (METRICS) Object.assign(metrics, await page.evaluate(collectPageMetrics));

    if (SHOTS) {
      await viewportShot(page, projectDir(testInfo, "pages", `${route.slug}--fold.png`));
      await fullShot(page, projectDir(testInfo, "pages", `${route.slug}.png`));
      if (home) {
        const sections: Record<string, boolean> = {};
        for (const selector of HOME_SECTIONS) sections[selector] = await sectionShot(page, testInfo, selector, sectionName(selector));
        metrics.sectionShots = sections;
      }
    }

    if (METRICS) {
      metrics.axe = await axeBlocking(page);
      if (home) {
        metrics.cls = opened.cls;
        metrics.hero = opened.hero;
        // Reduced motion flips the hero into its static mode, so this runs last. The
        // freeze stylesheet is switched off first so the site's own play state is read.
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.evaluate(() => {
          for (const style of Array.from(document.querySelectorAll("style"))) {
            if (style.textContent?.includes("caret-color:transparent")) style.disabled = true;
          }
        });
        metrics.marquee = { defaultMotion: opened.marquee, reducedMotion: await page.evaluate(collectMarquee) };
        await page.emulateMedia({ reducedMotion: "no-preference" });
      }
      await recordMetrics(testInfo, page, "routes", url, { slug: route.slug, ...metrics });
    }
  });
}

test("state menu-open", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-1440", "The menu button only exists below the desktop breakpoint");
  await openPage(page, "/", { home: true });
  const menu = page.getByRole("button", { name: "Meni" });
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await parkPointer(page);
  await page.evaluate(freezeAnimations);
  await page.waitForTimeout(400);
  await page.evaluate(freezeAnimations);
  await waitFrames(page);
  await writeDigest(page, testInfo, "state--menu-open", { state: "menu-open", route: "/" });
  const metrics: Record<string, unknown> = { state: "menu-open", route: "/" };
  if (METRICS) Object.assign(metrics, await page.evaluate(collectPageMetrics));
  if (SHOTS) await viewportShot(page, projectDir(testInfo, "states", "menu-open.png"));
  if (METRICS) {
    metrics.axe = await axeBlocking(page);
    await recordMetrics(testInfo, page, "states", "menu-open", metrics);
  }
});

test("state cart-drawer and korpa-item", async ({ page }, testInfo) => {
  await openPage(page, "/", { home: true });
  const card = page.locator(".configurator").first();
  await card.getByRole("button", { name: "4 L", exact: true }).click();
  await card.locator(".configurator-actions button", { hasText: "Dodaj u korpu" }).click();
  await expect(page.locator(".cart-drawer")).toHaveAttribute("data-open", "true");
  await expect(page.locator(".drawer-item")).toHaveCount(1);
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  await parkPointer(page);
  await page.evaluate(freezeAnimations);
  await page.evaluate(settleImages, 10_000);
  await page.waitForTimeout(400);
  await page.evaluate(freezeAnimations);
  await waitFrames(page);

  await writeDigest(page, testInfo, "state--cart-drawer", { state: "cart-drawer", route: "/" });
  const drawerMetrics: Record<string, unknown> = { state: "cart-drawer", route: "/" };
  if (METRICS) Object.assign(drawerMetrics, await page.evaluate(collectPageMetrics));
  if (SHOTS) {
    await viewportShot(page, projectDir(testInfo, "states", "cart-drawer.png"));
    drawerMetrics.sectionShot = await sectionShot(page, testInfo, ".cart-drawer", "cart-drawer");
  }
  if (METRICS) {
    drawerMetrics.axe = await axeBlocking(page);
    await recordMetrics(testInfo, page, "states", "cart-drawer", drawerMetrics);
  }

  const opened = await openPage(page, "/korpa", { home: false });
  await expect(page.locator("main")).toContainText("Domaće kravlje mleko");
  await writeDigest(page, testInfo, "state--korpa-item", { state: "korpa-item", route: "/korpa", finalUrl: opened.finalUrl });
  const cartMetrics: Record<string, unknown> = { state: "korpa-item", route: "/korpa", finalUrl: opened.finalUrl };
  if (METRICS) Object.assign(cartMetrics, await page.evaluate(collectPageMetrics));
  if (SHOTS) {
    await viewportShot(page, projectDir(testInfo, "states", "korpa-item--fold.png"));
    await fullShot(page, projectDir(testInfo, "states", "korpa-item.png"));
  }
  if (METRICS) {
    cartMetrics.axe = await axeBlocking(page);
    await recordMetrics(testInfo, page, "states", "korpa-item", cartMetrics);
  }
});

test("state hero-scroll", async ({ page }, testInfo) => {
  const opened = await openPage(page, "/", { home: true });
  // Same geometry as tests/e2e/storefront-motion.spec.ts: progress is the scroll
  // position inside .scene-track over the travel left once the pinned stage fits.
  const geometry = await page.evaluate(() => {
    const track = document.querySelector(".scene-track")?.getBoundingClientRect();
    const pin = document.querySelector(".scene-pin")?.getBoundingClientRect();
    if (!track || !pin) return null;
    return { top: track.top + window.scrollY, travel: track.height - pin.height };
  });
  const samples: Array<{ step: number; y: number; progress: number | null; time: number | null }> = [];
  let duration: number | null = null;
  for (const step of HERO_STEPS) {
    const y = geometry ? Math.round(geometry.top + Math.max(0, geometry.travel) * (step / 100)) : 0;
    await scrollToY(page, y);
    await page.waitForTimeout(600);
    await page.evaluate(freezeAnimations);
    await waitFrames(page);
    const sample = await page.evaluate(() => {
      const hero = document.querySelector(".hero");
      const video = document.querySelector<HTMLVideoElement>(".scene-video");
      const raw = hero ? getComputedStyle(hero).getPropertyValue("--hero-p").trim() : "";
      return {
        progress: raw === "" ? null : Number(raw),
        time: video ? video.currentTime : null,
        duration: video && Number.isFinite(video.duration) ? video.duration : null,
      };
    });
    duration = sample.duration ?? duration;
    samples.push({ step, y, progress: sample.progress, time: sample.time });
    const name = `hero-p${String(step).padStart(3, "0")}`;
    await writeDigest(page, testInfo, `state--${name}`, { state: name, route: "/", scrollY: y });
    if (SHOTS) await viewportShot(page, projectDir(testInfo, "states", `${name}.png`));
  }
  if (METRICS) {
    const times = samples.map((sample) => sample.time);
    const numeric = times.every((time): time is number => typeof time === "number");
    const heroScrub = {
      hero: opened.hero,
      geometry,
      duration,
      timeAt0: samples[0]?.time ?? null,
      timeAt100: samples[samples.length - 1]?.time ?? null,
      monotonic: numeric && times.every((time, index) => index === 0 || (time as number) > (times[index - 1] as number)),
      nonDecreasing: numeric && times.every((time, index) => index === 0 || (time as number) >= (times[index - 1] as number)),
      samples,
    };
    await updateMetrics(testInfo, page, (metrics) => {
      metrics.states["hero-scroll"] = heroScrub;
      const home = metrics.routes["/"] as Record<string, unknown> | undefined;
      if (home) home.heroScrub = heroScrub;
    });
  }
});
