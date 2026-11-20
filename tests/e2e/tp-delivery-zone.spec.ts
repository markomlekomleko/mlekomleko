import { expect, test, type Page } from "@playwright/test";
import { cyr } from "./cyr";
import {
  acceptNecessary, addMilkFromShop, adminOrdersFor, adminToken, buySubscription, fillCheckoutForm, freshIp, newCustomer, ORIGIN, signInWithCode, weekdayOf,
} from "./tp-helpers";

// Phase 2 of TEST_PLAN.md, scope 4: the delivery zone as the customer meets it in the browser.

async function openCheckoutWithMilk(page: Page) {
  const card = await addMilkFromShop(page, { type: "one_time", litres: 2 });
  await card.locator(".configurator-actions button", { hasText: cyr("Napuni frižider") }).click();
  await page.goto("/checkout");
  await acceptNecessary(page);
  await expect(page.getByRole("button", { name: cyr("Potvrdi porudžbinu") })).toBeDisabled();
}

const IN_ZONE = cyr("Grad i poštanski broj su u zoni dostave.");

test("TP-4a Niš 18000 cannot be ordered: clear message, no delivery days, submit stays disabled, the API refuses too", async ({ page, context, request }) => {
  test.setTimeout(90_000);
  await freshIp(context);
  const customer = newCustomer("nis");
  await openCheckoutWithMilk(page);
  await fillCheckoutForm(page, customer, "Niš", "18000");
  await page.locator('input[type="checkbox"][required]').check();
  const status = page.locator("#delivery-area-status");
  await expect(status).toContainText(cyr("Ovaj poštanski broj trenutno nije u zoni dostave."));
  await expect(status).not.toContainText(IN_ZONE);
  await expect(status.locator(".check-result")).toHaveClass(/error/);
  await expect(page.getByRole("button", { name: cyr("Potvrdi porudžbinu") })).toBeDisabled();
  // No weekday choice is offered for a city we do not serve.
  await expect(page.getByRole("radio", { name: cyr("Utorak"), exact: true })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: cyr("Petak"), exact: true })).toHaveCount(0);
  // The customer is not told the order was placed.
  await expect(page.getByRole("heading", { name: cyr("Hvala na porudžbini.") })).toHaveCount(0);

  // Server side: the same address through the API is refused and nothing is stored.
  const direct = await request.post("/api/checkout", {
    headers: { Origin: ORIGIN, "Idempotency-Key": crypto.randomUUID() },
    data: { customer: { email: customer.email, fullName: customer.fullName, phone: customer.phone, addressLine1: customer.street, city: "Niš", postalCode: "18000" }, paymentMethod: "cash", items: [{ productId: "prod_kravlje_1l", quantity: 2, purchaseType: "one_time" }] },
  });
  expect(direct.status()).toBeGreaterThanOrEqual(400);
  expect(direct.status()).toBeLessThan(500);
  const token = await adminToken(request);
  expect(await adminOrdersFor(request, token, customer.email)).toHaveLength(0);
});

test("TP-4b a postal code that does not belong to the typed city is refused in the form", async ({ page, context }) => {
  await freshIp(context);
  await openCheckoutWithMilk(page);
  const customer = newCustomer("neslaganje");
  await fillCheckoutForm(page, customer, "Beograd", "21000");
  await expect(page.locator("#delivery-area-status .check-result")).toHaveClass(/error/);
  await expect(page.locator("#delivery-area-status")).not.toContainText(IN_ZONE);
  await expect(page.getByRole("button", { name: cyr("Potvrdi porudžbinu") })).toBeDisabled();
  await page.getByLabel(cyr("Poštanski broj"), { exact: true }).fill("00000");
  await expect(page.getByRole("button", { name: cyr("Potvrdi porudžbinu") })).toBeDisabled();
});

