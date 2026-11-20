import { formatDate } from "../../app/lib/frontend";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { cyr } from "./cyr";

async function acceptNecessary(page: import("@playwright/test").Page) {
  const button = page.getByRole("button", { name: cyr("Samo neophodno") });
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
  if (viewport.width <= 1279) {
    const menu = page.getByRole("button", { name: cyr("Meni") });
    await expect(menu).toBeVisible();
    await page.waitForTimeout(300);
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    const nav = page.getByRole("navigation", { name: cyr("Glavna navigacija") });
    for (const label of ["Početna", "Izaberi svoje mleko", "Mlekomati", "O nama", "Analize"]) {
      await expect(nav.getByRole("link", { name: cyr(label), exact: true })).toBeVisible();
    }
    await expect(nav.getByRole("link", { name: cyr("Moj nalog"), exact: true })).toBeVisible();
  } else {
    await expect(page.getByRole("navigation", { name: cyr("Glavna navigacija") })).toBeVisible();
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
  // Goat milk is off sale (spec 19 Nov 2026): its card only collects emails.
  const cards = page.locator(".configurator:not(.goat-waitlist)");
  expect(await cards.count()).toBeGreaterThanOrEqual(1);
  // The subscription is selected by default.
  await expect(cards.nth(0).getByRole("button", { name: cyr("Pretplata") })).toHaveAttribute("aria-pressed", "true");
  await cards.nth(0).locator(".configurator-actions button", { hasText: cyr("Napuni frižider") }).click();
  await expect(page.locator(".cart-drawer")).toHaveAttribute("data-open", "false");
  await cards.nth(0).getByRole("button", { name: cyr("Jednokratna kupovina") }).click();
  await cards.nth(0).locator(".configurator-actions button", { hasText: cyr("Napuni frižider") }).click();
  await expect(page.locator(".cart-drawer")).toHaveAttribute("data-open", "false");
  await page.locator(".cart-link").click();
  await expect(page.locator(".drawer-item")).toHaveCount(2);
  await page.locator(".cart-drawer").getByRole("link", { name: cyr("Otvori ceo frižider") }).click();
  await expect(page.getByText(cyr("Ukupno za ceo paket"))).toBeVisible();
  const cartTotal = await page.locator(".cart-summary .summary-total > span").last().innerText();
  await page.getByRole("link", { name: new RegExp(cyr("Nastavi na podatke")) }).click();
  await expect(page.locator(".checkout-price-preview strong")).toHaveText(cartTotal);
  await expect(page.getByRole("button", { name: cyr("Potvrdi porudžbinu") })).toBeDisabled();
  await page.getByLabel(cyr("Ime i prezime")).fill("Fiktivni E2E Kupac");
  await page.getByRole("textbox", { name: cyr("Email"), exact: true }).fill(email);
  await page.getByLabel(cyr("Broj telefona")).fill("+381600000001");
  await page.getByLabel(cyr("Ulica i broj")).fill("Test ulica 1");
  await page.getByLabel(cyr("Grad"), { exact: true }).fill("Beograd");
  await page.getByLabel(cyr("Poštanski broj"), { exact: true }).fill("11000");
  await expect(page.getByRole("radio", { name: cyr("Utorak"), exact: true })).toBeVisible();
  // Changing the address invalidates the previous quote and updates allowed days.
  await page.getByLabel(cyr("Grad"), { exact: true }).fill("Novi Sad");
  await page.getByLabel(cyr("Poštanski broj"), { exact: true }).fill("21000");
  await expect(page.getByRole("radio", { name: cyr("Petak"), exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: cyr("Utorak"), exact: true })).toHaveCount(0);
  await page.getByLabel(cyr("Poštanski broj"), { exact: true }).fill("00000");
  await expect(page.getByRole("button", { name: cyr("Potvrdi porudžbinu") })).toBeDisabled();
  await page.getByLabel(cyr("Grad"), { exact: true }).fill("Beograd");
  await page.getByLabel(cyr("Poštanski broj"), { exact: true }).fill("11000");
  await page.getByRole("radio", { name: cyr("Petak"), exact: true }).check();
  await page.locator(".calendar-trigger").click();
  const calendar = page.getByRole("region", { name: cyr("Kalendar dostave") });
  await expect(calendar.locator(".calendar-grid button:disabled").first()).toBeDisabled();
  await calendar.getByRole("button", { name: cyr("Sledeći mesec") }).click();
  const dateButton = calendar.locator(".calendar-grid button:not(:disabled)").first();
  const dateLabel = await dateButton.getAttribute("aria-label");
  // A quote for the preceding weekday selection may still be in flight.
  const quoteResponse = page.waitForResponse(response => response.url().endsWith("/api/cart")
    && response.request().method() === "POST"
    && formatDate(response.request().postDataJSON().deliveryDate, "sr-cyrl") === dateLabel);
  await dateButton.click();
  const selectedQuote = await (await quoteResponse).json();
  expect(new Date(`${selectedQuote.deliveryDate}T12:00:00Z`).getUTCDay()).toBe(5);
  for (const line of selectedQuote.lines) expect(line.deliveryDates[0]).toBe(selectedQuote.deliveryDate);
  await page.locator('input[type="checkbox"][required]').check();
  const createdResponse = page.waitForResponse(response => response.url().endsWith("/api/checkout") && response.request().method() === "POST");
  await page.getByRole("button", { name: cyr("Potvrdi porudžbinu") }).click();
  expect((await (await createdResponse).json()).order.deliveryDate).toBe(selectedQuote.deliveryDate);
  await expect(page.getByRole("heading", { name: cyr("Hvala na porudžbini.") })).toBeVisible();

  await page.goto("/prijava");
  await page.getByRole("button", { name: cyr("Napravi nalog"), exact: true }).click();
  await page.getByLabel(cyr("Email adresa")).fill(email);
  const challengeResponse = page.waitForResponse(response => response.url().endsWith("/api/auth/register") && response.request().method() === "POST");
  await page.getByRole("button", { name: cyr("Napravi nalog i pošalji kod") }).click();
  const challenge = await (await challengeResponse).json();
  await page.getByLabel(cyr("Šestocifreni kod")).fill(challenge.localDevelopment.code);
  await page.getByRole("button", { name: cyr("Potvrdi kod"), exact: true }).click();
  await expect(page).toHaveURL(/\/nalog$/);
  expect(await page.evaluate(() => window.localStorage.getItem("mleko-i-mleko-session"))).toBeNull();
  expect(await page.evaluate(() => document.cookie)).not.toContain("mm_session");
  const replay = await page.request.post("/api/auth/code/verify", { headers: { origin: new URL(page.url()).origin }, data: { challengeId: challenge.challengeId, code: challenge.localDevelopment.code } });
  expect(replay.status()).toBe(401);
  await expect(page.getByRole("heading", { name: new RegExp(`${cyr("Zdravo,")} Fiktivni E2E Kupac`) })).toBeVisible();
  await page.locator("summary").filter({ hasText: cyr("Moje porudžbine") }).click();
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
  await page.getByRole("button", { name: cyr("Preskoči sledeću"), exact: false }).click();
  await expect(page.getByRole("region", { name: cyr("Potvrda izmene") })).toContainText(cyr("Sledeća redovna dostava biće"));
  await page.getByRole("button", { name: cyr("Potvrdi preskakanje") }).click();
  await expect(page.getByRole("status").filter({ hasText: cyr("Dostava je preskočena") })).toBeVisible();
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
  await subscription.getByRole("button", { name: new RegExp("^" + cyr("Povećaj količinu")) }).click();
  await expect(quantity).toHaveValue(String(before + 1));
  // A draft does not silently change the subscription.
  expect((await (await page.request.get("/api/account")).json()).subscriptions[0].items[0].quantity).toBe(before);
  await subscription.getByRole("button", { name: cyr("Sačuvaj izmene") }).click();
  await expect(page.getByRole("status")).toContainText(cyr("Izmena je sačuvana"));
  await page.reload();
  await expect(quantity).toHaveValue(String(before + 1));
  await subscription.getByRole("button", { name: new RegExp("^" + cyr("Smanji količinu")) }).click();
  await subscription.getByRole("button", { name: cyr("Sačuvaj izmene") }).click();
  await expect(page.getByRole("status")).toContainText(cyr("Izmena je sačuvana"));
  await subscription.getByLabel(new RegExp("^" + cyr("Ritam za"))).selectOption("biweekly");
  await subscription.getByRole("button", { name: cyr("Sačuvaj izmene") }).click();
  await expect(page.getByRole("status")).toContainText(cyr("Izmena je sačuvana"));
  await subscription.locator(".account-extras summary").filter({ hasText: cyr("Dodajte nešto samo sledećoj dostavi") }).click();
  await subscription.getByRole("region", { name: cyr("Dodajte sledećoj dostavi") }).getByRole("button").first().click();
  await expect(subscription.locator(".next-addon-summary")).toContainText(cyr("Dodato samo sledećoj dostavi"));
  await subscription.getByRole("button", { name: new RegExp(cyr("Pauziraj dostave")) }).click();
  const currentSubscription = (await (await page.request.get("/api/account")).json()).subscriptions[0];
  const pauseUntil = new Date(new Date(`${currentSubscription.nextDeliveryDate}T12:00:00Z`).getTime() + 14 * 86400000).toISOString().slice(0, 10);
  await subscription.getByLabel(cyr("Pauziraj do")).fill(pauseUntil);
  expect((await (await page.request.get("/api/account")).json()).subscriptions[0].status).toBe("active");
  await subscription.getByRole("button", { name: cyr("Potvrdi pauzu") }).click();
  await expect(subscription.getByRole("button", { name: cyr("Nastavi pretplatu") })).toBeVisible();
  await expect(subscription).toContainText(cyr("Dostave se zatim nastavljaju automatski"));
  await page.reload();
  await expect(subscription.getByRole("button", { name: cyr("Nastavi pretplatu") })).toBeVisible();
  await subscription.getByRole("button", { name: cyr("Nastavi pretplatu") }).click();
  await expect(subscription.getByRole("button", { name: new RegExp(cyr("Pauziraj dostave")) })).toBeVisible();
  await expect(page.locator("#istorija-dostava")).toContainText(cyr("Preskočena"));
  await page.getByLabel(cyr("Prikaži"), { exact: true }).selectOption("delivered");
  await expect(page.locator("#istorija-dostava")).toContainText(cyr("Još nema dostava u ovom prikazu."));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).include(".account-dashboard").analyze();
  expect(axe.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await subscription.getByRole("button", { name: cyr("Otkaži pretplatu"), exact: true }).click();
  await subscription.getByRole("button", { name: cyr("Potvrdi otkazivanje") }).click();
  await expect(quantity).toBeDisabled();
  await page.reload();
  await expect(quantity).toBeDisabled();
  await page.getByRole("button", { name: cyr("Odjavi se"), exact: true }).click();
  await expect(page.getByRole("heading", { name: cyr("Prijavite se kodom") })).toBeVisible();
  expect((await page.request.get("/api/account")).status()).toBe(401);
  await page.reload();
  await expect(page.getByRole("heading", { name: cyr("Prijavite se kodom") })).toBeVisible();

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
  // The hero carries a visually hidden h1; the first slide's call to action is "Izaberi svoje mleko"; the
  // action is fully inside the first screen without waiting for media. toBeInViewport
  // retries, so a poster settling into place cannot turn this into a flake.
  await expect(page.locator(".scene-intro h1")).toBeAttached();
  await expect(page.locator(".hero-cta")).toHaveText(cyr("Izaberi svoje mleko"));
  await expect(page.locator(".hero-cta")).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".scene-poster img")).toBeAttached();

  await page.locator(".scene-actions .button").click();
  await expect(page.locator("#offer-title")).toBeInViewport();

  const card = page.locator(".configurator").first();
  await card.getByRole("button", { name: cyr("4 L"), exact: true }).click();
  // Spec 19 Nov 2026: milk, delivery and the total per delivery are shown on the card.
  await expect(card.locator(".configurator-receipt")).toBeVisible();
  await card.getByRole("button", { name: cyr("Druga količina"), exact: true }).click();
  await card.getByRole("spinbutton").fill("3");
  await card.getByRole("button", { name: cyr("Pretplata") }).click();
  await card.locator(".configurator-actions button", { hasText: cyr("Napuni frižider") }).click();
  await expect(page.locator(".cart-drawer")).toHaveAttribute("data-open", "false");
  await page.locator(".cart-link").click();

  await expect(page.locator(".drawer-item-meta").first()).toContainText(cyr("3 L po dostavi · svake nedelje"));
  await page.locator(".cart-drawer").getByRole("link", { name: cyr("Otvori ceo frižider") }).click();
  await expect(page.getByRole("spinbutton", { name: cyr("Količina za Domaće kravlje mleko") })).toHaveValue("3");
  await expect(page.getByLabel(cyr("Ritam isporuke za Domaće kravlje mleko"))).toHaveValue("weekly");
  await expect(page.getByLabel(cyr("Tip kupovine za Domaće kravlje mleko"))).toHaveValue("subscription");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
