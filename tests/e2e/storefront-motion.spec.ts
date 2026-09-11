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
  await page.goto("/");
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

test("scrolling drives the hero video and always reaches the final frame", async ({ page }) => {
  test.skip(page.viewportSize()!.width <= 760, "Desktop scroll scene");
  await hideConsent(page);
  await page.goto("/");
  await expect(page.locator(".hero")).toHaveAttribute("data-video", "ready", { timeout: 20_000 });
  const geometry = await page.evaluate(() => {
    const track = document.querySelector(".scene-track")!.getBoundingClientRect();
    const pin = document.querySelector(".scene-pin")!.getBoundingClientRect();
    return { top: track.top + window.scrollY, travel: track.height - pin.height };
  });
  expect(geometry.travel).toBeGreaterThan(200);

  const sample = async (fraction: number) => {
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(geometry.top + geometry.travel * fraction));
    await page.waitForTimeout(900);
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

test("a failed hero export still leaves a usable poster and a working offer link", async ({ page }) => {
  await hideConsent(page);
  await page.route("**/media/hero/**", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/");
  await page.waitForTimeout(1500);
  await expect(page.locator(".hero")).toHaveAttribute("data-mode", "static");
  await page.locator(".scene-actions .button").click();
  await expect(page.locator("#offer-title")).toBeInViewport();
});