test("TP-4c Novi Sad offers only Friday, Beograd offers Tuesday and Friday; a Novi Sad order lands on a Friday", async ({ page, context, request }) => {
  test.setTimeout(120_000);
  await freshIp(context);
  const customer = newCustomer("novisad");
  await openCheckoutWithMilk(page);
  await fillCheckoutForm(page, customer, "Novi Sad", "21000");
  await expect(page.locator("#delivery-area-status")).toContainText(IN_ZONE);
  await expect(page.getByRole("radio", { name: cyr("Petak"), exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: cyr("Utorak"), exact: true })).toHaveCount(0);
  // Every selectable date in the calendar is a Friday.
  await page.locator(".calendar-trigger").click();
  const calendar = page.getByRole("region", { name: cyr("Kalendar dostave") });
  const labels = await calendar.locator(".calendar-grid button:not(:disabled)").evaluateAll(buttons => buttons.map(button => button.getAttribute("aria-label")));
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) expect(label, "Novi Sad dates are Fridays").toMatch(/петак|petak/i);
  // Back to Beograd: both days return.
  await page.getByLabel(cyr("Grad"), { exact: true }).fill("Beograd");
  await page.getByLabel(cyr("Poštanski broj"), { exact: true }).fill("11000");
  await expect(page.getByRole("radio", { name: cyr("Utorak"), exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: cyr("Petak"), exact: true })).toBeVisible();
  // And a real Novi Sad order.
  await page.getByLabel(cyr("Grad"), { exact: true }).fill("Novi Sad");
  await page.getByLabel(cyr("Poštanski broj"), { exact: true }).fill("21000");
  await expect(page.getByRole("radio", { name: cyr("Petak"), exact: true })).toBeChecked();
  await expect(page.locator("aside.cart-summary .delivery-summary")).toBeVisible();
  await page.locator('input[type="checkbox"][required]').check();
  await page.getByRole("button", { name: cyr("Potvrdi porudžbinu") }).click();
  await expect(page.getByRole("heading", { name: cyr("Hvala na porudžbini.") })).toBeVisible();
  const token = await adminToken(request);
  const [order] = await adminOrdersFor(request, token, customer.email);
  expect(weekdayOf(order.delivery_date)).toBe(5);
});

for (const variant of [
  { name: "Latin without diacritics, lower case", city: "beograd", postal: "11000", day: "Beograd" },
  { name: "Latin upper case", city: "BEOGRAD", postal: "11000", day: "Beograd" },
  { name: "Cyrillic Beograd", city: "Београд", postal: "11000", day: "Beograd" },
  { name: "Cyrillic Novi Sad", city: "Нови Сад", postal: "21000", day: "Novi Sad" },
  { name: "Latin Novi Sad with extra spaces", city: "  novi   sad ", postal: "21000", day: "Novi Sad" },
  { name: "Zemun belongs to Beograd", city: "Zemun", postal: "11080", day: "Beograd" },
  { name: "Petrovaradin belongs to Novi Sad", city: "Petrovaradin", postal: "21131", day: "Novi Sad" },
]) {
  test(`TP-4d city spelling "${variant.name}" is accepted in the checkout form`, async ({ page, context }) => {
    await freshIp(context);
    await openCheckoutWithMilk(page);
    await fillCheckoutForm(page, newCustomer("pisanje"), variant.city, variant.postal);
    await expect(page.locator("#delivery-area-status")).toContainText(IN_ZONE);
    await expect(page.getByRole("radio", { name: cyr("Petak"), exact: true })).toBeVisible();
    if (variant.day === "Novi Sad") await expect(page.getByRole("radio", { name: cyr("Utorak"), exact: true })).toHaveCount(0);
    else await expect(page.getByRole("radio", { name: cyr("Utorak"), exact: true })).toBeVisible();
  });
}

test("TP-4e a Cyrillic city order is placed and stored under the served city", async ({ page, context, request }) => {
  test.setTimeout(90_000);
  await freshIp(context);
  const customer = newCustomer("cirilica");
  await openCheckoutWithMilk(page);
  await fillCheckoutForm(page, customer, "Београд", "11000");
  await expect(page.locator("#delivery-area-status")).toContainText(IN_ZONE);
  await page.getByRole("radio", { name: cyr("Utorak"), exact: true }).check();
  await page.locator('input[type="checkbox"][required]').check();
  await page.getByRole("button", { name: cyr("Potvrdi porudžbinu") }).click();
  await expect(page.getByRole("heading", { name: cyr("Hvala na porudžbini.") })).toBeVisible();
  const token = await adminToken(request);
  const [order] = await adminOrdersFor(request, token, customer.email);
  expect(weekdayOf(order.delivery_date)).toBe(2);
  const customers = await request.get(`/api/admin/customers?q=${encodeURIComponent(customer.email)}`, { headers: { Authorization: `Bearer ${token}` } });
  const stored = JSON.stringify(await customers.json());
  // The address is kept as a place we serve, not as the raw Cyrillic spelling.
  expect(stored).toMatch(/"city":"Beograd"/);
});

