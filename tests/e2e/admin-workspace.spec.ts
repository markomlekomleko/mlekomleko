import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const origin = "http://localhost:4173";
const testIp = () =>
  `2001:db8:${crypto
    .randomUUID()
    .replaceAll("-", "")
    .match(/.{1,4}/g)!
    .slice(0, 6)
    .join(":")}`;
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "cf-connecting-ip": testIp() });
});
async function access(request: APIRequestContext) {
  const response = await request.post("/api/admin/access", {
    headers: { Origin: origin, "cf-connecting-ip": testIp() },
    data: { email: "admin@example.test", password: "e2e-admin-password" },
  });
  expect(response.ok()).toBe(true);
  return {
    Origin: origin,
    Authorization: `Bearer ${(await response.json()).sessionToken}`,
  };
}
async function login(page: Page) {
  await page.goto("/admin");
  const consent = page.getByRole("button", { name: "Samo neophodno" });
  if (await consent.isVisible()) await consent.click();
  await page.getByLabel("Email", { exact: true }).fill("admin@example.test");
  await page.getByLabel("Lozinka", { exact: true }).fill("e2e-admin-password");
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sve je na svom mestu." }),
  ).toBeVisible();
}
const customer = (name: string) => ({
  fullName: name,
  phone: "0601234567",
  addressLine1: "Test 12",
  city: "Beograd",
  postalCode: "11000",
});

test("manual order API validates access, totals, idempotency, dates and missing email", async ({
  request,
}) => {
  const headers = await access(request);
  const options = await (
    await request.get("/api/admin/orders/quote", { headers })
  ).json();
  const date = options.dates[options.dates.length - 3];
  const payload = {
    customer: customer(`Ručni kupac ${crypto.randomUUID()}`),
    deliveryDate: date,
    items: [
      { productId: "prod_kravlje_1l", quantity: 4, purchaseType: "one_time" },
    ],
  };
  expect(
    (await request.post("/api/admin/orders", { data: payload })).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/admin/orders", {
        headers: { ...headers, Origin: "https://example.invalid" },
        data: payload,
      })
    ).status(),
  ).toBe(403);
  const key = crypto.randomUUID();
  const create = () =>
    request.post("/api/admin/orders", {
      headers: { ...headers, "Idempotency-Key": key },
      data: payload,
    });
  const response = await create();
  expect(response.status()).toBe(201);
  const first = await response.json();
  const replay = await create();
  expect(replay.status()).toBe(201);
  expect((await replay.json()).order.id).toBe(first.order.id);
  const conflict = await request.post("/api/admin/orders", {
    headers: { ...headers, "Idempotency-Key": key },
    data: { ...payload, customer: customer("Drugo ime") },
  });
  expect(conflict.status()).toBe(409);
  const quote = await (
    await request.post("/api/admin/orders/quote", {
      headers,
      data: { items: payload.items, deliveryDate: date },
    })
  ).json();
  expect(first.order.totalMinor).toBe(quote.totalMinor);
  const preview = await (
    await request.get(`/api/admin/delivery-preview?date=${date}`, { headers })
  ).json();
  expect(
    preview.orders.some(
      (o: { source_order_id: string }) => o.source_order_id === first.order.id,
    ),
  ).toBe(true);
  for (const change of [
    { items: [{ ...payload.items[0], quantity: 0 }] },
    { items: [{ ...payload.items[0], productId: "missing-product" }] },
    { customer: { ...payload.customer, postalCode: "99999" } },
    { deliveryDate: "2020-01-01" },
    { notify: true },
    { paymentMethod: "card" },
    { cardNumber: "4111111111111111" },
  ]) {
    const bad = await request.post("/api/admin/orders", {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: { ...payload, ...change },
    });
    expect(bad.status()).toBeGreaterThanOrEqual(400);
    expect(bad.status()).toBeLessThan(500);
  }
  const exportResponse = await request.get(
    `/api/admin/deliveries/export?date=${date}&format=csv`,
    { headers },
  );
  expect(exportResponse.ok()).toBe(true);
  expect(await exportResponse.text()).not.toContain("@manual.invalid");
  const lock = await request.post("/api/admin/deliveries", {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data: { action: "lock", date, force: true },
  });
  expect(lock.ok()).toBe(true);
  expect(
    (
      await request.post("/api/admin/orders", {
        headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
        data: payload,
      })
    ).status(),
  ).toBe(409);
});

