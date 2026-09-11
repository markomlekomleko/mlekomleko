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

test("the mobile buy bar appears below the panel and keeps the selected quantity", async ({ page }) => {
  test.skip(page.viewportSize()!.width > 560, "Mobile purchase bar only");
  await page.goto("/proizvodi/sveze-kravlje-mleko-1l");
  const consent = page.getByRole("button", { name: "Samo neophodno" });
  if (await consent.isVisible()) await consent.click();
  const card = page.locator(".configurator").first();
  await card.getByRole("button", { name: "4 L", exact: true }).click();

  // The bar stays hidden while the real purchase button is still on screen.
  await expect(page.locator('.buy-bar[data-visible="true"]')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const bar = page.locator(".buy-bar");
  await expect(bar).toHaveAttribute("data-visible", "true");
  await expect(bar).toContainText("4 L");
  await expect(bar).toContainText("1.000");
  await page.screenshot({ path: "test-results/mobile-buy-bar.png" });

  await bar.getByRole("button", { name: "Dodaj u korpu" }).click();
  await expect(page.locator(".cart-drawer")).toHaveAttribute("data-open", "true");
  await page.locator(".cart-drawer").getByRole("link", { name: "Otvori celu korpu" }).click();
  await expect(page.getByRole("spinbutton", { name: "Količina za Domaće kravlje mleko" })).toHaveValue("4");
  await page.reload();
  await expect(page.getByRole("spinbutton", { name: "Količina za Domaće kravlje mleko" })).toHaveValue("4");
});

test("catalog editors preserve decimal prices, report duplicates and switch bundle contents", async ({ page }) => {
  test.setTimeout(90_000);
  const suffix = crypto.randomUUID().slice(0, 8);
  await openAdmin(page);
  await adminTab(page, "Proizvodi");
  await page.getByRole("button", { name: "＋ Dodaj proizvod", exact: true }).click();
  const editor = page.locator(".admin-editor");
  const name = `Decimalni ${suffix}`;
  const slug = `decimalni-${suffix}`;
  await editor.getByLabel("Naziv", { exact: true }).fill(name);
  await editor.getByLabel("URL slug").fill(slug);
  await editor.getByLabel("Jednokratna cena (RSD)", { exact: true }).fill("350.55");
  await editor.getByLabel("Ambalaža po komadu (RSD)").fill("5.25");
  await editor.getByRole("button", { name: "Sačuvaj proizvod" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Proizvod je dodat." })).toBeVisible();
  const product = (await (await page.request.get(`/api/products/${slug}`)).json()).product;
  expect(product.priceMinor).toBe(35055);
  expect(product.subscriptionPriceMinor).toBe(35055);

  await page.getByRole("button", { name: "＋ Dodaj proizvod", exact: true }).click();
  await editor.getByLabel("Naziv", { exact: true }).fill(`Duplikat ${suffix}`);
  await editor.getByLabel("URL slug").fill(slug);
  await editor.getByRole("button", { name: "Sačuvaj proizvod" }).click();
  await expect(page.locator(".admin-main .notice.error")).toContainText("ovim URL slugom već postoji");
  await expect(editor.getByLabel("Naziv", { exact: true })).toHaveValue(`Duplikat ${suffix}`);

  await adminTab(page, "Paketi");
  const names = [`Prvi ${suffix}`, `Drugi ${suffix}`];
  for (const [index, bundleName] of names.entries()) {
    await page.getByRole("button", { name: "＋ Novi paket" }).click();
    await editor.getByLabel("Naziv", { exact: true }).fill(bundleName);
    await editor.getByLabel("Slug", { exact: true }).fill(`paket-${suffix}-${index}`);
    await editor.getByLabel("Proizvod 1", { exact: true }).selectOption(product.id);
    await editor.getByLabel("Količina 1").fill(String(index + 2));
    await editor.getByRole("button", { name: "Sačuvaj paket" }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.locator(".bundle-admin-list article").filter({ hasText: bundleName })).toBeVisible();
  }
  const first = page.locator(".bundle-admin-list article").filter({ hasText: names[0] });
  const second = page.locator(".bundle-admin-list article").filter({ hasText: names[1] });
  await first.getByRole("button", { name: "Izmeni" }).click();
  await expect(editor.getByLabel("Količina 1")).toHaveValue("2");
  await second.getByRole("button", { name: "Izmeni" }).click();
  await expect(editor.getByLabel("Naziv", { exact: true })).toHaveValue(names[1]);
  await expect(editor.getByLabel("Količina 1")).toHaveValue("3");
  await editor.getByLabel("Količina 1").fill("4");
  await editor.getByRole("button", { name: "Sačuvaj paket" }).click();
  await expect(second).toContainText(`4× ${name}`);
  await page.getByRole("button", { name: "＋ Novi paket" }).click();
  await expect(editor.getByLabel("Naziv", { exact: true })).toHaveValue("");
  await expect(editor.getByLabel("Količina 1")).toHaveValue("1");
  await editor.getByRole("button", { name: "Odustani" }).click();

  await adminTab(page, "Proizvodi");
  const article = page.locator(".product-admin-list article").filter({ hasText: name });
  page.once("dialog", dialog => dialog.accept());
  await article.getByRole("button", { name: "Obriši", exact: true }).click();
  await expect(article.getByText("Sakriven", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "arhiviran" })).toBeVisible();
  await adminTab(page, "Paketi");
  for (const bundleName of names) {
    const bundle = page.locator(".bundle-admin-list article").filter({ hasText: bundleName });
    page.once("dialog", dialog => dialog.accept());
    await bundle.getByRole("button", { name: "Obriši" }).click();
    await expect(bundle).toHaveCount(0);
  }
  await adminTab(page, "Proizvodi");
  page.once("dialog", dialog => dialog.accept());
  await article.getByRole("button", { name: "Obriši", exact: true }).click();
  await expect(article).toHaveCount(0);
});

test("order period and combined filters survive a status update and reset", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `filters-${crypto.randomUUID()}@example.test`;
  const response = await page.request.post("/api/checkout", {
    headers: { Origin: "http://localhost:4173", "Idempotency-Key": crypto.randomUUID() },
    data: { items: [{ productId: "prod_kravlje_1l", quantity: 2, purchaseType: "one_time" }], paymentMethod: "cash", customer: { email, fullName: "Filter Kupac", phone: "+381601234567", addressLine1: "Test 1", city: "Beograd", postalCode: "11000" } },
  });
  expect(response.ok()).toBe(true);
  const { order } = await response.json();
  await openAdmin(page);
  await adminTab(page, "Porudžbine");
  await page.getByLabel("Pretraga porudžbina").fill(email);
  await page.getByLabel("Period prema").selectOption("delivery");
  await page.getByLabel("Datum od", { exact: true }).fill(order.deliveryDate);
  await page.getByLabel("Datum do", { exact: true }).fill(order.deliveryDate);
  await page.getByLabel("Status naplate").selectOption("pending");
  await page.getByLabel("Način plaćanja").selectOption("cash");
  await page.getByLabel("Vrsta porudžbine").selectOption("one_time");
  await page.getByRole("button", { name: "Primeni filtere" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Pronađeno: 1 porudžbina" })).toBeVisible();
  const row = page.locator("tbody tr").filter({ hasText: email });
  await row.locator("select").first().selectOption("paid");
  await row.getByRole("button", { name: "Sačuvaj", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Pronađeno: 0 porudžbina" })).toBeVisible();
  await expect(page.getByLabel("Pretraga porudžbina")).toHaveValue(email);
  await page.getByLabel("Status naplate").selectOption("paid");
  await page.getByRole("button", { name: "Primeni filtere" }).click();
  await expect(row).toBeVisible();
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/order-filters-${page.viewportSize()!.width}.png`, fullPage: true });
  await page.getByLabel("Datum od", { exact: true }).fill("2099-12-31");
  await expect(page.locator(".order-filters .notice.error")).toContainText("Datum od ne može");
  await expect(page.getByRole("button", { name: "Primeni filtere" })).toBeDisabled();
  await page.getByRole("button", { name: "Poništi filtere" }).click();
  await expect(page.getByLabel("Datum od", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Pretraga porudžbina")).toHaveValue("");
  await expect(row).toBeVisible();
});
