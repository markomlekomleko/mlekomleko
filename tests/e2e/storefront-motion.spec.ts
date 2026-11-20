import { expect, test, type Page } from "@playwright/test";
import { cyr } from "./cyr";

// The home hero is a seven-slide slider (final spec, 19 Nov 2026): full-screen photographs that slide in from the
// right every three seconds, a headline, one line of copy and the slide's action(s), arrows, and a segmented
// progress bar whose own animation is the timer. These specs replace the old scroll-scrubbed hero video ones.

async function hideConsent(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem(
      "mleko-i-mleko-analytics-consent",
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    ),
  );
}

/** Index (0-based) of the slide the progress bar marks as current. */
const activeIndex = (page: Page) =>
  page.locator(".hero-progress button").evaluateAll(buttons => buttons.findIndex(button => button.getAttribute("aria-current") === "true"));

const SLIDES = 7;

test("reduced motion keeps the first slide still: no autoplay, no video, call to action in place", async ({ page }) => {
  await hideConsent(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const videoRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(".mp4") || request.url().includes("/media/hero/")) videoRequests.push(request.url());
  });
  await page.goto("/", { waitUntil: "networkidle" });
  const first = page.locator(".hero-slide").first().locator(".hero-slide-image");
  await expect(first).toBeVisible();
  await expect(first).toHaveJSProperty("complete", true);
  await expect(page.locator(".hero-slider video")).toHaveCount(0);
  await expect(page.locator(".hero-progress-fill")).toHaveCSS("animation-name", "none");
  // Autoplay is three seconds per slide; wait well past that and the slider must not have moved.
  await page.waitForTimeout(4500);
  expect(await activeIndex(page)).toBe(0);
  expect(videoRequests).toEqual([]);
  await expect(page.locator(".hero-cta")).toBeInViewport({ ratio: 1 });
  // A person can still move through the slides by hand.
  await page.getByRole("button", { name: cyr("Slajd 3") }).click();
  expect(await activeIndex(page)).toBe(2);
});

test("the hero advances by itself every three seconds and loops forward past the last slide", async ({ page }) => {
  test.setTimeout(60_000);
  await hideConsent(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator(".hero-slide")).toHaveCount(SLIDES + 1); // the extra one is a copy of the first, so the loop only moves forward
  await expect(page.locator(".hero-progress button")).toHaveCount(SLIDES);
  expect(await activeIndex(page)).toBe(0);
  await expect(page.locator(".hero-slide[data-active] .hero-slide-title")).toHaveText(cyr("Mleko koje znaš."));
  // Autoplay: the active segment's fill animation lasts 3 s and its end advances the slider.
  await expect(page.locator(".hero-slider")).toHaveCSS("--hero-autoplay", "3000ms");
  await expect.poll(() => activeIndex(page), { timeout: 8_000 }).toBe(1);
  await expect(page.locator(".hero-slide[data-active] .hero-slide-title")).toHaveText(cyr("Natoči sebi pravo mleko."));
  // Only the current slide is reachable by keyboard and assistive technology.
  await expect(page.locator(".hero-slide[inert]")).toHaveCount(SLIDES);

  // Jump to the last slide and let it run out: it slides on to the copy of the first, then snaps to the real first slide.
  await page.getByRole("button", { name: cyr("Slajd 7") }).click();
  expect(await activeIndex(page)).toBe(SLIDES - 1);
  await expect(page.locator(".hero-slide[data-active] .hero-slide-title")).toContainText(cyr("Vi najbolje pričate o nama."));
  // Focus holds the timer (by design), and a click leaves the segment focused: release it so autoplay resumes.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(page.locator(".hero-slider")).not.toHaveAttribute("data-hold");
  await expect.poll(() => activeIndex(page), { timeout: 8_000 }).toBe(0);
});

