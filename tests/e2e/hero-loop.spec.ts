import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

// Which hero is live, read from the manifest source the same way tests/hero-media.test.mjs
// reads it. These specs cover the ambient loop only; the scroll scrub has its own in
// storefront-motion.spec.ts.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const heroKind =
  /^\s*kind:\s*"([a-z]+)",\s*$/m.exec(readFileSync(path.join(root, "app/lib/hero-media.ts"), "utf8"))?.[1] ?? null;

test.skip(heroKind !== "loop", "The hero media is not an ambient loop");

async function hideConsent(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem(
      "mleko-i-mleko-analytics-consent",
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    ),
  );
}

const currentTime = (page: Page) =>
  page.locator(".scene-video").evaluate((video: HTMLVideoElement) => video.currentTime);
const isPaused = (page: Page) => page.locator(".scene-video").evaluate((video: HTMLVideoElement) => video.paused);

test("the loop plays by itself, muted", async ({ page }) => {
  await hideConsent(page);
  await page.goto("/");
  const hero = page.locator(".hero");
  await expect(hero).toHaveAttribute("data-kind", "loop");
  await expect(hero).toHaveAttribute("data-mode", "loop");
  await expect(hero).toHaveAttribute("data-video", "ready", { timeout: 20_000 });
  expect(await page.locator(".scene-video").evaluate((video: HTMLVideoElement) => video.muted)).toBe(true);
  const start = await currentTime(page);
  await expect.poll(() => currentTime(page), { timeout: 5_000 }).toBeGreaterThan(start);
});

test("the loop pauses off screen and resumes when the hero is back", async ({ page }) => {
  await hideConsent(page);
  await page.goto("/");
  await expect(page.locator(".hero")).toHaveAttribute("data-video", "ready", { timeout: 20_000 });
  await expect.poll(() => isPaused(page)).toBe(false);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => isPaused(page)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => isPaused(page)).toBe(false);
});

test("reduced motion keeps the still frame and requests no clip", async ({ page }) => {
  await hideConsent(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const videoRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/media/hero/") && request.url().endsWith(".mp4")) videoRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator(".scene-poster img")).toBeVisible();
  await page.waitForTimeout(1200);
  expect(videoRequests).toEqual([]);
  await expect(page.locator(".hero")).toHaveAttribute("data-mode", "static");
  await expect(page.locator(".scene-video")).toHaveCount(0);
  await expect(page.locator(".hero-loop-toggle")).toHaveCount(0);
});

test("the pause button stops and restarts the loop", async ({ page }) => {
  await hideConsent(page);
  await page.goto("/");
  await expect(page.locator(".hero")).toHaveAttribute("data-video", "ready", { timeout: 20_000 });
  const toggle = page.locator(".hero-loop-toggle");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Zaustavi video" }).click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveAccessibleName("Pusti video");
  await expect.poll(() => isPaused(page)).toBe(true);
  const stopped = await currentTime(page);
  await page.waitForTimeout(600);
  expect(await currentTime(page)).toBe(stopped);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => isPaused(page)).toBe(false);
});