test("admin manages subscription quantities, skips and pauses with version protection", async ({
  request,
}) => {
  const headers = await access(request),
    options = await (
      await request.get("/api/admin/orders/quote", { headers })
    ).json();
  const date = options.dates[2];
  const response = await request.post("/api/admin/orders", {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data: {
      customer: {
        ...customer("Redovni ručni kupac"),
        email: `regular-${crypto.randomUUID()}@example.test`,
      },
      deliveryDate: date,
      items: [
        {
          productId: "prod_kravlje_1l",
          quantity: 2,
          purchaseType: "subscription",
          cadence: "biweekly",
        },
      ],
    },
  });
  expect(response.status()).toBe(201);
  const { subscription } = await response.json();
  const list = await (
    await request.get("/api/admin/subscriptions", { headers })
  ).json();
  const sub = list.subscriptions.find(
    (s: { id: string }) => s.id === subscription.id,
  );
  const id = sub.customer_id;
  const account = () =>
    request
      .get(`/api/admin/customers/${id}`, { headers })
      .then((r) => r.json());
  let state = await account();
  const change = (data: Record<string, unknown>) =>
    request.patch(`/api/admin/subscriptions/${sub.id}`, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data,
    });
  let s = state.subscriptions[0];
  expect(
    (
      await change({
        action: "update_item",
        expectedVersion: s.version,
        itemId: s.items[0].id,
        quantity: 5,
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await change({ action: "skip_next", expectedVersion: s.version })
    ).status(),
  ).toBe(409);
  state = await account();
  s = state.subscriptions[0];
  expect(s.items[0].quantity).toBe(5);
  expect(
    (await change({ action: "skip_next", expectedVersion: s.version })).ok(),
  ).toBe(true);
  let preview = await (
    await request.get(`/api/admin/delivery-preview?date=${date}`, { headers })
  ).json();
  expect(
    preview.orders.some(
      (o: { subscription_id: string }) => o.subscription_id === sub.id,
    ),
  ).toBe(false);
  expect(preview.excluded.some((o: { id: string }) => o.id === sub.id)).toBe(
    true,
  );
  state = await account();
  s = state.subscriptions[0];
  const until = new Date(Date.parse(s.nextDeliveryDate) + 9 * 86400000)
    .toISOString()
    .slice(0, 10);
  expect(
    (
      await change({
        action: "pause",
        expectedVersion: s.version,
        pauseUntil: until,
      })
    ).ok(),
  ).toBe(true);
  state = await account();
  s = state.subscriptions[0];
  expect(s.status).toBe("paused");
  expect(s.nextDeliveryDate >= until).toBe(true);
  expect(
    (await change({ action: "resume", expectedVersion: s.version })).ok(),
  ).toBe(true);
  state = await account();
  expect(state.subscriptions[0].status).toBe("active");
  expect(
    state.changes.some(
      (c: { actor_type: string; action: string }) =>
        c.actor_type === "admin" && c.action === "subscription.pause",
    ),
  ).toBe(true);
  preview = await (
    await request.get(
      `/api/admin/delivery-preview?date=${state.subscriptions[0].nextDeliveryDate}`,
      { headers },
    )
  ).json();
  expect(
    preview.orders.some(
      (o: { subscription_id: string }) => o.subscription_id === sub.id,
    ),
  ).toBe(true);
  expect(
    (
      await request.patch(`/api/admin/customers/${id}`, {
        headers,
        data: { ...customer("Izmenjeno ime"), addressLine1: "Nova adresa 22" },
      })
    ).ok(),
  ).toBe(true);
  expect((await account()).customer.address_line_1).toBe("Nova adresa 22");
});

test("insights use real paid orders and reminder preview never sends in local mode", async ({
  request,
}) => {
  const headers = await access(request);
  const before = await (
    await request.get("/api/admin/insights", { headers })
  ).json();
  const result = await request.post("/api/admin/orders", {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data: {
      customer: customer("Analitika kupac"),
      items: [
        { productId: "prod_kravlje_1l", quantity: 3, purchaseType: "one_time" },
      ],
    },
  });
  expect(result.status()).toBe(201);
  const { order } = await result.json();
  const unpaid = await (
    await request.get("/api/admin/insights", { headers })
  ).json();
  expect(unpaid.totals.paidMinor).toBe(before.totals.paidMinor);
  expect(unpaid.totals.orders).toBe(before.totals.orders + 1);
  expect(
    (
      await request.patch("/api/admin/orders", {
        headers,
        data: { id: order.id, paymentStatus: "paid" },
      })
    ).ok(),
  ).toBe(true);
  const paid = await (
    await request.get("/api/admin/insights", { headers })
  ).json();
  expect(paid.totals.paidMinor).toBe(
    before.totals.paidMinor + order.totalMinor,
  );
  expect(
    paid.products.some(
      (p: { product_id: string; units: number }) =>
        p.product_id === "prod_kravlje_1l" && Number(p.units) >= 3,
    ),
  ).toBe(true);
  expect(
    (
      await request.get("/api/admin/insights?from=2025-01-01&to=2026-12-31", {
        headers,
      })
    ).status(),
  ).toBe(422);
  const tomorrow = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + 86400000));
  const reminders = await (
    await request.get(`/api/admin/reminders?date=${tomorrow}`, { headers })
  ).json();
  expect(reminders.emailAvailable).toBe(false);
  expect(reminders.eligible).toBe(true);
  const send = await request.post("/api/admin/reminders", {
    headers,
    data: { date: tomorrow },
  });
  expect(send.status()).toBe(422);
  expect((await send.json()).error.code).toBe("EMAIL_NOT_CONFIGURED");
});

