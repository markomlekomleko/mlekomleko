import { expect, test } from "@playwright/test";

test("product photography and purchase action fit the initial viewport", async ({ page }) => {
  const width = page.viewportSize()!.width;
  await page.setViewportSize({ width, height: width >= 1000 ? 720 : 844 });
  await page.goto("/proizvodi/sveze-kravlje-mleko-1l");
  const consent = page.getByRole("button", { name: "Samo neophodno" });
  if (await consent.isVisible()) await consent.click();
  const photograph = page.locator(".product-detail-media > img:visible").first();
  const image = await photograph.boundingBox();
  expect(image!.y).toBeGreaterThan(0);
  expect(image!.y + image!.height).toBeLessThan(page.viewportSize()!.height);
  const button = width <= 760 ? page.locator(".mobile-buy-bar").getByRole("button", { name: "Dodaj u korpu", exact: true }) : page.locator(".purchase-summary > button:visible").first();
  await expect(button).toBeEnabled();
  const bounds = await button.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await button.click();
  await page.goto("/korpa");
  await expect(page.locator(".cart-item:visible")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Nastavi na podatke za dostavu →" })).toHaveAttribute("href", "/checkout");
  const cartItem = await page.locator(".cart-item:visible").boundingBox();
  expect(cartItem!.height).toBeLessThan(width >= 900 ? 240 : 530);
});

test("shop photography stays compact and fully contained", async ({ page }) => {
  await page.goto("/prodavnica");
  const photos = page.locator(".product-card .product-image:visible");
  await expect(photos).toHaveCount(2);
  for (const photo of await photos.all()) {
    const bounds = await photo.boundingBox();
    expect(bounds!.height).toBeLessThanOrEqual(361);
    await expect(photo.locator("img")).toHaveCSS("object-fit", "contain");
  }
});
