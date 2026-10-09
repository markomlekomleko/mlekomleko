import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { translate, toCyrillic } from "../../app/lib/i18n/translate";
import { languageTags, localizedPath, type Locale } from "../../app/lib/i18n/routing";

const languages: Locale[] = ["sr-latn", "sr-cyrl", "en", "ru"];
test.beforeEach(async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ "cf-connecting-ip": `2001:db8:${crypto.randomUUID().replaceAll("-", "").match(/.{1,4}/g)!.slice(0, 6).join(":")}` });
  await page.addInitScript(() => localStorage.setItem("mleko-i-mleko-analytics-consent", JSON.stringify({ necessary: true, analytics: false, marketing: false })));
});

test("four languages render on the server with reciprocal SEO links and protected admin routes", async ({ request, baseURL }) => {
  for (const locale of languages) {
    for (const path of ["/", "/prodavnica", "/proizvodi/sveze-kravlje-mleko-1l", "/dostava", "/faq"]) {
      const response = await request.get(localizedPath(path, locale));
      expect(response.status()).toBe(200);
      const html = await response.text();
      expect(html).toContain(`<html lang="${languageTags[locale]}"`);
      expect(html).toContain(`rel="canonical" href="${baseURL}${localizedPath(path, locale) === "/" ? "" : localizedPath(path, locale)}"`);
      for (const target of languages) expect(html).toContain(`hrefLang="${languageTags[target]}"`);
      expect(html).toContain('hrefLang="x-default"');
      expect(html).toContain('property="og:image"');
      if (path === "/") expect(html).toContain(({ "sr-latn": "Jutro počinje ovde.", "sr-cyrl": "Јутро почиње овде.", en: "Your morning starts here.", ru: "Утро начинается здесь." })[locale]);
    }
  }
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const prefix of ["/en", "/ru", "/sr-cyrl"]) expect(sitemap).toContain(`${prefix}/prodavnica</loc>`);
  const spoof = await request.get("/admin", { headers: { "x-store-locale": "ru" } });
  expect(await spoof.text()).toContain('<html lang="sr-Latn"');
  for (const path of ["/ru/admin", "/en/api/storefront", "/sr-latn/prodavnica"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(response.headers().location).not.toMatch(/\/(ru|en|sr-latn)\//);
  }
});

test("switching language preserves the page, query and basket on every viewport", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/prodavnica?source=language-test#top");
  await page.locator(".configurator-actions button").first().click();
  await expect(page.locator(".drawer-item")).toHaveCount(1);
  await page.keyboard.press("Escape");
  for (const [locale, label] of [["en", "English"], ["ru", "Русский"], ["sr-cyrl", "Српски · ћирилица"], ["sr-latn", "Srpski · latinica"]] as const) {
    await page.locator(".language-switcher summary").click();
    await page.locator(".language-switcher").getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${localizedPath("/prodavnica", locale)}\\?source=language-test#top$`));
    await expect(page.locator("html")).toHaveAttribute("lang", languageTags[locale]);
    await expect(page.locator(".cart-count")).toHaveText("2");
    await expect(page.locator(".configurator-actions button").first()).toContainText(translate("Dodaj u korpu", locale));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const brand = await page.locator(".nav-shell > .brand").boundingBox();
    const actions = await page.locator(".header-actions").boundingBox();
    expect(brand!.x + brand!.width).toBeLessThanOrEqual(actions!.x);
    await page.locator(".cart-link").click();
    await expect(page.locator(".cart-drawer-foot .button")).toHaveAttribute("href", localizedPath("/checkout", locale));
    await page.keyboard.press("Escape");
  }
  expect(errors).toEqual([]);
});

