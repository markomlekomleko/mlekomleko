import { expect, test, type Page } from "@playwright/test";
import { formatDate } from "../../app/lib/frontend";
import { cyr } from "./cyr";
import {
  addDaysIso, adminToken, buySubscription, freshIp, newCustomer, noHorizontalScroll, rsd, signInWithCode, ORIGIN, type Json } from "./tp-helpers";

// Phase 2 of TEST_PLAN.md, scope 3: the customer manages a 2 L weekly subscription in the account.
// After every action the page is reloaded and the state (screen and /api/account) must have persisted.

const COUNTS = (purchased: number, realized: number, remaining: number) => cyr(`Kupljeno ${purchased} dostave • Realizovano ${realized} • Ostalo ${remaining}`);
const fmt = (iso: string) => formatDate(iso, "sr-cyrl");

async function accountState(page: Page) {
  const body = await (await page.request.get("/api/account")).json();
  return { body, sub: body.subscriptions[0] };
}

async function stopFor(request: import("@playwright/test").APIRequestContext, token: string, date: string, fullName: string) {
  const preview = await (await request.get(`/api/admin/delivery-preview?date=${date}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const stop = preview.orders.find((entry: Json) => entry.customer_snapshot?.fullName === fullName);
  const litres = stop ? stop.items.reduce((sum: number, item: Json) => sum + Number(item.quantity), 0) : 0;
  const excluded = preview.excluded.filter((entry: Json) => entry.full_name === fullName);
  return { stop, litres, excluded };
}

test("TP-3 account: skip, pause, resume, add litres once and regularly, no decrease, cancel renewal - each persisted after reload", async ({ page, context, request }) => {
  test.setTimeout(240_000);
  await freshIp(context);
  const customer = newCustomer("nalog");
  const bought = await buySubscription(request, customer, { litres: 2 });
  const first = bought.deliveryDate;
  await signInWithCode(page, customer.email);
  const card = page.locator(".account-subscription").first();
  await expect(card).toBeVisible();
  await expect(page.locator(".account-overview")).toContainText(COUNTS(4, 0, 4));
  await expect(page.locator(".account-overview")).toContainText(fmt(first));
  await noHorizontalScroll(page, "account");

  // ---- 1. Skip the next delivery: the date moves a week, the package is untouched.
  await test.step("skip next delivery", async () => {
    await card.getByRole("button", { name: new RegExp(`^${cyr("Preskoči sledeću")}`) }).click();
    const confirmation = page.getByRole("region", { name: cyr("Potvrda izmene") });
    await expect(confirmation).toContainText(cyr("Preskočiti samo ovu dostavu?"));
    await expect(confirmation).toContainText(fmt(addDaysIso(first, 7)));
    await confirmation.getByRole("button", { name: cyr("Potvrdi preskakanje") }).click();
    await expect(page.getByRole("status").filter({ hasText: cyr("Dostava je preskočena") })).toContainText(fmt(addDaysIso(first, 7)));
    for (const phase of ["now", "after reload"]) {
      if (phase === "after reload") await page.reload();
      await expect(page.locator(".account-overview h2")).toContainText(fmt(addDaysIso(first, 7)));
      await expect(page.locator(".account-overview")).toContainText(COUNTS(4, 0, 4));
      await expect(page.locator(".account-subscription .account-package")).toContainText(COUNTS(4, 0, 4));
      const { sub } = await accountState(page);
      expect(sub.nextDeliveryDate, phase).toBe(addDaysIso(first, 7));
      expect(sub.status).toBe("active");
      expect(sub.packageSummary).toMatchObject({ purchased: 4, realized: 0, remaining: 4 });
    }
    await expect(page.locator("#istorija-dostava")).toContainText(cyr("Preskočena"));
    // The customer's cut-off is shown (Tuesday route: Sunday 19:00, Friday route: Wednesday 19:00).
    await expect(page.locator(".account-subscription .account-cutoff")).toContainText(/19:00/);
    // Back office: the skipped day no longer packs this customer, the following week does.
    const token = await adminToken(request);
    const skipped = await stopFor(request, token, first, customer.fullName);
    expect(skipped.stop, "no stop on the skipped date").toBeFalsy();
    expect(skipped.excluded.length, "listed among skips").toBe(1);
    const moved = await stopFor(request, token, addDaysIso(first, 7), customer.fullName);
    expect(moved.litres, "2 L on the moved date").toBe(2);
  });
  const afterSkip = addDaysIso(first, 7);

  // ---- 2. Pause until a chosen date, then resume.
  const pauseUntil = addDaysIso(afterSkip, 20);
  await test.step("pause until a chosen date", async () => {
    const sub = page.locator(".account-subscription").first();
    await sub.getByRole("button", { name: new RegExp(`^${cyr("Pauziraj dostave")}`) }).click();
    const confirmation = page.getByRole("region", { name: cyr("Potvrda izmene") });
    await confirmation.getByLabel(cyr("Nastavak dostava od")).fill(pauseUntil);
    // The first delivery after the pause keeps the weekly weekday: the first one on/after the chosen date.
    await expect(confirmation).toContainText(fmt(addDaysIso(afterSkip, 21)));
    await confirmation.getByRole("button", { name: cyr("Potvrdi pauzu") }).click();
    await expect(page.getByRole("status").filter({ hasText: cyr("Dostave su pauzirane") })).toBeVisible();
    for (const phase of ["now", "after reload"]) {
      if (phase === "after reload") await page.reload();
      await expect(page.locator(".account-subscription .account-status")).toHaveText(cyr("Pauzirana"));
      await expect(page.locator(".account-overview")).toContainText(cyr("Pretplata je pauzirana"));
      await expect(page.locator(".account-pause-info")).toContainText(fmt(pauseUntil));
      await expect(page.getByRole("button", { name: cyr("Nastavi pretplatu") })).toBeVisible();
      await expect(page.locator(".account-subscription .account-package")).toContainText(COUNTS(4, 0, 4));
      const { sub: state } = await accountState(page);
      expect(state.status, phase).toBe("paused");
      expect(state.pauseUntil).toBe(pauseUntil);
    }
    // While paused the quick actions are not offered.
    await expect(page.getByRole("button", { name: new RegExp(`^${cyr("Preskoči sledeću")}`) })).toHaveCount(0);
  });

  await test.step("resume", async () => {
    await page.getByRole("button", { name: cyr("Nastavi pretplatu") }).click();
    await expect(page.getByRole("status").filter({ hasText: cyr("Pretplata je ponovo aktivna") })).toBeVisible();
    for (const phase of ["now", "after reload"]) {
      if (phase === "after reload") await page.reload();
      await expect(page.locator(".account-subscription .account-status")).toHaveText(cyr("Aktivna"));
      await expect(page.getByRole("button", { name: cyr("Nastavi pretplatu") })).toHaveCount(0);
      const { sub } = await accountState(page);
      expect(sub.status, phase).toBe("active");
      expect(sub.pauseUntil).toBeNull();
      expect(sub.packageSummary).toMatchObject({ purchased: 4, realized: 0, remaining: 4 });
      // The skipped week is not "given back" by resuming: the next date is not before the skipped one.
      expect(sub.nextDeliveryDate >= afterSkip).toBe(true);
    }
  });

  const { sub: beforeAdd } = await accountState(page);
  const nextDate = beforeAdd.nextDeliveryDate as string;
  const remaining = beforeAdd.packageSummary.openForAdditions ?? beforeAdd.packageSummary.remaining;
  expect(remaining).toBeGreaterThan(0);

  // ---- 3a. Add 1 L only for the next delivery: surcharge 1 x 250.
  await test.step("add one litre for the next delivery only", async () => {
    const sub = page.locator(".account-subscription").first();
    await sub.locator("summary").filter({ hasText: cyr("Dodaj nešto samo sledećoj dostavi") }).click();
    const picker = sub.getByRole("region", { name: cyr("Dodaj sledećoj dostavi") });
    await picker.getByLabel(cyr("Količina dodatka")).fill("1");
    await picker.getByRole("button", { name: new RegExp(cyr("Domaće kravlje mleko")) }).click();
    const surcharge = page.getByRole("region", { name: cyr("Doplata pre potvrde") });
    await expect(surcharge).toContainText(cyr("Dodaješ 1 × Domaće kravlje mleko"));
    await expect(surcharge.locator(".account-surcharge-math")).toContainText(`${rsd(250)}`);
    await expect(surcharge.locator(".account-surcharge-math")).toContainText(cyr("za jednu dostavu"));
    await expect(surcharge.locator(".account-surcharge-math")).toContainText(`= ${rsd(250)}`);
    await surcharge.getByRole("button", { name: new RegExp(`${cyr("Potvrdi doplatu")} .*${rsd(250)}`) }).click();
    await expect(page.getByRole("status").filter({ hasText: cyr("Dodato samo dostavi za") })).toContainText(fmt(nextDate));
    for (const phase of ["now", "after reload"]) {
      if (phase === "after reload") await page.reload();
      await expect(page.locator(".next-addon-summary")).toContainText(cyr("Dodato samo sledećoj dostavi"));
      await expect(page.locator(".next-addon-summary")).toContainText(`1 × ${cyr("Domaće kravlje mleko")}`);
      const { sub: state } = await accountState(page);
      expect(state.nextOnlyAddons, phase).toHaveLength(1);
      expect(state.nextOnlyAddons[0].quantity).toBe(1);
      expect(state.items[0].quantity, "a one-off addition does not change the regular quantity").toBe(2);
    }
  });

  // ---- 3b. Add 1 L regularly: surcharge = 1 x 250 x remaining deliveries of the package.
  await test.step("add one litre regularly", async () => {
    const sub = page.locator(".account-subscription").first();
    await sub.getByRole("button", { name: new RegExp(`^${cyr("Povećaj količinu")}`) }).click();
    await sub.getByRole("button", { name: new RegExp(`^${cyr("Dodaj 1 ×")}`) }).click();
    const surcharge = page.getByRole("region", { name: cyr("Doplata pre potvrde") });
    await expect(surcharge).toContainText(cyr("Sa 2 na 3 po dostavi."));
    // Regular is the default scope; the label states how many paid deliveries are left.
    const regularLabel = surcharge.locator("label").filter({ hasText: cyr("Redovno, sve preostale dostave paketa") });
    const labelText = (await regularLabel.innerText());
    const shownRemaining = Number(labelText.match(/\((\d+)\)/)![1]);
    expect(shownRemaining).toBe(remaining);
    const amount = 250 * shownRemaining;
    await expect(surcharge.locator(".account-surcharge-math")).toContainText(`+1 × ${rsd(250)}`);
    await expect(surcharge.locator(".account-surcharge-math")).toContainText(`${shownRemaining}`);
    await expect(surcharge.locator(".account-surcharge-math")).toContainText(`= ${rsd(amount)}`);
    await surcharge.getByRole("button", { name: new RegExp(`${cyr("Potvrdi doplatu")} .*${rsd(amount)}`) }).click();
    await expect(page.getByRole("status").filter({ hasText: cyr("Dodato u sve preostale dostave paketa") })).toBeVisible();
    for (const phase of ["now", "after reload"]) {
      if (phase === "after reload") await page.reload();
      await expect(page.locator(".account-subscription").first().locator(".account-quantity-field output")).toHaveText("3");
      const { body, sub: state } = await accountState(page);
      expect(state.items[0].quantity, phase).toBe(3);
      const surchargeOrders = body.orders.filter((order: Json) => order.surcharge);
      expect(surchargeOrders.map((order: Json) => order.total_minor).sort()).toEqual([25000, amount * 100].sort());
    }
  });

  // Back office: the next delivery packs 3 L regular + 1 L added for that delivery only
  // (the list only ever projects the single next delivery of a subscription).
  await test.step("the next delivery in the back office carries the additions", async () => {
    const token = await adminToken(request);
    const next = await stopFor(request, token, nextDate, customer.fullName);
    expect(next.litres, "3 regular + 1 one-off litres").toBe(4);
  });

  // ---- 4. A decrease is not offered in the UI and is rejected by the server.
  await test.step("decrease is not possible", async () => {
    const sub = page.locator(".account-subscription").first();
    await expect(sub.getByRole("button", { name: new RegExp(`^${cyr("Smanji količinu")}`) })).toBeDisabled();
    await expect(sub).toContainText(cyr("Plaćenu količinu ne možeš da smanjiš."));
    const { sub: state } = await accountState(page);
    const rejected = await page.request.patch(`/api/account/subscriptions/${encodeURIComponent(state.id)}`, {
      headers: { Origin: ORIGIN, "Idempotency-Key": crypto.randomUUID() },
      data: { action: "update_item", itemId: state.items[0].id, quantity: 1, expectedVersion: state.version },
    });
    expect(rejected.status(), await rejected.text()).toBeGreaterThanOrEqual(400);
    const removal = await page.request.patch(`/api/account/subscriptions/${encodeURIComponent(state.id)}`, {
      headers: { Origin: ORIGIN, "Idempotency-Key": crypto.randomUUID() },
      data: { action: "remove_item", itemId: state.items[0].id, expectedVersion: state.version },
    });
    expect(removal.status(), await removal.text()).toBeGreaterThanOrEqual(400);
    expect((await accountState(page)).sub.items[0].quantity).toBe(3);
  });

  // ---- 5. Cancel the renewal of a PAID package: the 4 paid deliveries stay scheduled.
  await test.step("cancel renewal after the package is paid", async () => {
    const token = await adminToken(request);
    const { body } = await accountState(page);
    const packageOrder = body.orders.find((order: Json) => order.role === "package" || order.kind === "subscription_invoice");
    const paid = await request.patch("/api/admin/orders", { headers: { Authorization: `Bearer ${token}` }, data: { id: packageOrder.id, paymentStatus: "paid" } });
    expect(paid.status(), await paid.text()).toBe(200);
    await page.reload();
    const sub = page.locator(".account-subscription").first();
    await sub.getByRole("button", { name: cyr("Otkaži pretplatu"), exact: true }).click();
    const confirmation = page.getByRole("region", { name: cyr("Potvrda izmene") });
    await expect(confirmation).toContainText(cyr("Otkazati obnovu pretplate?"));
    await expect(confirmation).toContainText(cyr("Preostale plaćene dostave paketa stižu kao i do sada."));
    await confirmation.getByRole("button", { name: cyr("Potvrdi otkazivanje") }).click();
    for (const phase of ["now", "after reload"]) {
      if (phase === "after reload") await page.reload();
      await expect(page.locator(".account-subscription")).toContainText(cyr("Obnova je otkazana. Preostale plaćene dostave ostaju zakazane."));
      const { sub: state } = await accountState(page);
      expect(state.renewalEnabled, phase).toBe(false);
      expect(state.status, "paid deliveries are still delivered").toBe("active");
      expect(state.packageSummary.remaining).toBe(4);
    }
  });
  await noHorizontalScroll(page, "account after actions");
});

test("TP-3b account: cancelling a subscription whose package is not yet paid cancels it and the account says so after a reload", async ({ page, context, request }) => {
  test.setTimeout(120_000);
  await freshIp(context);
  const customer = newCustomer("otkaz");
  await buySubscription(request, customer, { litres: 2 });
  await signInWithCode(page, customer.email);
  const sub = page.locator(".account-subscription").first();
  await sub.getByRole("button", { name: cyr("Otkaži pretplatu"), exact: true }).click();
  const confirmation = page.getByRole("region", { name: cyr("Potvrda izmene") });
  await expect(confirmation).toContainText(cyr("Otkazati redovnu dostavu?"));
  await confirmation.getByRole("button", { name: cyr("Potvrdi otkazivanje") }).click();
  await expect(page.getByRole("status").filter({ hasText: cyr("Pretplata je otkazana") })).toBeVisible();
  await page.reload();
  await expect(page.locator(".account-subscription .account-status")).toHaveText(cyr("Otkazana"));
  await expect(page.getByRole("button", { name: cyr("Otkaži pretplatu"), exact: true })).toHaveCount(0);
  expect((await accountState(page)).sub.status).toBe("cancelled");
});

test("TP-3c account: pause limits - a date past three months or not after the next delivery cannot be confirmed", async ({ page, context, request }) => {
  test.setTimeout(120_000);
  await freshIp(context);
  const customer = newCustomer("pauza");
  const { deliveryDate } = await buySubscription(request, customer, { litres: 2 });
  await signInWithCode(page, customer.email);
  const sub = page.locator(".account-subscription").first();
  await sub.getByRole("button", { name: new RegExp(`^${cyr("Pauziraj dostave")}`) }).click();
  const confirmation = page.getByRole("region", { name: cyr("Potvrda izmene") });
  const input = confirmation.getByLabel(cyr("Nastavak dostava od"));
  const confirm = confirmation.getByRole("button", { name: cyr("Potvrdi pauzu") });
  await input.fill(deliveryDate);
  await expect(confirm).toBeDisabled();
  await input.fill(addDaysIso(deliveryDate, 200));
  await expect(confirm).toBeDisabled();
  await input.fill(addDaysIso(deliveryDate, 14));
  await expect(confirm).toBeEnabled();
  // Server side, a pause that is too long is refused too (no UI bypass).
  const { sub: state } = await accountState(page);
  const tooLong = await page.request.patch(`/api/account/subscriptions/${encodeURIComponent(state.id)}`, {
    headers: { Origin: ORIGIN, "Idempotency-Key": crypto.randomUUID() },
    data: { action: "pause", pauseUntil: addDaysIso(deliveryDate, 200), expectedVersion: state.version },
  });
  expect(tooLong.status()).toBeGreaterThanOrEqual(400);
  expect((await accountState(page)).sub.status).toBe("active");
});
