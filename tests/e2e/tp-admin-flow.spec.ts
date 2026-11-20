import { expect, test } from "@playwright/test";
import { formatDate } from "../../app/lib/frontend";
import {
  adminOrdersFor, adminToken, adminUiLogin, buyOneTime, buySubscription, freshIp, newCustomer, noHorizontalScroll, rsd, weekdayOf, type Json } from "./tp-helpers";

// Phase 2 of TEST_PLAN.md, scope 5: the back office sees the new orders, marks the package paid and
// prepares the delivery list. Every project uses its own far-away Tuesday so that locking the list
// (which "Završi pripremu" does) never touches the nearest delivery other flows rely on.
const PROJECTS = ["mobile-390", "tablet-768", "desktop-1440"];

test("TP-5 admin: new orders are listed, the package is marked paid, the delivery list shows the stop with the right litres, confirming a future delivery is disabled", async ({ page, context, request }, testInfo) => {
  test.setTimeout(180_000);
  await freshIp(context);
  const options = await (await request.get("/api/delivery-options?city=Beograd&postalCode=11000")).json();
  const tuesdays: string[] = options.dates.filter((date: string) => weekdayOf(date) === 2);
  expect(tuesdays.length).toBeGreaterThan(PROJECTS.length + 1);
  const firstDelivery = tuesdays[tuesdays.length - 1 - PROJECTS.indexOf(testInfo.project.name)];
  const id = crypto.randomUUID().slice(0, 8);
  const subscriber = { ...newCustomer("admin"), email: `tp-admin-${id}-sub@example.test`, fullName: `Admin Pretplatnik ${id}` };
  const single = { ...newCustomer("admin"), email: `tp-admin-${id}-one@example.test`, fullName: `Admin Jednokratni ${id}` };
  const subscription = await buySubscription(request, subscriber, { litres: 4, deliveryDate: firstDelivery });
  const oneTime = await buyOneTime(request, single, { litres: 2, deliveryDate: firstDelivery });

  await adminUiLogin(page);
  await page.getByRole("navigation", { name: "Administracija" }).getByRole("button", { name: "Porudžbine", exact: true }).click();
  await page.getByLabel("Pretraga porudžbina").fill(`tp-admin-${id}`);
  await page.getByRole("button", { name: "Primeni filtere", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Pronađeno: 2 porudžbine" })).toBeVisible();
  const packageRow = page.locator("tbody tr").filter({ hasText: subscriber.email });
  const oneTimeRow = page.locator("tbody tr").filter({ hasText: single.email });
  await expect(packageRow).toBeVisible();
  await expect(oneTimeRow).toBeVisible();
  await expect(packageRow).toContainText(rsd(5400));
  await expect(oneTimeRow).toContainText(rsd(1050));
  await noHorizontalScroll(page, "admin orders");

  // Mark the package paid.
  await packageRow.getByRole("button", { name: "Otvori porudžbinu" }).click();
  const detail = page.getByRole("dialog");
  const orderNumber = subscription.body.order.orderNumber as string;
  await expect(detail).toContainText(orderNumber);
  await detail.getByLabel(`Naplata porudžbine ${orderNumber}`).selectOption("paid");
  await detail.getByRole("button", { name: "Sačuvaj status", exact: true }).click();
  await expect(detail.getByLabel(`Naplata porudžbine ${orderNumber}`)).toBeEnabled();
  await detail.getByRole("button", { name: "Zatvori", exact: true }).click();
  const token = await adminToken(request);
  const orders = await adminOrdersFor(request, token, subscriber.email);
  expect(orders).toHaveLength(1);
  expect(orders[0].payment_status).toBe("paid");
  expect(orders[0].total_minor).toBe(540000);
  // The one-time order is untouched.
  expect((await adminOrdersFor(request, token, single.email))[0].payment_status).toBe("pending");
  expect(oneTime.deliveryDate).toBe(firstDelivery);

  // Deliveries for the first delivery date.
  await page.getByRole("navigation", { name: "Administracija" }).getByRole("button", { name: "Dostave", exact: true }).click();
  await page.getByText("Promeni datum", { exact: true }).click();
  await page.locator('.work-date-picker input[type="date"]').fill(firstDelivery);
  await expect(page.getByRole("heading", { name: new RegExp(`^Dostave za ${formatDate(firstDelivery).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) })).toBeVisible();
  const subscriberStop = page.locator(".work-route-card").filter({ hasText: subscriber.fullName });
  const singleStop = page.locator(".work-route-card").filter({ hasText: single.fullName });
  await expect(subscriberStop).toBeVisible();
  await expect(singleStop).toBeVisible();
  await expect(subscriberStop).toContainText("Pretplata");
  await expect(subscriberStop.locator(".work-pack-item strong").first()).toHaveText(/^4 × /);
  await expect(singleStop).toContainText("Jednokratna");
  await expect(singleStop.locator(".work-pack-item strong").first()).toHaveText(/^2 × /);
  await expect(subscriberStop).toContainText("Čeka isporuku");
  await expect(subscriberStop).toContainText("Beograd");
  await expect(page.locator(".work-delivery-summary")).toContainText(/dostav/);
  await noHorizontalScroll(page, "admin deliveries");

  // "Završi pripremu" generates and locks the list for that date.
  await page.getByRole("button", { name: "Završi pripremu", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Završi pripremu|Zaključaj|Potvrdi/ }).last().click();
  await expect(page.getByRole("status").filter({ hasText: "Priprema je završena." })).toBeVisible();
  await expect(page.locator(".panel-heading .work-badge")).toHaveText("Spisak je zaključan");
  await expect(subscriberStop).toBeVisible();
  await expect(subscriberStop.locator(".work-pack-item strong").first()).toHaveText(/^4 × /);

  // The persisted delivery list carries the same litres.
  const preview = await (await request.get(`/api/admin/delivery-preview?date=${firstDelivery}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const stop = preview.orders.find((entry: Json) => entry.customer_snapshot?.fullName === subscriber.fullName);
  expect(stop, "subscription stop on the locked list").toBeTruthy();
  expect(stop.items.reduce((sum: number, item: Json) => sum + Number(item.quantity), 0)).toBe(4);
  expect(preview.delivery.status).toBe("locked");

  // Driver view: a delivery in the future cannot be confirmed.
  await page.getByRole("button", { name: "Razvoz", exact: true }).click();
  await expect(subscriberStop.getByRole("button", { name: "Potvrdi isporuku", exact: true })).toBeDisabled();
  await expect(subscriberStop.getByRole("button", { name: "Nije isporučeno", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Označi sve isporuke za datum")).toBeDisabled();
  // And the server refuses it as well.
  const completion = await request.post("/api/admin/deliveries", {
    headers: { Authorization: `Bearer ${token}` },
    data: { action: "complete", id: stop.id, status: "delivered", date: firstDelivery, cashCollected: true, items: stop.items.map((item: Json) => ({ id: item.id, deliveredQuantity: item.quantity })) },
  });
  expect(completion.status(), "confirming a future delivery is blocked").toBeGreaterThanOrEqual(400);
});