test("simple admin UI creates an order, shows customer details, charts and mobile-safe navigation", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  await login(page);
  await expect(page.locator("header[data-hero-header]")).toHaveCount(0);
  await expect(
    page.locator("footer").filter({ hasText: "Korisne informacije" }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "Administracija" })
      .getByRole("button"),
  ).toHaveCount(5);
  await expect(
    page.getByRole("heading", { name: "Kako ide prodaja?" }),
  ).toBeVisible();
  await page.getByLabel("Period analitike").selectOption("7");
  await page
    .getByRole("button", { name: "+ Nova porudžbina", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Nova porudžbina" });
  const name = `Telefon ${testInfo.project.name} ${Date.now()}`;
  await dialog.getByLabel("Ime i prezime", { exact: true }).fill(name);
  await dialog.getByLabel("Telefon", { exact: true }).fill("0609876543");
  await dialog.getByLabel("Adresa", { exact: true }).fill("Primer 18");
  await dialog.getByLabel("Poštanski broj").fill("11000");
  await dialog.getByRole("button", { name: "Dalje →" }).click();
  await dialog
    .getByLabel("Količina: Domaće kravlje mleko", { exact: true })
    .fill("4");
  await dialog.getByRole("button", { name: "Dalje →" }).click();
  await expect(
    dialog.getByRole("button", { name: "Sačuvaj porudžbinu" }),
  ).toBeEnabled();
  await expect(dialog.getByLabel("Pošalji potvrdu emailom")).toBeDisabled();
  await dialog.getByLabel("Napomena za vozača").fill("Pozvati na ulazu");
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/admin/orders") &&
      response.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Sačuvaj porudžbinu" }).click();
  const { order } = await (await saved).json();
  const headers = await access(request);
  expect(
    (
      await request.patch("/api/admin/orders", {
        headers,
        data: { id: order.id, paymentStatus: "paid" },
      })
    ).ok(),
  ).toBe(true);
  await expect(
    page.getByRole("heading", { name: /Dodato u dostavu/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Otvori dostave", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: name, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Za vozača", exact: true }).click();
  await expect(
    page.locator(".work-route-card").filter({ hasText: name }),
  ).toContainText("Pozvati na ulazu");
  await page
    .getByRole("navigation", { name: "Administracija" })
    .getByRole("button", { name: "Kupci", exact: true })
    .click();
  await page.getByLabel("Pronađi kupca").fill(name);
  await page.locator(".work-customer-card").filter({ hasText: name }).click();
  await expect(
    page.getByRole("dialog").getByText("Bez email adrese", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zatvori", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Administracija" })
    .getByRole("button", { name: "Pregled", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sve je na svom mestu." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await expect(page.locator('svg[role="group"] a').first()).toBeVisible();
  const audit = await new AxeBuilder({ page })
    .include(".admin-app")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    audit.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    ),
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("admin-overview.png"),
    fullPage: true,
  });
});

