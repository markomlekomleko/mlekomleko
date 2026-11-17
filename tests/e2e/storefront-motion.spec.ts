import { expect, test } from "@playwright/test";

async function hideConsent(page: import("@playwright/test").Page) {
  await page.addInitScript(() =>
    localStorage.setItem(
      "mleko-i-mleko-analytics-consent",
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    ),
  );
}

test("reduced motion shows a static composition and downloads no hero video", async ({ page }) => {
  await hideConsent(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const videoRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/media/hero/") && request.url().endsWith(".mp4")) videoRequests.push(request.url());
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator(".scene-poster img")).toBeVisible();
  await expect(page.locator(".scene-poster img")).toHaveJSProperty("complete", true);
  await page.waitForTimeout(1200);
  expect(videoRequests).toEqual([]);
  await expect(page.locator(".hero")).toHaveAttribute("data-mode", "static");
  await expect(page.locator(".scene-video")).toHaveCount(0);
  // The document keeps its normal flow: no pinned scroll region is reserved.
  const reserved = await page.evaluate(() => {
    const track = document.querySelector(".scene-track")!.getBoundingClientRect().height;
    return track - window.innerHeight;
  });
  expect(reserved).toBeLessThan(0);
  await expect(page.locator(".scene-actions .button")).toBeVisible();
});

test("native scrolling advances both hero story steps and reaches the final frame", async ({ page }) => {
  await hideConsent(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator(".hero")).toHaveAttribute("data-video", "ready", { timeout: 20_000 });
  const geometry = await page.evaluate(() => {
    const track = document.querySelector(".scene-track")!.getBoundingClientRect();
    const pin = document.querySelector(".scene-pin")!.getBoundingClientRect();
    return { top: track.top + window.scrollY - pin.top, travel: track.height - pin.height, pinHeight: pin.height };
  });
  expect(geometry.travel).toBeGreaterThan(200);

  const sample = async (fraction: number) => {
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(geometry.top + geometry.travel * fraction + (fraction === 1 ? geometry.pinHeight * 0.5 : 0)));
    await expect.poll(() => page.locator(".hero").evaluate(element => Number(getComputedStyle(element).getPropertyValue("--hero-p")))).toBe(fraction === 0 ? 0 : fraction === 1 ? 1 : 0.65);
    if (fraction === 1) await expect.poll(() => page.locator(".scene-video").evaluate((video: HTMLVideoElement) => video.currentTime / video.duration), { timeout: 10000 }).toBeGreaterThan(0.98);
    else await page.waitForTimeout(1200);
    return page.evaluate(() => ({
      progress: Number(getComputedStyle(document.querySelector(".hero")!).getPropertyValue("--hero-p")),
      time: (document.querySelector(".scene-video") as HTMLVideoElement).currentTime,
    }));
  };

  const start = await sample(0);
  const middle = await sample(0.5);
  const end = await sample(1);
  expect(start.progress).toBeCloseTo(0, 1);
  expect(middle.time).toBeGreaterThan(start.time);
  expect(end.time).toBeGreaterThan(middle.time);
  expect(end.progress).toBeCloseTo(1, 1);

  // Scrubbing backwards returns to the opening frame instead of sticking.
  const back = await sample(0);
  expect(back.time).toBeLessThan(middle.time);
});

test("hero stays pinned, shows only the call to action and advances on the first scroll beneath the header", async ({ page }) => {
  await hideConsent(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator(".hero")).toHaveAttribute("data-video", "ready", { timeout: 20_000 });
  // The hero carries no copy any more (17 Nov 2026): a visually hidden h1 and one call to action.
  await expect(page.locator(".scene-actions a")).toHaveCount(1);
  await expect(page.locator(".hero-cta")).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".scene-rhythm, .scene-lead, .hero-eyebrow")).toHaveCount(0);
  const geometry = await page.evaluate(() => {
    const pin = document.querySelector(".scene-pin")!.getBoundingClientRect();
    const cta = document.querySelector(".hero-cta")!.getBoundingClientRect();
    const header = document.querySelector("[data-hero-header]")!.getBoundingClientRect();
    return {
      top: pin.top,
      ctaX: cta.x + cta.width / 2,
      headerBottom: header.bottom,
      time: (document.querySelector(".scene-video") as HTMLVideoElement).currentTime,
      travel: document.querySelector(".scene-track")!.getBoundingClientRect().height - pin.height,
    };
  });
  expect(geometry.top).toBeCloseTo(geometry.headerBottom, 0);
  expect(geometry.ctaX).toBeCloseTo(page.viewportSize()!.width / 2, 0);
  await page.evaluate(() => window.scrollTo({ top: 32, behavior: "instant" }));
  await expect.poll(() => page.locator(".scene-video").evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(geometry.time);
  const after = await page.evaluate(() => document.querySelector(".scene-pin")!.getBoundingClientRect().top);
  expect(after).toBeCloseTo(geometry.top, 0);
  await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), geometry.travel * 0.7);
  await expect.poll(() => page.locator(".hero").evaluate(element => Number(getComputedStyle(element).getPropertyValue("--hero-p")))).toBeGreaterThan(0.5);
});

test("a failed hero export still leaves a usable poster and a working offer link", async ({ page }) => {
  await hideConsent(page);
  await page.route("**/media/hero/**", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await expect(page.locator(".hero")).toHaveAttribute("data-mode", "static");
  await page.locator(".scene-actions .button").click();
  await expect(page.locator("#offer-title")).toBeInViewport();
});
