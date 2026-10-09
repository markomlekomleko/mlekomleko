import { expect, test } from "@playwright/test";

test("continuous wheel input can leave the hero without a pause between gestures", async ({ page }) => {
  await page.goto("/");
  const hero = page.locator(".hero");
  await expect(hero).toHaveAttribute("data-video", "ready", { timeout: 20_000 });
  const pin = await page.locator(".scene-pin").boundingBox();
  if (!pin) throw new Error("Hero scene is missing");
  await page.mouse.move(pin.x + pin.width / 2, pin.y + pin.height / 2);
  // Keep events in the page so browser-driver round trips cannot introduce the
  // 180ms pause that previously released the scroll trap.
  await page.locator(".scene-pin").evaluate(element => new Promise<void>(resolve => {
    let count = 0;
    const timer = setInterval(() => {
      element.dispatchEvent(new WheelEvent("wheel", { deltaY: 20, bubbles: true, cancelable: true }));
      if (++count === 60) { clearInterval(timer); resolve(); }
    }, 40);
  }));
  await expect(hero).toHaveAttribute("data-step", "2");
  const belowHero = await page.evaluate(() => {
    const pin = document.querySelector(".scene-pin")!.getBoundingClientRect();
    const header = document.querySelector("[data-hero-header]")!.getBoundingClientRect();
    return pin.bottom <= header.bottom + 2;
  });
  expect(belowHero).toBe(true);
});

test("a video network failure releases the pinned hero and keeps navigation usable", async ({ page }) => {
  await page.route("**/media/hero/*.mp4", route => route.abort());
  await page.goto("/");
  await expect(page.locator(".hero")).toHaveAttribute("data-mode", "static");
  await expect(page.locator(".scene-video")).toHaveCount(0);
  await expect(page.locator(".scene-poster img")).toBeVisible();
  await page.locator(".scene-actions .button").click();
  await expect(page.locator("#offer-title")).toBeInViewport();
});
