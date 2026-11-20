import { expect, test } from "@playwright/test";
import { cyr } from "./cyr";

test("guest email code unlocks permanent subscription additions and one-time editing", async ({
  page,
  context,
}) => {
  const origin = `http://localhost:${process.env.E2E_PORT || "4173"}`;
  const ip = `2001:db8:${crypto
    .randomUUID()
    .replaceAll("-", "")
    .match(/.{1,4}/g)!
    .slice(0, 6)
    .join(":")}`;
  await context.setExtraHTTPHeaders({ "cf-connecting-ip": ip });
  const storefront = await (await page.request.get("/api/storefront")).json();
  // The cow milk specifically: a product left published by another spec must not change the prices checked here.
  const product = storefront.products.find(
    (value: { id: string; allowSubscription: boolean }) => value.id === "prod_kravlje_1l" && value.allowSubscription,
  );
  const deliveryDate = new Date(
    Date.parse(storefront.delivery.deliveryDate + "T12:00:00Z") + 28 * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  const email = `self-service-${crypto.randomUUID()}@example.test`;
  const customer = {
    email,
    fullName: "Samostalni Kupac",
    phone: "0601234567",
    addressLine1: "Test 12",
    city: "Beograd",
    postalCode: "11000",
  };
  const order = await page.request.post("/api/checkout", {
    headers: { Origin: origin, "Idempotency-Key": crypto.randomUUID() },
    data: {
      customer,
      deliveryDate,
      paymentMethod: "cash",
      items: [{ productId: product.id, quantity: 2, purchaseType: "one_time" }],
    },
  });
  expect(order.status()).toBe(201);
  const orderData = await order.json();
  const subscription = await page.request.post("/api/checkout", {
    headers: { Origin: origin, "Idempotency-Key": crypto.randomUUID() },
    data: {
      customer,
      deliveryDate,
      paymentMethod: "cash",
      items: [
        {
          productId: product.id,
          quantity: 2, // the minimum per delivery is 2 L
          purchaseType: "subscription",
          cadence: "weekly",
        },
      ],
    },
  });
  expect(subscription.status()).toBe(201);
  await page.goto("/prijava");
  const consent = page.getByRole("button", { name: cyr("Samo neophodno") });
  if (await consent.isVisible()) await consent.click();
  await page.getByLabel(cyr("Email adresa")).fill(email);
  await page
    .getByRole("button", { name: cyr("Pošalji kod za prijavu"), exact: true })
    .click();
  const code = page.getByTestId("local-auth-code").locator("strong");
  await expect(code).toHaveText(/^\d{6}$/);
  await page.getByLabel(cyr("Šestocifreni kod")).fill((await code.textContent())!);
  await page.getByRole("button", { name: cyr("Potvrdi kod"), exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `${cyr("Zdravo,")} Samostalni Kupac` }),
  ).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: cyr("Dodaj proizvod u redovnu dostavu") })
    .click();
  await page.getByLabel(cyr("Proizvod za redovnu dostavu")).selectOption(product.id);
  await page.getByRole("spinbutton", { name: cyr("Količina po dostavi"), exact: true }).fill("2");
  // Adding litres is a two-step action now: the surcharge is calculated first, then confirmed.
  await page.getByRole("button", { name: cyr("Izračunaj doplatu"), exact: true }).click();
  // 2 L x 250 RSD x the 4 deliveries still left in the package = 2.000 RSD.
  await expect(page.getByText(cyr("Doplata: +2 × 250 RSD × 4 dostave = 2.000 RSD"), { exact: false })).toBeVisible();
  const mutationResponse = page.waitForResponse(response => response.request().method() === "PATCH" && response.url().includes("/api/account/subscriptions/"));
  await page
    .getByRole("button", { name: new RegExp(`^${cyr("Potvrdi doplatu")}`) })
    .click();
  const mutation = await mutationResponse;
  expect(mutation.ok(), await mutation.text()).toBe(true);
  // The quantity is a read-only counter (it can only grow): 2 L per delivery + 2 L added permanently.
  await expect(
    page.getByRole("status", { name: cyr("Količina po dostavi"), exact: true }),
  ).toHaveText("4");
  await expect(page.locator("#porudzbine")).toBeVisible();
  await page
    .getByRole("button", {
      // The order number is deliberately not part of the match: the storefront currently
      // transliterates it to Cyrillic (reported as a product bug).
      name: new RegExp(`^${cyr("Otvori porudžbinu")} `),
    })
    .click();
  await page
    .getByRole("button", { name: cyr("Izmeni proizvode i količine"), exact: true })
    .click();
  const editor = page.getByRole("region", { name: cyr("Izmena porudžbine") });
  await editor.getByLabel(new RegExp(cyr(product.name))).fill("4");
  await expect(editor.getByText(new RegExp(cyr("Novi iznos:")))).toBeVisible();
  await editor
    .getByRole("button", { name: cyr("Sačuvaj porudžbinu"), exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: cyr("Porudžbina je ažurirana.") }),
  ).toBeVisible();
  const detail = await (
    await page.request.get(`/api/account/orders/${orderData.order.id}`)
  ).json();
  expect(detail.items[0].quantity).toBe(4);
  await expect(page.locator("#porudzbine")).toBeVisible();
  await page
    .getByRole("button", {
      // The order number is deliberately not part of the match: the storefront currently
      // transliterates it to Cyrillic (reported as a product bug).
      name: new RegExp(`^${cyr("Otvori porudžbinu")} `),
    })
    .click();
  await page
    .getByRole("button", { name: cyr("Otkaži ovu porudžbinu"), exact: true })
    .click();
  await page
    .getByRole("button", {
      name: cyr("Potvrdi otkazivanje porudžbine"),
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: cyr("Porudžbina je ažurirana.") }),
  ).toBeVisible();
  expect(
    (
      await (
        await page.request.get(`/api/account/orders/${orderData.order.id}`)
      ).json()
    ).order.fulfillment_status,
  ).toBe("cancelled");
});