for (const locale of ["sr-cyrl", "en", "ru"] as const) test(`${locale}: purchase, calendar and email sign-in retain the language and commerce values`, async ({ page }) => {
  test.setTimeout(90_000);
  const t = (text: string) => translate(text, locale);
  const email = `i18n-${locale}-${crypto.randomUUID()}@example.test`;
  await page.goto(localizedPath("/prodavnica", locale));
  const card = page.locator(".configurator").first();
  await card.getByRole("button", { name: t("Redovna dostava"), exact: true }).click();
  await card.locator(".configurator-actions button").click();
  await page.locator(".cart-drawer-foot .button").click();
  await expect(page).toHaveURL(new RegExp(`${locale}/checkout$`));
  for (const [name, value] of Object.entries({ fullName: "Mila Test", email, phone: "0601234567", street: "Test 12", city: "Beograd", postalCode: "11000" })) await page.locator(`input[name="${name}"]`).fill(value);
  await page.getByRole("radio", { name: t("Petak"), exact: true }).check();
  await page.locator(".calendar-trigger").click();
  const calendar = page.locator("#delivery-calendar");
  await expect(calendar).toHaveAccessibleName(t("Kalendar dostave"));
  await calendar.getByRole("button", { name: t("Sledeći mesec") }).click();
  await calendar.locator(".calendar-grid button:not(:disabled)").first().click();
  await page.locator('input[type="checkbox"][required]').check();
  const result = page.waitForResponse(response => response.url().endsWith("/api/checkout") && response.request().method() === "POST");
  await page.getByRole("button", { name: t("Potvrdi porudžbinu"), exact: true }).click();
  const response = await result;
  expect(response.status(), await response.text()).toBe(201);
  const order = await response.json();
  expect(new Date(order.order.deliveryDate + "T12:00:00Z").getUTCDay()).toBe(5);
  expect(response.request().postDataJSON().items[0].purchaseType).toBe("subscription");
  expect(response.request().postDataJSON().customer.city).toBe("Beograd");
  await expect(page.getByRole("heading", { name: t("Hvala na porudžbini.") })).toBeVisible();
  await page.goto(localizedPath("/prijava", locale));
  await page.getByRole("button", { name: t("Napravi nalog"), exact: true }).click();
  await page.getByLabel(t("Email adresa")).fill(email);
  await page.getByRole("button", { name: t("Napravi nalog i pošalji kod") }).click();
  const code = page.getByTestId("local-auth-code").locator("strong");
  await expect(code).toHaveText(/^\d{6}$/);
  const actualCode = (await code.textContent())!;
  await page.getByLabel(t("Šestocifreni kod")).fill(actualCode === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: t("Potvrdi kod"), exact: true }).click();
  await expect(page.locator('form [role="alert"]')).toHaveText(t("Kod nije ispravan, istekao je ili je već iskorišćen. Zatražite novi kod."));
  await page.getByLabel(t("Šestocifreni kod")).fill(actualCode);
  await page.getByRole("button", { name: t("Potvrdi kod"), exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${locale}/nalog$`));
  await expect(page.locator("html")).toHaveAttribute("lang", languageTags[locale]);
  await expect(page.getByRole("heading", { name: `${t("Zdravo,")} Mila Test.` })).toBeVisible();
  const resultAxe = await new AxeBuilder({ page }).analyze();
  expect(resultAxe.violations.filter(v => ["serious", "critical"].includes(v.impact!))).toEqual([]);
});

test("announcement has one editable localized message, with optional link, and admin remains Latin", async ({ page, request, baseURL }) => {
  const login = await request.post("/api/admin/access", { headers: { Origin: baseURL! }, data: { email: "admin@example.test", password: "e2e-admin-password" } });
  const headers = { Origin: baseURL!, Authorization: `Bearer ${(await login.json()).sessionToken}` };
  const original = (await (await request.get("/api/storefront")).json()).settings;
  const keys = ["announcementEnabled", "announcementText", "announcementTextEn", "announcementTextRu", "announcementTextSrCyrl", "announcementUrl"];
  try {
    const saved = await request.patch("/api/admin/settings", { headers, data: { announcementEnabled: true, announcementText: "Sveže mleko", announcementTextEn: "Fresh milk", announcementTextRu: "Свежее молоко", announcementTextSrCyrl: "", announcementUrl: "" } });
    expect(saved.ok()).toBe(true);
    for (const locale of languages) {
      await page.goto(localizedPath("/prodavnica", locale));
      const bar = page.locator(".announcement-bar");
      await expect(bar.locator(":scope > *")).toHaveCount(1);
      await expect(bar.locator("a")).toHaveCount(0);
      await expect(bar).toHaveText(({ "sr-latn": "Sveže mleko", "sr-cyrl": "Свеже млеко", en: "Fresh milk", ru: "Свежее молоко" })[locale]);
    }
    expect((await request.patch("/api/admin/settings", { headers, data: { announcementUrl: "/prodavnica" } })).ok()).toBe(true);
    await page.reload();
    await expect(page.locator(".announcement-bar > a")).toHaveAttribute("href", "/ru/prodavnica");
    expect((await request.patch("/api/admin/settings", { headers, data: { announcementText: "", announcementTextEn: "", announcementTextRu: "", announcementTextSrCyrl: "" } })).ok()).toBe(true);
    await page.reload();
    await expect(page.locator(".announcement-bar")).toHaveCount(0);
    await page.goto("/ru/admin");
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "sr-Latn");
    await expect(page.getByRole("button", { name: "Prijavi se", exact: true })).toBeVisible();
    await expect(page.locator(".language-switcher")).toHaveCount(0);
  } finally {
    expect((await request.patch("/api/admin/settings", { headers, data: Object.fromEntries(keys.map(key => [key, original[key] ?? ""])) })).ok()).toBe(true);
  }
});

// Interface translation must not change commerce values or destinations.
test("translations preserve dynamic values, external URLs, APIs and assets", () => {
  expect(toCyrillic("Čaša, sveže, džem, Ljubav, NJIVA, Email: test@example.com — Mleko i Mleko")).toBe("Чаша, свеже, џем, Љубав, ЊИВА, Имејл: test@example.com — Mleko i Mleko");
  expect(translate("Novi kod za 30 s", "en")).toBe("New code in 30 s");
  for (const locale of languages) {
    expect(translate("Mila Test, Test 12, order_123", locale)).toBe("Mila Test, Test 12, order_123");
    for (const path of ["/api/checkout", "/admin", "/images/milk.jpg", "https://example.com/en", "#dostava", "mailto:test@example.com"]) expect(localizedPath(path, locale)).toBe(path);
    expect(localizedPath(localizedPath("/prodavnica?sort=price#top", locale), locale)).toBe(localizedPath("/prodavnica?sort=price#top", locale));
  }
});
