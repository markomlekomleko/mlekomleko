import { expect, test } from "@playwright/test";
import { cyr } from "./cyr";
import {
  acceptNecessary, addMilkFromShop, adminOrdersFor, adminToken, buyOneTime, fillCheckoutForm, freshIp, newCustomer, noHorizontalScroll, rsd, signInWithCode, weekdayOf,
} from "./tp-helpers";

// Phase 2 of TEST_PLAN.md, scope 1: a guest buys 2 L once, in a real browser.
// 2 L x 350 = 700, delivery 350, total 1.050 on every step.

test("TP-1 one-time purchase of 2 L: shop card, drawer, cart, checkout, confirmation and one single order", async ({ page, context, request }) => {
  test.setTimeout(120_000);
  await freshIp(context);
  const customer = newCustomer("jednokratna");
  const card = await addMilkFromShop(page, { type: "one_time", litres: 2 });

  // Shop card: milk 700, delivery 350, per delivery 1.050.
  const receipt = card.locator(".configurator-receipt");
  await expect(receipt).toContainText(rsd(700));
  await expect(receipt).toContainText(rsd(350));
  await expect(card.locator(".configurator-package-total")).toContainText(rsd(1050));
  await noHorizontalScroll(page, "shop");

  await card.locator(".configurator-actions button", { hasText: cyr("Napuni frižider") }).click();
  await page.locator(".cart-link").click();
  const drawer = page.locator(".cart-drawer");
  await expect(drawer).toHaveAttribute("data-open", "true");
  await expect(drawer.locator(".drawer-item")).toHaveCount(1);
  await expect(drawer.locator(".drawer-item-meta")).toContainText(cyr("2 L po dostavi · jednokratno"));
  await expect(drawer.locator(".cart-drawer-foot .summary-total")).toContainText(rsd(1050));
  await expect(drawer.locator(".cart-drawer-foot")).toContainText(rsd(700));
  await expect(drawer.locator(".cart-drawer-foot")).toContainText(rsd(350));

  // Cart page.
  await drawer.getByRole("link", { name: cyr("Otvori ceo frižider") }).click();
  await expect(page).toHaveURL(/\/korpa$/);
  await expect(page.locator(".cart-item:visible")).toHaveCount(1);
  await expect(page.getByLabel(cyr("Tip kupovine za Domaće kravlje mleko"))).toHaveValue("one_time");
  await expect(page.getByRole("spinbutton", { name: cyr("Količina za Domaće kravlje mleko") })).toHaveValue("2");
  const cartSummary = page.locator(".cart-summary");
  await expect(cartSummary.locator(".summary-total")).toContainText(rsd(1050));
  await expect(cartSummary).toContainText(rsd(700));
  await expect(cartSummary).toContainText(rsd(350));
  await noHorizontalScroll(page, "cart");
  const proceed = page.getByRole("link", { name: new RegExp(cyr("Nastavi na podatke")) });
  await expect(proceed).toBeVisible();
  await proceed.click();

  // Checkout: price preview first, then the address unlocks the dates.
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.locator(".checkout-price-preview strong")).toContainText(rsd(1050));
  await expect(page.getByRole("button", { name: cyr("Potvrdi porudžbinu") })).toBeDisabled();
  await fillCheckoutForm(page, customer);
  await expect(page.locator("#delivery-area-status")).toContainText(cyr("Grad i poštanski broj su u zoni dostave."));
  // Beograd: both Tuesday and Friday are offered; pick Friday.
  await expect(page.getByRole("radio", { name: cyr("Utorak"), exact: true })).toBeVisible();
  const friday = page.getByRole("radio", { name: cyr("Petak"), exact: true });
  await friday.check();
  await expect(friday).toBeChecked();
  const summary = page.locator("aside.cart-summary");
  await expect(summary.locator(".delivery-summary")).toBeVisible();
  await expect(summary.locator(".summary-total")).toContainText(rsd(1050));
  await expect(summary).toContainText(rsd(700));
  await expect(summary).toContainText(rsd(350));
  await expect(page.locator(".checkout-price-preview strong")).toContainText(rsd(1050));
  const submit = page.getByRole("button", { name: cyr("Potvrdi porudžbinu") });
  await page.locator('input[type="checkbox"][required]').check();
  await expect(submit).toBeEnabled();
  await noHorizontalScroll(page, "checkout");

  // Double click on the submit button: exactly one request, exactly one order.
  const checkoutRequests: { key: string | undefined }[] = [];
  page.on("request", req => { if (req.url().endsWith("/api/checkout") && req.method() === "POST") checkoutRequests.push({ key: req.headers()["idempotency-key"] }); });
  await submit.dblclick();
  await expect(page.getByRole("heading", { name: cyr("Hvala na porudžbini.") })).toBeVisible();
  expect(checkoutRequests.length, "a double click must send one checkout request").toBe(1);
  await noHorizontalScroll(page, "confirmation");

  // Confirmation: number, first delivery date, totals.
  const confirmation = page.locator(".notice.success").first();
  await expect(confirmation).toContainText(cyr("Broj porudžbine:"));
  await expect(confirmation.locator(".order-confirmation-summary")).toContainText(rsd(700));
  await expect(confirmation.locator(".order-confirmation-summary")).toContainText(rsd(350));
  await expect(confirmation.locator(".order-confirmation-summary .summary-total")).toContainText(rsd(1050));
  await expect(confirmation).toContainText(cyr("Prva dostava:"));
  await expect(confirmation.getByRole("link", { name: cyr("Otvori nalog") })).toBeVisible();

  const token = await adminToken(request);
  let orders = await adminOrdersFor(request, token, customer.email);
  expect(orders, "exactly one order after the double click").toHaveLength(1);
  const [order] = orders;
  // The number on the confirmation is the number in the back office, in Latin letters (it is a code, not a word).
  await expect(confirmation).toContainText(order.order_number);
  expect(order.kind).toBe("one_time");
  expect(order.total_minor).toBe(105000);
  expect(order.subtotal_minor).toBe(70000);
  expect(order.delivery_fee_minor).toBe(35000);
  expect(order.payment_method).toBe("cash");
  expect(order.payment_status).toBe("pending");
  expect(weekdayOf(order.delivery_date)).toBe(5);

  // Refreshing the confirmation page must not place the order again.
  await page.reload();
  await expect(page.getByRole("heading", { name: cyr("Hvala na porudžbini.") })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: cyr("Nema stavki za plaćanje.") })).toBeVisible();
  // Browser "back" to the checkout and a forward refresh do not resubmit either.
  await page.goBack().catch(() => undefined);
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: cyr("Nema stavki za plaćanje.") })).toBeVisible();
  orders = await adminOrdersFor(request, token, customer.email);
  expect(orders, "exactly one order after reloads").toHaveLength(1);
});

