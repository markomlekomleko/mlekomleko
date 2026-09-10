import { expect, test, type Page } from "@playwright/test";

async function openAdmin(page: Page) {
  await page.goto("/admin");
  const consent = page.getByRole("button", { name: "Samo neophodno" });
  if (await consent.isVisible()) await consent.click();
  await page.getByLabel("Email", { exact: true }).fill("admin@example.test");
  await page.getByLabel("Lozinka", { exact: true }).fill("e2e-admin-password");
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page.locator(".status-dot")).toHaveText("● Povezano");

}

async function adminTab(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Administracija" }).getByRole("button", { name, exact: true }).click();
  await expect(page.locator(".admin-topbar h1")).toHaveText(name);
}

async function assertNoDevelopmentLabels(page: Page) {
  await expect(page.locator("body")).not.toContainText(/\bdemo\b|демо|mockup/i);
  const fields = await page.locator("input, textarea").evaluateAll((elements) => elements.map((element) => (element as HTMLInputElement).value));
  expect(fields.join(" ")).not.toMatch(/\bdemo\b|демо|mockup/i);
}

test("every public destination and admin tab is connected without development labels", async ({ page }) => {
  test.setTimeout(90_000);
  for (const path of ["/", "/prodavnica", "/farme", "/o-nama", "/kako-funkcionise", "/dostava", "/gde-kupiti", "/faq", "/kontakt", "/korpa", "/checkout", "/prijava", "/nalog", "/uslovi-kupovine", "/pravila-pretplate", "/privatnost", "/reklamacije"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await assertNoDevelopmentLabels(page);
  }
  await openAdmin(page);
  for (const name of ["Pregled", "Zarada", "Porudžbine", "Proizvodi", "Paketi", "Kupci", "Pretplate", "Dostave", "Popusti", "Sadržaj sajta", "Podešavanja"]) {
    await adminTab(page, name);
    await assertNoDevelopmentLabels(page);
    await expect(page.locator(".notice.error")).toHaveCount(0);
  }
  await expect(page.getByRole("checkbox", { name: /demo/i })).toHaveCount(0);
});

test("admin product, promo and content edits persist and reach the storefront", async ({ page }) => {
  test.setTimeout(90_000);
  const suffix = crypto.randomUUID().slice(0, 8);
  const name = `Proizvod ${suffix}`;
  const slug = `proizvod-${suffix}`;
  await openAdmin(page);
  await adminTab(page, "Proizvodi");
  await page.getByRole("button", { name: "＋ Dodaj proizvod", exact: true }).click();
  const editor = page.locator(".admin-editor");
  await editor.getByLabel("Naziv", { exact: true }).fill(name);
  await editor.getByLabel("URL slug").fill(slug);
  await editor.getByLabel("Jednokratna cena (RSD)", { exact: true }).fill("350");
  await editor.getByLabel("Cena redovne dostave (RSD)", { exact: true }).fill("300");
  await editor.getByRole("button", { name: "Sačuvaj proizvod" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Proizvod je dodat." })).toBeVisible();
  const article = page.locator(".product-admin-list article").filter({ hasText: name });
  await article.getByRole("button", { name: "Izmeni", exact: true }).click();
  await editor.getByLabel("Jednokratna cena (RSD)", { exact: true }).fill("375");
  await editor.getByRole("button", { name: "Sačuvaj proizvod" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Proizvod je sačuvan." })).toBeVisible();
  const product = await page.request.get(`/api/products/${slug}`);
  expect(product.ok()).toBe(true);
  expect((await product.json()).product.priceMinor).toBe(37500);
  await article.getByRole("button", { name: "Sakrij", exact: true }).click();
  await expect(article.getByText("Sakriven", { exact: true })).toBeVisible();
  expect((await page.request.get(`/api/products/${slug}`)).status()).toBe(404);
  await article.getByRole("button", { name: "Objavi", exact: true }).click();
  await expect(article.getByText("Objavljen", { exact: true })).toBeVisible();
  expect((await page.request.get(`/api/products/${slug}`)).status()).toBe(200);
  page.once("dialog", (dialog) => dialog.accept());
  await article.getByRole("button", { name: "Obriši", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Proizvod je obrisan." })).toBeVisible();
  await expect(article).toHaveCount(0);

  await adminTab(page, "Popusti");
  const promo = `KOD${suffix.toUpperCase()}`;
  await page.getByLabel("Kod", { exact: true }).fill(promo);
  await page.getByLabel("Vrednost", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Dodaj kod" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Promo kod je dodat." })).toBeVisible();
  const quote = await page.request.post("/api/cart", { data: { promoCode: promo, items: [{ productId: "prod_kravlje_1l", quantity: 2, purchaseType: "one_time" }] } });
  expect(quote.ok()).toBe(true);
  expect((await quote.json()).discountMinor).toBeGreaterThan(0);
  const promoRow = page.locator(".promo-list article").filter({ hasText: promo });
  page.once("dialog", (dialog) => dialog.accept());
  await promoRow.getByRole("button", { name: "Obriši" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Promo kod je obrisan." })).toBeVisible();

  await adminTab(page, "Sadržaj sajta");
  const title = page.getByLabel("Naziv prodavnice", { exact: true });
  const previousName = await title.inputValue();
  await title.fill(`Mleko ${suffix}`);
  await page.getByRole("button", { name: "Sačuvaj sadržaj", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Podešavanja su sačuvana" })).toBeVisible();
  const storefront = await page.request.get("/api/storefront");
  expect((await storefront.json()).settings.storeName).toBe(`Mleko ${suffix}`);
  await title.fill(previousName);
  await page.getByRole("button", { name: "Sačuvaj sadržaj", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Podešavanja su sačuvana" })).toBeVisible();
  await page.getByRole("button", { name: "Odjavi se", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Prijava u administraciju" })).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem("mleko-i-mleko-admin-secret"))).toBeNull();
});

test("mobile add button immediately offers checkout and keeps the selected quantity", async ({ page }) => {
  test.skip(page.viewportSize()!.width > 560, "Mobile purchase bar only");
  await page.goto("/proizvodi/sveze-kravlje-mleko-1l");
  const consent = page.getByRole("button", { name: "Samo neophodno" });
  if (await consent.isVisible()) await consent.click();
  await page.getByRole("button", { name: "4 L", exact: true }).click();
  await page.locator(".mobile-buy-bar").getByRole("button", { name: "Dodaj u korpu", exact: true }).click();
  const proceed = page.locator(".mobile-buy-bar").getByRole("link", { name: "Nastavi na kupovinu →" });
  await expect(proceed).toBeInViewport();
  await page.screenshot({ path: "test-results/mobile-added-to-cart.png" });
  await proceed.click();
  await expect(page.getByRole("spinbutton", { name: "Količina za Domaće kravlje mleko" })).toHaveValue("4");
  await page.reload();
  await expect(page.getByRole("spinbutton", { name: "Količina za Domaće kravlje mleko" })).toHaveValue("4");
});