test("admin edits an existing one-time order using the same server quote", async ({
  page,
  context,
}) => {
  const origin = `http://localhost:${process.env.E2E_PORT || "4173"}`;
  await context.setExtraHTTPHeaders({
    "cf-connecting-ip": `2001:db8:${crypto
      .randomUUID()
      .replaceAll("-", "")
      .match(/.{1,4}/g)!
      .slice(0, 6)
      .join(":")}`,
  });
  const storefront = await (await page.request.get("/api/storefront")).json();
  const product = storefront.products.find((value: { id: string }) => value.id === "prod_kravlje_1l");
  const earliestDate = new Date(
    Date.parse(storefront.delivery.deliveryDate + "T12:00:00Z") + 35 * 86400000,
  ).toISOString().slice(0, 10);
  // Earlier admin scenarios can close routes; use a genuinely open future date.
  const schedule = await (await page.request.get("/api/delivery-options?city=Beograd&postalCode=11000")).json();
  const deliveryDate = schedule.dates.find((date: string) => date >= earliestDate);
  expect(deliveryDate).toBeTruthy();
  const response = await page.request.post("/api/checkout", {
    headers: { Origin: origin, "Idempotency-Key": crypto.randomUUID() },
    data: {
      customer: {
        email: `admin-edit-${crypto.randomUUID()}@example.test`,
        fullName: "Izmena Kupca",
        phone: "0601234567",
        addressLine1: "Test 2",
        city: "Beograd",
        postalCode: "11000",
      },
      deliveryDate,
      paymentMethod: "cash",
      items: [{ productId: product.id, quantity: 2, purchaseType: "one_time" }], // 2 L is the minimum
    },
  });
  expect(response.status()).toBe(201);
  const { order } = await response.json();
  await page.goto("/admin");
  await page.getByLabel("Email", { exact: true }).fill("admin@example.test");
  await page.getByLabel("Lozinka", { exact: true }).fill("e2e-admin-password");
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Administracija" })
    .getByRole("button", { name: "Porudžbine", exact: true })
    .click();
  await page.getByLabel("Pretraga porudžbina").fill(order.orderNumber);
  await page
    .getByRole("button", { name: "Primeni filtere", exact: true })
    .click();
  await page
    .getByRole("button", { name: `${order.orderNumber} →`, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Izmeni proizvode i količine", exact: true })
    .click();
  await dialog.getByLabel(new RegExp(product.name)).fill("5");
  await expect(dialog.getByText(/Novi iznos:/)).toBeVisible();
  await dialog
    .getByRole("button", { name: "Sačuvaj porudžbinu", exact: true })
    .click();
  await expect(
    dialog.getByText(`5 × ${product.unitLabel} ${product.name}`, {
      exact: false,
    }),
  ).toBeVisible();
});
