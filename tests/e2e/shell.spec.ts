import { expect, test, type Page } from "@playwright/test";

// The same stored decision the "Samo neophodno" button writes (production-readiness
// acceptNecessary), set before the first load so the banner never covers the shell.
async function acceptNecessary(page: Page) {
  await page.addInitScript(() =>
    window.localStorage.setItem(
      "mleko-i-mleko-analytics-consent",
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    ),
  );
}

// The marquee pauses under the pointer, so motion checks park it away from the ticker.
async function parkPointer(page: Page) {
  const viewport = page.viewportSize()!;
  await page.mouse.move(Math.round(viewport.width / 2), viewport.height - 4);
}

async function measureStack(page: Page) {
  return page.evaluate(() => {
    const stack = document.querySelector<HTMLElement>(".site-header-stack")!;
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;top:0;left:0;width:1px;height:var(--header-stack);visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);
    const token = probe.getBoundingClientRect().height;
    probe.remove();
    return { token, rendered: stack.offsetHeight, bottom: stack.getBoundingClientRect().bottom };
  });
}

test("--header-stack equals the rendered ticker and header", async ({ page }) => {
  await acceptNecessary(page);
  for (const path of ["/", "/prodavnica"]) {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    const { token, rendered } = await measureStack(page);
    expect(Math.abs(token - rendered), `${path}: token ${token}px, stack ${rendered}px`).toBeLessThanOrEqual(1);
  }
});

test("an anchor jump leaves the offer title below the sticky header", async ({ page }) => {
  await acceptNecessary(page);
  await page.goto("/#izaberite-mleko");
  const title = page.locator("#offer-title");
  await expect(title).toBeInViewport();
  await expect
    .poll(async () => {
      const { bottom } = await measureStack(page);
      const top = await title.evaluate((node) => node.getBoundingClientRect().top);
      return Math.round(top - bottom);
    })
    .toBeGreaterThanOrEqual(0);
});

test("the ticker scrolls by default and stands still with reduced motion", async ({ page }) => {
  await acceptNecessary(page);
  await page.goto("/");
  await parkPointer(page);
  const rail = page.locator(".ticker-bar .marquee-rail");
  await expect(rail).toHaveCSS("animation-name", "marquee-x");
  await expect(rail).toHaveCSS("animation-play-state", "running");
  const start = await rail.evaluate((node) => node.getBoundingClientRect().left);
  await expect.poll(() => rail.evaluate((node) => node.getBoundingClientRect().left)).toBeLessThan(start);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(rail).toHaveCSS("animation-name", "none");
  // Nothing moves, so the pause control is not offered.
  await expect(page.locator(".motion-toggle")).toBeHidden();
});

test("the motion toggle pauses the ticker and remembers the choice", async ({ page }) => {
  await acceptNecessary(page);
  await page.goto("/");
  await parkPointer(page);
  const rail = page.locator(".ticker-bar .marquee-rail");
  const toggle = page.locator(".motion-toggle");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toHaveAccessibleName("Zaustavi animacije");

  // A click that lands before hydration is lost; retry until the button answers.
  await expect(async () => {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
  }).toPass();
  await expect(toggle).toHaveAccessibleName("Zaustavi animacije");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "paused");
  await expect(rail).toHaveCSS("animation-play-state", "paused");

  await page.reload();
  await parkPointer(page);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(rail).toHaveCSS("animation-play-state", "paused");

  await toggle.click();
  await parkPointer(page);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("html")).not.toHaveAttribute("data-motion");
  await expect(rail).toHaveCSS("animation-play-state", "running");
  expect(await page.evaluate(() => window.localStorage.getItem("mleko-i-mleko-motion"))).toBeNull();
});

test("the pinned announcement is a keyboard stop that does not move", async ({ page }) => {
  await acceptNecessary(page);
  await page.goto("/");
  const pin = page.locator(".ticker-bar .ticker-pin");
  test.skip((await pin.count()) === 0, "The announcement is switched off in settings");
  expect(await pin.evaluate((node) => node.closest(".marquee") === null)).toBe(true);

  await page.locator(".motion-toggle").focus();
  await page.keyboard.press("Tab");
  await expect(pin).toBeFocused();
  // White ring on teal: the default black one would only reach 3.8:1 there.
  await expect(pin).toHaveCSS("outline-style", "solid");
  await expect(pin).toHaveCSS("outline-color", "rgb(255, 255, 255)");

  const before = await pin.boundingBox();
  await page.waitForTimeout(800);
  expect(await pin.boundingBox()).toEqual(before);
});

test("Escape closes the mobile menu and returns focus to Meni", async ({ page }) => {
  test.skip(page.viewportSize()!.width > 860, "The menu button only exists up to 860px");
  await acceptNecessary(page);
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Meni" });
  await expect(async () => {
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
  }).toPass();
  await expect(page.getByRole("navigation", { name: "Glavna navigacija" }).getByRole("link", { name: "Mleko", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();
});

test("the footer wordmark fits its container without overflow", async ({ page }) => {
  await acceptNecessary(page);
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const wordmark = page.locator(".footer-wordmark");
  await wordmark.scrollIntoViewIfNeeded();
  const fit = await wordmark.evaluate((node) => ({ scroll: node.scrollWidth, client: node.clientWidth }));
  expect(fit.scroll).toBeLessThanOrEqual(fit.client);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
