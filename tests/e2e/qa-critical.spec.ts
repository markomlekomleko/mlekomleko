import { expect, test, type APIRequestContext } from "@playwright/test";

// Agent F: the same critical contracts as tests/qa-*.test.mjs, but executed against the real
// Next.js runtime (the domain suites run the Vinext worker bundle). Own DB, own server (port 4173).
// Run: npx playwright test tests/e2e/qa-critical.spec.ts --project=desktop-1440
// Data prefix: TEST-F-. The e2e server has PAYMENT_MODE=disabled, EMAIL_MODE=console, BADI_MODE=mock.

const ORIGIN = `http://localhost:${process.env.E2E_PORT || "4173"}`;
const ADMIN = { email: "admin@example.test", password: "e2e-admin-password" };
const unique = () => crypto.randomUUID().slice(0, 8);
// All three viewport projects share one server and database, and rate-limit windows last
// 15 minutes, so every test needs an address (and a throttled identity) of its own.
const address = () => `2001:db8:f${unique().slice(0, 3)}::${unique().slice(0, 4)}`;
const headers = (ip: string, extra: Record<string, string> = {}) => ({
  Origin: ORIGIN,
  "cf-connecting-ip": ip,
  ...extra,
});
const customer = (email: string) => ({
  email,
  fullName: "TEST-F Kupac",
  phone: "+381600000000",
  addressLine1: "TEST-F ulica 1",
  city: "Beograd",
  postalCode: "11000",
});
const cashBody = (email: string, quantity = 2, extra: Record<string, unknown> = {}) => ({
  customer: customer(email),
  items: [{ productId: "prod_kravlje_1l", quantity, purchaseType: "one_time" }],
  paymentMethod: "cash",
  ...extra,
});

async function signIn(request: APIRequestContext, email: string, ip: string) {
  const registered = await request.post("/api/auth/register", { data: { email }, headers: headers(ip) });
  expect(registered.status()).toBe(202);
  const challenge = await registered.json();
  const verified = await request.post("/api/auth/code/verify", {
    data: { challengeId: challenge.challengeId, code: challenge.localDevelopment.code },
    headers: headers(ip),
  });
  expect(verified.status()).toBe(200);
  return { challenge, verified };
}

test("F-E01 customer session: HttpOnly cookie, CSRF refusal, logout revokes the session server-side", async ({ request, page }) => {
  const ip = address();
  const email = `test-f-${unique()}@example.test`;
  const { verified } = await signIn(request, email, ip);
  const cookie = verified.headers()["set-cookie"];
  expect(cookie).toMatch(/^mm_session=/);
  expect(cookie).toMatch(/HttpOnly/);
  expect(cookie).toMatch(/SameSite=Lax/);
  const account = await request.get("/api/account");
  expect(account.status()).toBe(200);
  expect((await account.json()).customer.email).toBe(email);

  const foreign = await request.post("/api/auth/logout", { data: {}, headers: headers(ip, { Origin: "https://evil.example" }) });
  expect(foreign.status()).toBe(403);
  expect((await foreign.json()).error.code).toBe("CSRF_REJECTED");
  const missing = await request.patch("/api/account", { data: { phone: "+381611111111" }, headers: { "cf-connecting-ip": ip } });
  expect(missing.status()).toBe(403);
  expect((await missing.json()).error.code).toBe("CSRF_REJECTED");
  expect((await request.get("/api/account")).status()).toBe(200);

  const token = decodeURIComponent(cookie.split(";")[0].slice("mm_session=".length));
  const out = await request.post("/api/auth/logout", { data: {}, headers: headers(ip) });
  expect(out.status()).toBe(200);
  // Replaying the old cookie by hand must fail: the server revoked it, not just the browser.
  const replay = await page.request.get("/api/account", { headers: { cookie: `mm_session=${token}`, "cf-connecting-ip": ip } });
  expect(replay.status()).toBe(401);
  expect((await replay.json()).error.code).toBe("INVALID_SESSION");
});

