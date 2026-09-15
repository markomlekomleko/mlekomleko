import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function acceptNecessary(page: import("@playwright/test").Page) {
  const button = page.getByRole("button", { name: "Samo neophodno" });
  if (await button.isVisible().catch(() => false)) {
    await page.evaluate(() => window.localStorage.setItem("mleko-i-mleko-analytics-consent", JSON.stringify({ necessary: true, analytics: false, marketing: false })));
    await page.reload({ waitUntil: "domcontentloaded" });
  }
}

test("responsive navigation has no overflow and exposes every primary destination", async ({ page }, testInfo) => {
  await page.goto("/");
  await acceptNecessary(page);
  const viewport = page.viewportSize()!;
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  if (viewport.width < 861) {
    const menu = page.getByRole("button", { name: "Meni" });
    await expect(menu).toBeVisible();
    await page.waitForTimeout(300);
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    const nav = page.getByRole("navigation", { name: "Glavna navigacija" });
    for (const label of ["Mleko", "Kako dostavljamo", "Naše poreklo", "Česta pitanja", "Kontakt", "Moj nalog"]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
  } else {
    await expect(page.getByRole("navigation", { name: "Glavna navigacija" })).toBeVisible();
  }
  for (const path of ["/", "/prodavnica", "/checkout", "/privatnost"]) {
    await page.goto(path);
    await acceptNecessary(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${path} overflows at ${viewport.width}px`).toBe(true);
  }
  await testInfo.attach("viewport", { body: JSON.stringify(viewport), contentType: "application/json" });
});

test("mixed cart checkout, email registration and subscription mutation work", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `e2e-${crypto.randomUUID()}@example.test`;
  await page.goto("/prodavnica");
  await acceptNecessary(page);
  const cards = page.locator(".configurator");
  expect(await cards.count()).toBeGreaterThanOrEqual(2);
  await cards.nth(0).getByRole("button", { name: "Redovna dostava" }).click();
  await cards.nth(0).locator(".configurator-actions button", { hasText: "Dodaj u korpu" }).click();
  await expect(page.locator(".cart-drawer")).toHaveAttribute("data-open", "true");
  await page.keyboard.press("Escape");
  await cards.nth(1).getByRole("button", { name: "Jednokratno" }).click();
  await cards.nth(1).locator(".configurator-actions button", { hasText: "Dodaj u korpu" }).click();
  await expect(page.locator(".drawer-item")).toHaveCount(2);
  await page.locator(".cart-drawer").getByRole("link", { name: "Otvori celu korpu" }).click();
  await expect(page.getByText("Danas plaćate za ovaj mesec")).toBeVisible();
  await page.getByRole("link", { name: /Nastavi na podatke/ }).click();
  await page.getByLabel("Ime i prezime").fill("Fiktivni E2E Kupac");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByLabel("Broj telefona").fill("+381600000001");
  await page.getByLabel("Ulica i broj").fill("Test ulica 1");
  await page.getByLabel("Grad").fill("Beograd");
  await page.getByLabel("Poštanski broj").fill("11000");
  await page.locator('input[type="checkbox"][required]').check();
  await page.getByRole("button", { name: "Potvrdi porudžbinu" }).click();
  await expect(page.getByRole("heading", { name: "Hvala na porudžbini." })).toBeVisible();

  await page.goto("/prijava");
  await page.getByRole("button", { name: "Napravi nalog", exact: true }).click();
  await page.getByLabel("Email adresa").fill(email);
  await page.getByLabel("Lozinka", { exact: true }).fill("e2e-customer-password");
  const challengeResponse = page.waitForResponse(response => response.url().endsWith("/api/auth/register") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Napravi nalog i pošalji kod" }).click();
  const challenge = await (await challengeResponse).json();
  await page.getByLabel("Šestocifreni kod").fill(challenge.localDevelopment.code);
  await page.getByRole("button", { name: "Potvrdi kod", exact: true }).click();
  await expect(page).toHaveURL(/\/nalog$/);
  expect(await page.evaluate(() => window.localStorage.getItem("mleko-i-mleko-session"))).toBeNull();
  expect(await page.evaluate(() => document.cookie)).not.toContain("mm_session");
  const replay = await page.request.post("/api/auth/code/verify", { headers: { origin: new URL(page.url()).origin }, data: { challengeId: challenge.challengeId, code: challenge.localDevelopment.code } });
  expect(replay.status()).toBe(401);
  await expect(page.getByRole("heading", { name: /Zdravo, Fiktivni E2E Kupac/ })).toBeVisible();
  await page.getByText("Moje porudžbine", { exact: false }).filter({ has: page.locator("span") }).click();
  await expect(page.locator(".account-orders > li")).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText(/demo|mockup/i);
  const subscription = page.locator("[data-subscription-id]").first();
  const subscriptionId = (await subscription.getAttribute("data-subscription-id"))!;
  const csrf = await page.request.patch(`/api/account/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: { action: "skip_next", expectedVersion: 1 },
  });
  expect(csrf.status()).toBe(403);
  expect((await csrf.json()).error.code).toBe("CSRF_REJECTED");
  await page.getByRole("button", { name: "Preskoči sledeću", exact: false }).click();
  await expect(page.getByRole("region", { name: "Potvrda izmene" })).toContainText("Sledeća redovna dostava biće");
  await page.getByRole("button", { name: "Potvrdi preskakanje" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Dostava je preskočena" })).toBeVisible();
  const conflict = await page.evaluate(async ({ id }) => {
    const response = await fetch(`/api/account/subscriptions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ action: "skip_next", expectedVersion: 1 }),
    });
    return { status: response.status, body: await response.json() };
  }, { id: subscriptionId });
  expect(conflict.status).toBe(409);
  expect(conflict.body.error.code).toBe("SUBSCRIPTION_VERSION_CONFLICT");
  expect(conflict.body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
  const quantity = subscription.getByRole("spinbutton");
  const before = Number(await quantity.inputValue());
  await subscription.getByRole("button", { name: /^Povećaj količinu/ }).click();
  await expect(quantity).toHaveValue(String(before + 1));
  // A draft does not silently change the subscription.
  expect((await (await page.request.get("/api/account")).json()).subscriptions[0].items[0].quantity).toBe(before);
  await subscription.getByRole("button", { name: "Sačuvaj izmene" }).click();
  await expect(page.getByRole("status")).toContainText("Izmena je sačuvana");
  await page.reload();
  await expect(quantity).toHaveValue(String(before + 1));
  await subscription.getByRole("button", { name: /^Smanji količinu/ }).click();
  await subscription.getByRole("button", { name: "Sačuvaj izmene" }).click();
  await expect(page.getByRole("status")).toContainText("Izmena je sačuvana");
  await subscription.getByRole("combobox").selectOption("biweekly");
  await subscription.getByRole("button", { name: "Sačuvaj izmene" }).click();
  await expect(page.getByRole("status")).toContainText("Izmena je sačuvana");
  await subscription.locator(".account-extras summary").click();
  await subscription.getByRole("region", { name: "Dodajte sledećoj dostavi" }).getByRole("button").first().click();
  await expect(subscription.locator(".next-addon-summary")).toContainText("Dodato samo sledećoj dostavi");
  await subscription.getByRole("button", { name: /Pauziraj dostave/ }).click();
  const pauseUntil = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
  await subscription.getByLabel("Pauziraj do").fill(pauseUntil);
  expect((await (await page.request.get("/api/account")).json()).subscriptions[0].status).toBe("active");
  await subscription.getByRole("button", { name: "Potvrdi pauzu" }).click();
  await expect(subscription.getByRole("button", { name: "Nastavi pretplatu" })).toBeVisible();
  await expect(subscription).toContainText("Dostave se zatim nastavljaju automatski");
  await page.reload();
  await expect(subscription.getByRole("button", { name: "Nastavi pretplatu" })).toBeVisible();
  await subscription.getByRole("button", { name: "Nastavi pretplatu" }).click();
  await expect(subscription.getByRole("button", { name: /Pauziraj dostave/ })).toBeVisible();
  await expect(page.locator("#istorija-dostava")).toContainText("Preskočena");
  await page.getByLabel("Prikaži", { exact: true }).selectOption("delivered");
  await expect(page.locator("#istorija-dostava")).toContainText("Još nema dostava u ovom prikazu.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).include(".account-dashboard").analyze();
  expect(axe.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await subscription.getByRole("button", { name: "Otkaži pretplatu", exact: true }).click();
  await subscription.getByRole("button", { name: "Potvrdi otkazivanje" }).click();
  await expect(quantity).toBeDisabled();
  await page.reload();
  await expect(quantity).toBeDisabled();
  await page.getByRole("button", { name: "Odjavi se", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Prijavite se kodom" })).toBeVisible();
  expect((await page.request.get("/api/account")).status()).toBe(401);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Prijavite se kodom" })).toBeVisible();

});

test("login code requests are rate limited per identity", async ({ request, baseURL }, testInfo) => {
  const email = `rate-${testInfo.project.name}-${crypto.randomUUID()}@example.test`;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await request.post("/api/auth/code", { headers: { origin: baseURL! }, data: { email } });
    expect(response.status()).toBe(attempt === 1 ? 202 : 429);
    if (attempt === 2) {
      const body = await response.json();
      expect(body.error.code).toBe("RATE_LIMITED");
      expect(body.error.details.retryAfter).toBeGreaterThan(0);
    }
  }
});

test("public pages have no serious or critical automated accessibility findings", async ({ page }) => {
  for (const path of ["/", "/prodavnica", "/proizvodi/sveze-kravlje-mleko-1l", "/checkout", "/privatnost"]) {
    await page.goto(path);
    await acceptNecessary(page);
    const result = await new AxeBuilder({ page }).analyze();
    const blocking = result.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(blocking, `${path}: ${blocking.map((item) => item.id).join(", ")}`).toEqual([]);
  }
});

test("hero priorities remain visible and a custom milk selection survives the cart", async ({ page }) => {
  await page.goto("/");
  await acceptNecessary(page);
  // Headline, description and the primary action are fully inside the first screen
  // without waiting for media. toBeInViewport retries, so a poster settling into place
  // cannot turn this into a flake.
  for (const target of [
    page.locator(".scene-intro h1"),
    page.locator(".scene-lead"),
    page.locator(".scene-actions .button"),
  ]) {
    await expect(target).toBeInViewport({ ratio: 1 });
  }
  await expect(page.locator(".scene-poster img")).toBeAttached();

  await page.locator(".scene-actions .button").click();
  await expect(page.locator("#offer-title")).toBeInViewport();

  const card = page.locator(".configurator").first();
  await card.getByRole("button", { name: "4 L", exact: true }).click();
  await expect(card.locator(".configurator-total")).toContainText("1.000");
  await card.getByRole("button", { name: "Druga količina", exact: true }).click();
  await card.getByRole("spinbutton").fill("3");
  await card.getByRole("button", { name: "Redovna dostava" }).click();
  await card.getByRole("button", { name: "Svake 2 nedelje" }).click();
  await expect(card.locator(".configurator-total")).toContainText("750");
  await card.locator(".configurator-actions button", { hasText: "Dodaj u korpu" }).click();

  await expect(page.locator(".drawer-item-meta").first()).toContainText("3 L po dostavi · svake 2 nedelje");
  await page.locator(".cart-drawer").getByRole("link", { name: "Otvori celu korpu" }).click();
  await expect(page.getByRole("spinbutton", { name: "Količina za Domaće kravlje mleko" })).toHaveValue("3");
  await expect(page.getByLabel("Ritam isporuke za Domaće kravlje mleko")).toHaveValue("biweekly");
  await expect(page.getByLabel("Tip kupovine za Domaće kravlje mleko")).toHaveValue("subscription");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