test("admin UI manages an existing customer subscription and confirms a locked delivery", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  const headers = await access(request),
    options = await (
      await request.get("/api/admin/orders/quote", { headers })
    ).json();
  const date = options.dates[3];
  const name = `Redovna UI ${testInfo.project.name} ${Date.now()}`;
  const created = await request.post("/api/admin/orders", {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data: {
      customer: customer(name),
      deliveryDate: date,
      items: [
        {
          productId: "prod_kravlje_1l",
          quantity: 2,
          purchaseType: "subscription",
          cadence: "weekly",
        },
      ],
    },
  });
  expect(created.status()).toBe(201);
  await login(page);
  await page
    .getByRole("navigation", { name: "Administracija" })
    .getByRole("button", { name: "Kupci", exact: true })
    .click();
  await page.getByLabel("Pronađi kupca").fill(name);
  await page.locator(".work-customer-card").filter({ hasText: name }).click();
  const detail = page.getByRole("dialog");
  await detail.getByRole("button", { name: "Promeni količinu" }).click();
  await detail.getByLabel("Nova količina po dostavi").fill("6");
  await detail.getByRole("button", { name: "Potvrdi promenu" }).click();
  await expect(detail.locator(".work-subscription")).toContainText("6 × 1 L");
  await detail.getByRole("button", { name: "Preskoči termin" }).click();
  await expect(detail.locator(".work-review")).toContainText("Sledeći termin");
  await detail.getByRole("button", { name: "Potvrdi promenu" }).click();
  await expect(
    detail.getByRole("heading", { name: "Pauze i promene" }),
  ).toBeVisible();
  await expect(
    detail.locator(".work-history-row").filter({ hasText: "Preskočen termin" }),
  ).toHaveCount(1);
  await detail.getByRole("button", { name: "Pauziraj", exact: true }).click();
  await expect(detail.locator(".work-review")).toContainText(
    "Sledeća dostava po rasporedu",
  );
  await detail.getByRole("button", { name: "Potvrdi promenu" }).click();
  await expect(
    detail.getByRole("button", { name: "Nastavi dostavu" }),
  ).toBeVisible();
  await detail.getByRole("button", { name: "Nastavi dostavu" }).click();
  await detail.getByRole("button", { name: "Potvrdi promenu" }).click();
  await expect(
    detail.getByRole("button", { name: "Pauziraj", exact: true }),
  ).toBeVisible();
  await detail.getByRole("button", { name: "Izmeni kontakt i adresu" }).click();
  await detail.getByLabel("Adresa", { exact: true }).fill("Nova ulica 33");
  await detail.getByRole("button", { name: "Sačuvaj kontakt" }).click();
  await expect(detail.locator(".work-contact")).toContainText("Nova ulica 33");
  await detail.getByRole("button", { name: "+ Nova porudžbina" }).click();
  const manual = page.getByRole("dialog", { name: "Nova porudžbina" });
  await expect(manual.getByLabel("Ime i prezime", { exact: true })).toHaveValue(
    name,
  );
  await expect(manual.getByLabel("Adresa", { exact: true })).toHaveValue(
    "Nova ulica 33",
  );
  await manual.getByRole("button", { name: "Dalje →" }).click();
  await manual
    .getByLabel("Količina: Domaće kozje mleko", { exact: true })
    .fill("2");
  await manual.getByRole("button", { name: "Dalje →" }).click();
  await manual.getByLabel("Koliko često?").selectOption("biweekly");
  const farDate = options.dates[options.dates.length - 2];
  await manual.getByLabel("Datum dostave").selectOption(farDate);
  await expect(
    manual.getByRole("button", { name: "Sačuvaj porudžbinu" }),
  ).toBeEnabled();
  await manual.getByRole("button", { name: "Sačuvaj porudžbinu" }).click();
  await page
    .getByRole("button", { name: "Otvori dostave", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Završi pripremu", exact: true })
    .click();
  const confirm = page.getByRole("dialog", { name: "Završi pripremu" });
  await expect(confirm).toContainText(
    "Posle ovoga promene neće menjati spisak",
  );
  await confirm
    .getByRole("button", { name: "Potvrdi i zaključaj spisak" })
    .click();
  await expect(
    page.getByText("Spisak je zaključan", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Završi pripremu", exact: true }),
  ).toBeDisabled();
});