test("F-E02 a challenge locks after five wrong codes and then rejects the right one; unknown email looks identical", async ({ request }) => {
  const ip = address();
  const email = `test-f-${unique()}@example.test`;
  const registered = await request.post("/api/auth/register", { data: { email }, headers: headers(ip) });
  const challenge = await registered.json();
  const wrong = challenge.localDevelopment.code === "000000" ? "111111" : "000000";
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await request.post("/api/auth/code/verify", { data: { challengeId: challenge.challengeId, code: wrong }, headers: headers(ip) });
    expect(response.status()).toBe(401);
  }
  const right = await request.post("/api/auth/code/verify", { data: { challengeId: challenge.challengeId, code: challenge.localDevelopment.code }, headers: headers(ip) });
  expect(right.status()).toBe(401);
  expect((await request.get("/api/account")).status()).toBe(401);

  const unknown = await request.post("/api/auth/code", { data: { email: `test-f-nema-${unique()}@example.test`, channel: "email" }, headers: headers(ip) });
  expect(unknown.status()).toBe(202);
  const body = await unknown.json();
  expect(body.localDevelopment).toBeUndefined();
  expect(body.challengeId).toMatch(/^[A-Za-z0-9_-]{43}$/);
});

test("F-E03 demo session is read-only through the real runtime", async ({ request }) => {
  const ip = address();
  expect((await request.post("/api/auth/demo", { data: {}, headers: { "cf-connecting-ip": ip } })).status()).toBe(403);
  const login = await request.post("/api/auth/demo", { data: {}, headers: headers(ip) });
  expect(login.status()).toBe(200);
  expect((await login.json()).demo).toBe(true);
  expect((await (await request.get("/api/account")).json()).demo).toBe(true);
  for (const [method, path, data] of [
    ["PATCH", "/api/account", { phone: "+381611111111" }],
    ["PATCH", "/api/account/subscriptions/demo-subscription", { action: "cancel", expectedVersion: 1 }],
    ["POST", "/api/account/refunds", { orderId: "ord_demo" }],
  ] as const) {
    const response = await request.fetch(path, { method, data, headers: headers(ip) });
    expect(response.status(), `${method} ${path}`).toBe(403);
    expect((await response.json()).error.code).toBe("DEMO_READ_ONLY");
  }
  const checkout = await request.post("/api/checkout", { data: cashBody("demo@example.invalid"), headers: headers(ip, { "Idempotency-Key": `test-f-demo-${unique()}` }) });
  expect(checkout.status()).toBe(403);
  expect((await checkout.json()).error.code).toBe("DEMO_READ_ONLY");
});

