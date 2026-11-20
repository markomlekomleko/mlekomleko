import { expect, test } from "@playwright/test";
import { formatDate } from "../../app/lib/frontend";
import { cyr } from "./cyr";
import {
  acceptNecessary, addMilkFromShop, adminOrdersFor, adminToken, fillCheckoutForm, freshIp, newCustomer, noHorizontalScroll, rsd, signInWithCode, weekdayOf,
} from "./tp-helpers";

// Phase 2 of TEST_PLAN.md, scope 2: subscription of 4 L per delivery.
// Per delivery 4 x 250 = 1.000 + 350 delivery = 1.350; package of 4 deliveries = 5.400, paid up front.

test("TP-2 subscription of 4 L: card, cart, checkout totals, first delivery date, confirmation, then the account shows the package 4 / 0 / 4", async ({ page, context, request }) => {
  test.setTimeout(150_000);
  await freshIp(context);
  const customer = newCustomer("pretplata");
  const storefront = await (await request.get("/api/storefront")).json();

  await page.goto("/prodavnica");
  await acceptNecessary(page);
  const card = page.locator(".configurator:not(.goat-waitlist)").first();
  // The subscription is the default choice.
  await expect(card.getByRole("button", { name: cyr("Pretplata") })).toHaveAttribute("aria-pressed", "true");
  await card.getByRole("button", { name: cyr("4 L"), exact: true }).click();
  const receipt = card.locator(".configurator-receipt");
  await expect(receipt).toContainText(rsd(1000));
  await expect(receipt).toContainText(rsd(350));
  await expect(card.locator(".configurator-package-total")).toContainText(rsd(1350));
  // Package line: 4 deliveries, 5.400 up front, first delivery date shown.
  await expect(card.locator(".configurator-occurrences")).toContainText(rsd(5400));
  await expect(card.locator(".configurator-occurrences")).toContainText(formatDate(storefront.delivery.deliveryDate, "sr-cyrl"));
  await noHorizontalScroll(page, "shop");
  await card.locator(".configurator-actions button", { hasText: cyr("Napuni frižider") }).click();

  await page.locator(".cart-link").click();
  const drawer = page.locator(".cart-drawer");
  await expect(drawer.locator(".drawer-item-meta")).toContainText(cyr("4 L po dostavi · svake nedelje"));
  await expect(drawer.locator(".drawer-item-meta")).toContainText(cyr("4 dostave u paketu"));
  await expect(drawer.locator(".cart-drawer-foot .summary-total")).toContainText(rsd(5400));
  await drawer.getByRole("link", { name: cyr("Otvori ceo frižider") }).click();

  await expect(page.getByLabel(cyr("Tip kupovine za Domaće kravlje mleko"))).toHaveValue("subscription");
  const cartSummary = page.locator(".cart-summary");
  await expect(cartSummary.locator(".summary-total")).toContainText(cyr("Ukupno za ceo paket"));
  await expect(cartSummary.locator(".summary-total")).toContainText(rsd(5400));
  await expect(cartSummary).toContainText(rsd(4000)); // milk for the package: 4 x 1.000
  await expect(cartSummary).toContainText(rsd(1400)); // delivery for the package: 4 x 350
  await expect(cartSummary).toContainText(`4 × ${rsd(350)}`);
  await noHorizontalScroll(page, "cart");
  await page.getByRole("link", { name: new RegExp(cyr("Nastavi na podatke")) }).click();

  await expect(page.locator(".checkout-price-preview strong")).toContainText(rsd(5400));
  await fillCheckoutForm(page, customer);
  await expect(page.locator("#delivery-area-status")).toContainText(cyr("Grad i poštanski broj su u zoni dostave."));
  const summary = page.locator("aside.cart-summary");
  await expect(summary.locator(".summary-total")).toContainText(cyr("Ukupno za ceo paket"));
  await expect(summary.locator(".summary-total")).toContainText(rsd(5400));
  await expect(summary).toContainText(`${rsd(1000)} RSD`); // milk per delivery (4 L x 250)
  await expect(summary).toContainText(`4 × ${rsd(350)}`); // delivery fee per delivery, four deliveries
  await expect(summary).toContainText(rsd(4000));
  await expect(summary).toContainText(rsd(1400));
  await expect(summary).toContainText(cyr("4× u paketu"));
  await expect(page.getByText(cyr("Ceo paket plaćaš gotovinom pri prvoj dostavi."))).toBeVisible();
  // Card payment is announced as unavailable, never selectable.
  await expect(page.getByRole("radio", { name: new RegExp(cyr("Karticom")) })).toBeDisabled();
  // First delivery date: whichever day is preselected, the summary and the calendar agree.
  const picked = page.locator(".delivery-weekdays input:checked");
  await expect(picked).toHaveCount(1);
  const dateTrigger = page.locator(".calendar-trigger");
  const triggerLabel = (await dateTrigger.getAttribute("aria-label"))!;
  const firstDelivery = await page.evaluate(() => (document.querySelector(".delivery-schedule .small-text strong") as HTMLElement).innerText);
  expect(triggerLabel).toContain(firstDelivery);
  await expect(summary.locator(".delivery-summary")).toContainText(firstDelivery);
  expect(firstDelivery.toLowerCase()).toBe(formatDate(storefront.delivery.deliveryDate, "sr-cyrl").toLowerCase());
  await expect(summary).toContainText(cyr("Termini:"));
  await page.locator('input[type="checkbox"][required]').check();
  await noHorizontalScroll(page, "checkout");

  const created = page.waitForResponse(response => response.url().endsWith("/api/checkout") && response.request().method() === "POST");
  await page.getByRole("button", { name: cyr("Potvrdi porudžbinu") }).dblclick();
  const createdBody = await (await created).json();
  await expect(page.getByRole("heading", { name: cyr("Hvala na porudžbini.") })).toBeVisible();
  const confirmation = page.locator(".notice.success").first();
  await expect(confirmation).toContainText(cyr("Prva dostava:"));
  await expect(confirmation).toContainText(firstDelivery);
  await expect(confirmation.locator(".summary-total")).toContainText(cyr("Ukupno za ceo paket"));
  await expect(confirmation.locator(".summary-total")).toContainText(rsd(5400));
  await expect(confirmation.locator(".order-confirmation-summary")).toContainText(cyr("4 × Domaće kravlje mleko po dostavi × 4"));
  await noHorizontalScroll(page, "confirmation");
  expect(createdBody.order.totalMinor).toBe(540000);
  expect(createdBody.order.deliveryFeeMinor).toBe(140000);

  // The back office sees exactly one prepaid package order.
  const token = await adminToken(request);
  const orders = await adminOrdersFor(request, token, customer.email);
  expect(orders).toHaveLength(1);
  expect(orders[0].kind).toBe("subscription_invoice");
  expect(orders[0].total_minor).toBe(540000);
  expect(orders[0].payment_status).toBe("pending");
  expect(orders[0].payment_method).toBe("cash");
  expect(orders[0].scheduled_delivery_date).toBe(createdBody.order.deliveryDate);
  expect(weekdayOf(createdBody.order.deliveryDate)).toBe(weekdayOf(storefront.delivery.deliveryDate));

  // Account: package counters and the next delivery.
  await signInWithCode(page, customer.email);
  await expect(page.getByRole("heading", { name: new RegExp(`${cyr("Zdravo,")} ${customer.fullName}`) })).toBeVisible();
  const overview = page.locator(".account-overview");
  await expect(overview).toContainText(cyr("Kupljeno 4 dostave • Realizovano 0 • Ostalo 4"));
  await expect(overview).toContainText(formatDate(createdBody.order.deliveryDate, "sr-cyrl"));
  await expect(overview).toContainText(cyr("4 × Domaće kravlje mleko"));
  await expect(page.locator(".account-subscription")).toHaveCount(1);
  await expect(page.locator(".account-subscription .account-package")).toContainText(cyr("Kupljeno 4 dostave • Realizovano 0 • Ostalo 4"));
  await noHorizontalScroll(page, "account");
  await page.reload();
  await expect(page.locator(".account-overview")).toContainText(cyr("Kupljeno 4 dostave • Realizovano 0 • Ostalo 4"));
  // The order list in the account shows the 5.400 package, unpaid (cash on first delivery).
  await expect(page.locator(".account-orders").first()).toContainText(rsd(5400));
});

test("TP-2b subscription: the shop card preselects the subscription and 2 L costs 500 + 350 per delivery, 3.400 for the package", async ({ page, context }) => {
  await freshIp(context);
  const card = await addMilkFromShop(page, { type: "subscription", litres: 2 });
  await expect(card.locator(".configurator-receipt")).toContainText(rsd(500));
  await expect(card.locator(".configurator-package-total")).toContainText(rsd(850));
  await expect(card.locator(".configurator-occurrences")).toContainText(rsd(3400));
});