test("arrows, progress segments and keyboard focus steer the slider", async ({ page }) => {
  test.skip(page.viewportSize()!.width < 768, "The arrows are hidden below 768px; phones swipe instead");
  await hideConsent(page);
  await page.goto("/", { waitUntil: "networkidle" });
  const next = page.getByRole("button", { name: cyr("Sledeći slajd") });
  const previous = page.getByRole("button", { name: cyr("Prethodni slajd") });
  // Keyboard focus holds the slider: the timer (the fill animation) stops while the arrow is focused.
  await next.focus();
  await expect(page.locator(".hero-slider")).toHaveAttribute("data-hold", "");
  await expect(page.locator(".hero-progress-fill")).toHaveCSS("animation-play-state", "paused");
  await next.click();
  expect(await activeIndex(page)).toBe(1);
  await next.click();
  expect(await activeIndex(page)).toBe(2);
  await previous.click();
  expect(await activeIndex(page)).toBe(1);
  await page.getByRole("button", { name: cyr("Slajd 5") }).click();
  expect(await activeIndex(page)).toBe(4);
  await expect(page.locator(".hero-slide[data-active] .hero-slide-title")).toHaveText(cyr("Znaš od koga piješ."));
  // Going back from the first slide lands on the last one.
  await page.getByRole("button", { name: cyr("Slajd 1") }).click();
  await previous.click();
  await expect.poll(() => activeIndex(page)).toBe(SLIDES - 1);
});

test("the first slide is one headline, one line of copy and one centred call to action under the header", async ({ page }) => {
  await hideConsent(page);
  await page.emulateMedia({ reducedMotion: "reduce" }); // keep slide 1 in place while it is measured
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator(".hero-slider h1")).toBeAttached();
  const slide = page.locator(".hero-slide[data-active]");
  await expect(slide.locator(".hero-slide-title")).toHaveText(cyr("Mleko koje znaš."));
  await expect(slide.locator(".hero-slide-lead")).toHaveCount(1);
  await expect(slide.locator(".hero-slide-action")).toHaveCount(1);
  await expect(page.locator(".hero-cta")).toHaveAttribute("href", "/prodavnica");
  await expect(page.locator(".hero-cta")).toBeInViewport({ ratio: 1 });
  const geometry = await page.evaluate(() => {
    const hero = document.querySelector(".hero-slider")!.getBoundingClientRect();
    const cta = document.querySelector(".hero-cta")!.getBoundingClientRect();
    const header = document.querySelector("[data-hero-header]")!.getBoundingClientRect();
    return { top: hero.top, headerBottom: header.bottom, ctaX: cta.x + cta.width / 2 };
  });
  // The slider starts right where the sticky header ends and its action is centred horizontally.
  expect(geometry.top).toBeCloseTo(geometry.headerBottom, 0);
  expect(geometry.ctaX).toBeCloseTo(page.viewportSize()!.width / 2, 0);
});

test("the purchase-type slide offers both choices and each opens the shop with that type selected", async ({ page }) => {
  await hideConsent(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  for (const [label, type] of [["Pretplata", "pretplata"], ["Jednokratno", "jednokratno"]] as const) {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: cyr("Slajd 3") }).click();
    expect(await activeIndex(page)).toBe(2);
    const slide = page.locator(".hero-slide[data-active]");
    await expect(slide.locator(".hero-slide-action")).toHaveCount(2);
    const action = slide.getByRole("link", { name: new RegExp(cyr(label)) });
    await expect(action).toHaveAttribute("href", `/prodavnica?tip=${type}`);
    await action.click();
    await expect(page).toHaveURL(new RegExp(`/prodavnica\\?tip=${type}$`));
    const card = page.locator(".configurator:not(.goat-waitlist)").first();
    await expect(card.getByRole("button", { name: cyr(type === "pretplata" ? "Pretplata" : "Jednokratna kupovina") })).toHaveAttribute("aria-pressed", "true");
  }
});

test("a failed hero photograph still leaves a readable slide and a working call to action", async ({ page }) => {
  await hideConsent(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/images/hero/**", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await expect(page.locator(".hero-slide[data-active] .hero-slide-title")).toBeVisible();
  await expect(page.locator(".hero-cta")).toBeVisible();
  await page.locator(".hero-cta").click();
  await expect(page).toHaveURL(/\/prodavnica$/);
  await expect(page.locator(".configurator").first()).toBeVisible();
});