test("TP-4f account: moving the address outside the zone is refused and the subscription stays as it was", async ({ page, context, request }) => {
  test.setTimeout(120_000);
  await freshIp(context);
  const customer = newCustomer("adresa");
  const bought = await buySubscription(request, customer, { litres: 2 });
  await signInWithCode(page, customer.email);
  const before = (await (await page.request.get("/api/account")).json());
  const sub = page.locator(".account-subscription").first();
  await expect(sub).toBeVisible();

  const section = page.locator("#adresa");
  await section.getByRole("button", { name: cyr("Promeni adresu") }).click();
  // The city list offers only served cities, so the outside-the-zone attempt is a postal code that is not Beograd's.
  await expect(section.locator('select[name="city"]').locator("option")).toHaveText(["Beograd", "Novi Sad"].map(cyr));
  await section.locator('input[name="postalCode"]').fill("18000");
  await section.getByRole("button", { name: cyr("Sačuvaj adresu") }).click();
  await expect(section.getByRole("alert")).toBeVisible();
  await expect(section.getByRole("alert")).toContainText(cyr("Adresa nije u zoni dostave."));
  await page.reload();
  const afterUi = (await (await page.request.get("/api/account")).json());
  expect(afterUi.customer.postalCode).toBe(before.customer.postalCode);
  expect(afterUi.customer.city).toBe(before.customer.city);
  expect(afterUi.subscriptions[0].nextDeliveryDate).toBe(bought.deliveryDate);
  expect(afterUi.subscriptions[0].status).toBe("active");

  // Direct API attempt with the city we do not serve.
  const direct = await page.request.patch("/api/account", { headers: { Origin: ORIGIN }, data: { addressLine1: "Obilićev venac 1", city: "Niš", postalCode: "18000", applyToSubscriptions: true } });
  expect(direct.status(), await direct.text()).toBeGreaterThanOrEqual(400);
  expect(direct.status()).toBeLessThan(500);
  const afterApi = (await (await page.request.get("/api/account")).json());
  expect(afterApi.customer.city).toBe(before.customer.city);
  expect(afterApi.customer.addressLine1).toBe(before.customer.addressLine1);
  expect(afterApi.subscriptions[0].version).toBe(before.subscriptions[0].version);
  expect(afterApi.subscriptions[0].nextDeliveryDate).toBe(bought.deliveryDate);
});

test("TP-4g account: a Tuesday Beograd subscription cannot move to Novi Sad (no Tuesday route), a Friday one can", async ({ page, context, request }) => {
  test.setTimeout(150_000);
  await freshIp(context);
  const tuesdayCustomer = newCustomer("utorak-ns");
  const tuesday = await buySubscription(request, tuesdayCustomer, { litres: 2, weekday: 2 });
  expect(weekdayOf(tuesday.deliveryDate)).toBe(2);
  await signInWithCode(page, tuesdayCustomer.email);
  const section = page.locator("#adresa");
  await section.getByRole("button", { name: cyr("Promeni adresu") }).click();
  await section.locator('select[name="city"]').selectOption("Novi Sad");
  await section.locator('input[name="postalCode"]').fill("21000");
  await section.getByRole("button", { name: cyr("Sačuvaj adresu") }).click();
  await expect(section.getByRole("alert")).toBeVisible();
  let state = (await (await page.request.get("/api/account")).json());
  expect(state.customer.city).toBe("Beograd");
  expect(state.subscriptions[0].nextDeliveryDate).toBe(tuesday.deliveryDate);

  // The same move for a Friday subscription is fine.
  await page.context().clearCookies();
  const fridayCustomer = newCustomer("petak-ns");
  const friday = await buySubscription(request, fridayCustomer, { litres: 2, weekday: 5 });
  await signInWithCode(page, fridayCustomer.email);
  const fridaySection = page.locator("#adresa");
  await fridaySection.getByRole("button", { name: cyr("Promeni adresu") }).click();
  await fridaySection.locator('select[name="city"]').selectOption("Novi Sad");
  await fridaySection.locator('input[name="postalCode"]').fill("21000");
  await fridaySection.getByRole("button", { name: cyr("Sačuvaj adresu") }).click();
  await expect(page.getByRole("status").filter({ hasText: cyr("Adresa je sačuvana.") })).toBeVisible();
  state = (await (await page.request.get("/api/account")).json());
  expect(state.customer.city).toBe("Novi Sad");
  expect(state.subscriptions[0].nextDeliveryDate).toBe(friday.deliveryDate);
  expect(state.subscriptions[0].status).toBe("active");
});