test("F-E04 checkout contract: idempotent replay, conflict, forged prices ignored, raw card data refused, card unavailable", async ({ request }) => {
  const ip = address();
  const email = `test-f-${unique()}@example.test`;
  const key = `test-f-key-${unique()}`;
  const body = cashBody(email, 2, { totalMinor: 1, unitPriceMinor: 1, paymentStatus: "paid" });
  const first = await request.post("/api/checkout", { data: body, headers: headers(ip, { "Idempotency-Key": key }) });
  expect(first.status()).toBe(201);
  const created = await first.json();
  expect(created.order.totalMinor).toBe(85_000);
  expect(created.order.paymentStatus).toBe("pending");
  const replay = await request.post("/api/checkout", { data: body, headers: headers(ip, { "Idempotency-Key": key }) });
  expect(replay.status()).toBe(201);
  expect((await replay.json()).order.id).toBe(created.order.id);
  const conflict = await request.post("/api/checkout", { data: cashBody(email, 3), headers: headers(ip, { "Idempotency-Key": key }) });
  expect(conflict.status()).toBe(409);
  expect((await conflict.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");

  const short = await request.post("/api/checkout", { data: body, headers: headers(ip, { "Idempotency-Key": "short" }) });
  expect(short.status()).toBe(422);
  const pan = await request.post("/api/checkout", { data: cashBody(email, 2, { payment: { cardNumber: "4111111111111111", cvv: "123" } }), headers: headers(ip, { "Idempotency-Key": `test-f-pan-${unique()}` }) });
  expect(pan.status()).toBe(422);
  expect((await pan.json()).error.code).toBe("CARD_DATA_REJECTED");
  const card = await request.post("/api/checkout", { data: cashBody(email, 2, { paymentMethod: "card", paymentToken: "test-f-token" }), headers: headers(ip, { "Idempotency-Key": `test-f-card-${unique()}` }) });
  expect(card.status()).toBe(503);
  expect((await card.json()).error.code).toBe("PAYMENT_METHOD_UNAVAILABLE");
  for (const quantity of [0, -1, 1.5, 101]) {
    const response = await request.post("/api/checkout", { data: cashBody(email, quantity), headers: headers(ip, { "Idempotency-Key": `test-f-q-${unique()}` }) });
    expect(response.status(), `quantity ${quantity}`).toBe(422);
  }
  const zone = await request.post("/api/checkout", { data: { ...cashBody(email), customer: { ...customer(email), postalCode: "99999" } }, headers: headers(ip, { "Idempotency-Key": `test-f-zone-${unique()}` }) });
  expect(zone.status()).toBe(422);
  expect((await zone.json()).error.code).toBe("DELIVERY_AREA_UNAVAILABLE");
});

test("F-E05 payment webhook is a local simulator only: 401 for a bad secret, 503 when PAYMENT_MODE is not mock", async ({ request }) => {
  const ip = address();
  const event = { eventId: `test-f-${unique()}`, orderId: "ord_nepostojeci", status: "paid" };
  const bad = await request.post("/api/webhooks/payments", { data: event, headers: { "x-webhook-secret": "wrong", "cf-connecting-ip": ip } });
  expect(bad.status()).toBe(401);
  const disabled = await request.post("/api/webhooks/payments", { data: event, headers: { "x-webhook-secret": "e2e-webhook-secret", "cf-connecting-ip": ip } });
  expect(disabled.status()).toBe(503);
  expect((await disabled.json()).error.code).toBe("PAYMENT_ADAPTER_NOT_CONNECTED");
});

test("F-E06 admin: login throttle, role matrix, deactivation and revocation", async ({ request }) => {
  const ip = address();
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await request.post("/api/admin/access", { data: { email: `test-f-nobody-${unique()}@example.test`, password: `wrong-${attempt}` }, headers: headers(ip) });
    expect(response.status()).toBe(403);
  }
  const noOrigin = await request.post("/api/admin/access", { data: ADMIN, headers: { "cf-connecting-ip": ip } });
  expect(noOrigin.status()).toBe(403);
  expect((await noOrigin.json()).error.code).toBe("CSRF_REJECTED");
  const login = await request.post("/api/admin/access", { data: ADMIN, headers: headers(ip) });
  expect(login.status()).toBe(200);
  const owner = { Authorization: `Bearer ${(await login.json()).sessionToken}`, "cf-connecting-ip": ip };

  const person = async (role: string) => {
    const email = `test-f-${role}-${unique()}@example.test`;
    const password = `test-f-${role}-password-1`;
    const created = await request.post("/api/admin/staff", { data: { email, fullName: `TEST-F ${role}`, role, password }, headers: owner });
    expect(created.status()).toBe(200);
    const session = await request.post("/api/admin/access", { data: { email, password }, headers: headers(ip) });
    expect(session.status()).toBe(200);
    return { id: (await created.json()).staff.id as string, email, password, headers: { Authorization: `Bearer ${(await session.json()).sessionToken}`, "cf-connecting-ip": ip } };
  };
  const driver = await person("driver");
  const finance = await person("finance");
  const manager = await person("manager");
  const status = async (method: string, path: string, who: Record<string, string>, data?: unknown) => (await request.fetch(path, { method, headers: who, ...(data ? { data } : {}) })).status();
  expect(await status("GET", "/api/admin/orders", driver.headers)).toBe(403);
  expect(await status("GET", "/api/admin/deliveries", driver.headers)).toBe(200);
  expect(await status("GET", "/api/admin/orders", finance.headers)).toBe(200);
  expect(await status("PATCH", "/api/admin/orders", finance.headers, { id: "ord_x", paymentStatus: "paid" })).toBe(403);
  expect(await status("GET", "/api/admin/staff", manager.headers)).toBe(403);
  expect(await status("GET", "/api/admin/orders", manager.headers)).toBe(200);

  const off = await request.post("/api/admin/staff", { data: { id: finance.id, isActive: false }, headers: owner });
  expect(off.status()).toBe(200);
  expect(await status("GET", "/api/admin/orders", finance.headers)).toBe(403);
  const relog = await request.post("/api/admin/access", { data: { email: finance.email, password: finance.password }, headers: headers(ip) });
  expect(relog.status()).toBe(403);

  const out = await request.delete("/api/admin/access", { headers: owner });
  expect(out.status()).toBe(200);
  expect(await status("GET", "/api/admin/orders", owner)).toBe(403);
});

test("F-E07 admin login: the 11th attempt from one address in 15 minutes is 429", async ({ request }) => {
  const ip = address();
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await request.post("/api/admin/access", { data: { email: `test-f-nobody-${unique()}@example.test`, password: `wrong-${attempt}` }, headers: headers(ip) });
    expect(response.status()).toBe(403);
  }
  const limited = await request.post("/api/admin/access", { data: ADMIN, headers: headers(ip) });
  expect(limited.status()).toBe(429);
  expect((await limited.json()).error.code).toBe("RATE_LIMITED");
});
