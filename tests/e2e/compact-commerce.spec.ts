import { expect, test } from "@playwright/test";

async function acceptNecessary(page: import("@playwright/test").Page) {
  const consent = page.getByRole("button", { name: "Samo neophodno" });
  if (await consent.isVisible()) await consent.click();
}

test("the product page reaches price and purchase controls without a long scroll", async ({ page }) => {
  const width = page.viewportSize()!.width;
  await page.setViewportSize({ width, height: width >= 1000 ? 720 : 844 });
  await page.goto("/proizvodi/sveze-kravlje-mleko-1l");
  await acceptNecessary(page);

  const photograph = page.locator(".product-detail-media > img").first();
  const image = await photograph.boundingBox();
  expect(image!.y).toBeGreaterThan(0);
  expect(image!.height).toBeLessThan(page.viewportSize()!.height * 0.75);

  // Price and the add button are within one short scroll of the top.
  const price = await page.locator(".configurator-price strong").first().boundingBox();
  expect(price!.y).toBeLessThan(page.viewportSize()!.height * 1.6);

  const add = page.locator(".configurator-actions button", { hasText: "Dodaj u korpu" }).first();
  await expect(add).toBeEnabled();
  await add.click();

  await expect(page.locator(".cart-drawer")).toHaveAttribute("data-open", "false");
  await expect(page.locator(".cart-count")).toHaveText("2");
  await expect(page.locator(".cart-link svg")).toBeVisible();
  await page.getByRole("button", { name: "Korpa, 2 jedinica", exact: true }).click();
  await expect(page.locator(".cart-drawer")).toHaveAttribute("data-open", "true");
  await expect(page.locator(".drawer-item")).toHaveCount(1);
  await expect(page.locator(".cart-drawer-foot .button")).toHaveAttribute("href", "/checkout");

  await page.keyboard.press("Escape");
  await page.goto("/korpa");
  await expect(page.locator(".cart-item:visible")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Nastavi na podatke za dostavu →" })).toHaveAttribute(
    "href",
    "/checkout",
  );
  const cartTotal = await page.locator(".cart-summary .summary-total > span").last().innerText();
  await page.getByRole("link", { name: "Nastavi na podatke za dostavu →" }).click();
  await expect(page.locator(".checkout-price-preview strong")).toHaveText(cartTotal);
  await expect(page.locator(".checkout-price-preview")).toBeInViewport();
  await expect(page.getByLabel("Grad", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Poštanski broj", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Potvrdi porudžbinu" })).toBeDisabled();
  await expect(page.locator(".cart-summary .delivery-summary")).toHaveCount(0);
  const nameInput = await page.getByLabel("Ime i prezime").boundingBox();
  expect(nameInput!.height).toBeLessThanOrEqual(46);
  expect(nameInput!.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByLabel("Napomena za dostavu (opciono)")).toBeHidden();
  await page.locator(".checkout-extra-fields summary").click();
  await page.getByLabel("Napomena za dostavu (opciono)").fill("Pozovi pre dolaska.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("the shop offers every active product with its own buying controls", async ({ page }) => {
  await page.goto("/prodavnica");
  await acceptNecessary(page);
  const cards = page.locator(".configurator");
  await expect(cards).toHaveCount(2);
  for (const card of await cards.all()) {
    await expect(card.locator(".configurator-price strong")).toBeVisible();
    await expect(card.getByRole("button", { name: "Jednokratno" })).toBeVisible();
    await expect(card.locator(".configurator-actions button", { hasText: "Dodaj u korpu" })).toBeEnabled();
    // The photograph must never push the price out of easy reach, whether it sits on
    // top of the card or in the portrait column beside the controls.
    const photo = (await card.locator(".configurator-media").boundingBox())!;
    const price = (await card.locator(".configurator-price").boundingBox())!;
    expect(price.y - photo.y).toBeLessThanOrEqual(page.viewportSize()!.height * 0.75);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
});
