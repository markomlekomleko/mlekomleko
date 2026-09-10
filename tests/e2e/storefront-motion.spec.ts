import { expect, test } from "@playwright/test";

async function hideConsent(page: import("@playwright/test").Page) {
  await page.addInitScript(() => localStorage.setItem("mleko-i-mleko-analytics-consent", JSON.stringify({ necessary: true, analytics: false, marketing: false })));
}

test("reduced motion keeps the rendered bottle and avoids the 3D download", async ({ page }) => {
  await hideConsent(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const modelRequests: string[] = [];
  page.on("request", (request) => { if (request.url().endsWith(".glb")) modelRequests.push(request.url()); });
  await page.goto("/");
  await expect(page.locator("#glavni-sadrzaj .milk-scene-poster img")).toBeVisible();
  await expect(page.locator("#glavni-sadrzaj .milk-scene-poster img")).toHaveJSProperty("complete", true);
  await page.waitForTimeout(1000);
  expect(modelRequests).toEqual([]);
  await expect(page.locator("#glavni-sadrzaj .milk-scene canvas")).toHaveCount(0);
  await expect(page.locator("#glavni-sadrzaj .conversion-actions .button")).toBeVisible();
});

test("desktop Blender scene loads, pauses and falls back when motion is disabled", async ({ page, browserName }) => {
  test.skip(page.viewportSize()!.width <= 760 || browserName !== "chromium", "Desktop WebGL enhancement");
  await hideConsent(page);
  await page.goto("/");
  await expect(page.locator("#glavni-sadrzaj .milk-scene")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  const pause = page.getByRole("button", { name: "Pauziraj animaciju" });
  await pause.click();
  await expect(page.getByRole("button", { name: "Pokreni animaciju" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Okreni flaše udesno" }).click();
  await expect(page.locator("#glavni-sadrzaj .milk-scene")).toHaveAttribute("data-ready", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("#glavni-sadrzaj .milk-scene canvas")).toHaveCount(0);
  await expect(page.locator("#glavni-sadrzaj .milk-scene-poster")).toHaveCSS("opacity", "1");
});

test("a failed model download leaves a usable product poster and purchase link", async ({ page }) => {
  await hideConsent(page);
  await page.route("**/models/milk-bottles.glb", (route) => route.abort());
  await page.goto("/");
  await page.waitForTimeout(1200);
  await expect(page.locator("#glavni-sadrzaj .milk-scene-poster")).toHaveCSS("opacity", "1");
  await page.locator("#glavni-sadrzaj .conversion-actions .button").click();
  await expect(page).toHaveURL(/\/prodavnica$/);
});