test("TP-1b one-time order: Tuesday can be chosen too, and rapid repeated submits create a single order", async ({ page, context, request }) => {
  test.setTimeout(120_000);
  await freshIp(context);
  const customer = newCustomer("utorak");
  const card = await addMilkFromShop(page, { type: "one_time", litres: 2 });
  await card.locator(".configurator-actions button", { hasText: cyr("Napuni frižider") }).click();
  await page.goto("/checkout");
  await acceptNecessary(page);
  await fillCheckoutForm(page, customer);
  const tuesday = page.getByRole("radio", { name: cyr("Utorak"), exact: true });
  await tuesday.check();
  await expect(tuesday).toBeChecked();
  await expect(page.locator("aside.cart-summary .summary-total")).toContainText(rsd(1050));
  await page.locator('input[type="checkbox"][required]').check();
  // Two parallel submits fired from script (faster than a human double click).
  const responses: Promise<string | undefined>[] = [];
  page.on("response", res => { if (res.url().endsWith("/api/checkout") && res.request().method() === "POST") responses.push(res.json().then(body => body.order?.id, () => undefined)); });
  await page.getByRole("button", { name: cyr("Potvrdi porudžbinu") }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); button.click(); });
  await expect(page.getByRole("heading", { name: cyr("Hvala na porudžbini.") })).toBeVisible();
  const token = await adminToken(request);
  const orders = await adminOrdersFor(request, token, customer.email);
  expect(orders).toHaveLength(1);
  expect(weekdayOf(orders[0].delivery_date)).toBe(2);
  expect(orders[0].total_minor).toBe(105000);
  // Every request that got through answered with the same order (same idempotency key).
  const ids = new Set(await Promise.all(responses));
  expect(ids.size).toBe(1);
});

test("TP-1c a guest's one-time order shows up in the account after signing in with the emailed code, with the same total", async ({ page, context, request }) => {
  test.setTimeout(120_000);
  await freshIp(context);
  const customer = newCustomer("gost-nalog");
  const options = await (await request.get("/api/delivery-options?city=Beograd&postalCode=11000")).json();
  const order = await buyOneTime(request, customer, { litres: 2, deliveryDate: options.dates[0] });
  await signInWithCode(page, customer.email);
  await expect(page.getByRole("heading", { name: new RegExp(`${cyr("Zdravo,")} ${customer.fullName}`) })).toBeVisible();
  const orders = page.locator(".account-orders > li");
  await expect(orders).toHaveCount(1);
  await expect(orders.first()).toContainText(rsd(1050));
  await expect(page.locator(".account-orders-panel")).toContainText(order.orderNumber);
  // The same order is announced as a one-time delivery, not as a subscription.
  await expect(page.locator("#pretplata")).toContainText(cyr("Naručeno jednokratno"));
  await expect(page.locator("#pretplata")).toContainText(cyr("2 × Domaće kravlje mleko"));
  await expect(page.locator(".account-subscription")).toHaveCount(0);
  await noHorizontalScroll(page, "account with a one-time order");
});

test("TP-1d cart page: switching 2 L from one-time to subscription and changing litres re-prices every line, the minimum of 2 L is kept", async ({ page, context }) => {
  test.setTimeout(120_000);
  await freshIp(context);
  const card = await addMilkFromShop(page, { type: "one_time", litres: 2 });
  await card.locator(".configurator-actions button", { hasText: cyr("Napuni frižider") }).click();
  await page.goto("/korpa");
  await acceptNecessary(page);
  const total = page.locator(".cart-summary .summary-total");
  await expect(total).toContainText(rsd(1050));
  const quantity = page.getByRole("spinbutton", { name: cyr("Količina za Domaće kravlje mleko") });
  await quantity.fill("3");
  await expect(total).toContainText(rsd(1400)); // 3 x 350 + 350
  await quantity.fill("2");
  await page.getByLabel(cyr("Tip kupovine za Domaće kravlje mleko")).selectOption("subscription");
  await expect(total).toContainText(cyr("Ukupno za ceo paket"));
  await expect(total).toContainText(rsd(3400)); // 4 x (2 x 250 + 350)
  await page.getByLabel(cyr("Tip kupovine za Domaće kravlje mleko")).selectOption("one_time");
  await expect(total).toContainText(rsd(1050));
  // One litre is below the minimum: the customer cannot go on to the checkout with it.
  await quantity.fill("1");
  // The cart raises it back to the minimum of 2 L instead of letting a 1 L order through.
  await expect(quantity).toHaveValue("2");
  await expect(total).toContainText(rsd(1050));
});
