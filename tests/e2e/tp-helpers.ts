// Shared helpers for the tp-*.spec.ts browser flows (test plan, phase 2).
import { expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { cyr } from "./cyr";

export const ORIGIN = `http://localhost:${process.env.E2E_PORT || "4173"}`;
export const ADMIN = { email: "admin@example.test", password: "e2e-admin-password" };

/** A unique IPv6 per test so per-IP rate limits never couple unrelated tests. */
export async function freshIp(context: BrowserContext) {
  const ip = `2001:db8:${crypto.randomUUID().replaceAll("-", "").match(/.{1,4}/g)!.slice(0, 6).join(":")}`;
  await context.setExtraHTTPHeaders({ "cf-connecting-ip": ip });
  return ip;
}

export async function acceptNecessary(page: Page) {
  const button = page.getByRole("button", { name: cyr("Samo neophodno") });
  if (await button.isVisible().catch(() => false)) await button.click({ timeout: 3000 }).catch(() => undefined);
}

export async function noHorizontalScroll(page: Page, label: string) {
  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(overflow.scroll, `${label}: horizontal scroll (${overflow.scroll} > ${overflow.client})`).toBeLessThanOrEqual(overflow.client);
}

/** The visible text of a money amount like "1.050" must appear (currency suffix/script may vary). */
export const rsd = (amount: number) => amount.toLocaleString("de-DE");

export const weekdayOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
export function addDaysIso(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function newCustomer(label: string) {
  const id = crypto.randomUUID().slice(0, 8);
  return {
    email: `tp-${label}-${id}@example.test`,
    fullName: `TP ${label} ${id}`,
    phone: "+381601234567",
    street: `Testna ulica ${Math.floor(Math.random() * 90) + 1}`,
    city: "Beograd",
    postalCode: "11000",
  };
}

/** Adds `litres` of the cow milk through the shop card (the real buying path). */
export async function addMilkFromShop(page: Page, { type, litres }: { type: "subscription" | "one_time"; litres: 2 | 4 | 8 }) {
  await page.goto("/prodavnica");
  await acceptNecessary(page);
  const card = page.locator(".configurator:not(.goat-waitlist)").first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: cyr(type === "subscription" ? "Pretplata" : "Jednokratna kupovina") }).click();
  await expect(card.getByRole("button", { name: cyr(type === "subscription" ? "Pretplata" : "Jednokratna kupovina") })).toHaveAttribute("aria-pressed", "true");
  await card.getByRole("button", { name: cyr(`${litres} L`), exact: true }).click();
  await expect(card.getByRole("button", { name: cyr(`${litres} L`), exact: true })).toHaveAttribute("aria-pressed", "true");
  return card;
}

export async function fillCheckoutForm(page: Page, customer: ReturnType<typeof newCustomer>, city = customer.city, postalCode = customer.postalCode) {
  await page.getByLabel(cyr("Ime i prezime")).fill(customer.fullName);
  await page.getByRole("textbox", { name: cyr("Email"), exact: true }).fill(customer.email);
  await page.getByLabel(cyr("Broj telefona")).fill(customer.phone);
  await page.getByLabel(cyr("Ulica i broj")).fill(customer.street);
  await page.getByLabel(cyr("Grad"), { exact: true }).fill(city);
  await page.getByLabel(cyr("Poštanski broj"), { exact: true }).fill(postalCode);
}

export async function adminToken(request: APIRequestContext) {
  const response = await request.post("/api/admin/access", { headers: { origin: ORIGIN }, data: { email: ADMIN.email, password: ADMIN.password } });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()).sessionToken as string;
}

/** Loose JSON shape of admin API answers used by the tp specs. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped admin payloads
export type Json = any;

export async function adminGet<T = Json>(request: APIRequestContext, token: string, path: string): Promise<T> {
  const response = await request.get(path, { headers: { Authorization: `Bearer ${token}` } });
  expect(response.status(), `${path}: ${await response.text()}`).toBe(200);
  return response.json();
}

export async function adminOrdersFor(request: APIRequestContext, token: string, email: string) {
  return (await adminGet<{ orders: Json[] }>(request, token, `/api/admin/orders?q=${encodeURIComponent(email)}&pageSize=50`)).orders;
}

/** Local mode exposes the emailed code on the sign-in page. */
export async function signInWithCode(page: Page, email: string) {
  await page.goto("/prijava");
  await acceptNecessary(page);
  await page.getByLabel(cyr("Email adresa")).fill(email);
  await page.getByRole("button", { name: cyr("Pošalji kod za prijavu"), exact: true }).click();
  const code = page.getByTestId("local-auth-code").locator("strong");
  await expect(code).toHaveText(/^\d{6}$/);
  await page.getByLabel(cyr("Šestocifreni kod")).fill((await code.textContent())!);
  await page.getByRole("button", { name: cyr("Potvrdi kod"), exact: true }).click();
  await expect(page).toHaveURL(/\/nalog$/);
}

export async function adminUiLogin(page: Page) {
  await page.goto("/admin");
  await acceptNecessary(page);
  await page.getByLabel("Email", { exact: true }).fill(ADMIN.email);
  await page.getByLabel("Lozinka", { exact: true }).fill(ADMIN.password);
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page.locator(".status-dot")).toHaveText("● Povezano");
}

/** Buys a weekly subscription through the public API (fast set-up for account flows). */
export async function buySubscription(
  request: APIRequestContext,
  customer: ReturnType<typeof newCustomer>,
  { litres = 2, city = "Beograd", postalCode = "11000", weekday, deliveryDate: wantedDate }: { litres?: number; city?: string; postalCode?: string; weekday?: number; deliveryDate?: string } = {},
) {
  const options = await (await request.get(`/api/delivery-options?${new URLSearchParams({ city, postalCode })}`)).json();
  const deliveryDate: string = wantedDate ?? (weekday === undefined ? options.dates[0] : options.dates.find((date: string) => weekdayOf(date) === weekday));
  expect(deliveryDate, "an open delivery date").toBeTruthy();
  const product = { id: "prod_kravlje_1l" }; // the only cow-milk product on sale
  const response = await request.post("/api/checkout", {
    headers: { Origin: ORIGIN, "Idempotency-Key": crypto.randomUUID() },
    data: {
      customer: { email: customer.email, fullName: customer.fullName, phone: customer.phone, addressLine1: customer.street, city, postalCode },
      deliveryDate,
      paymentMethod: "cash",
      items: [{ productId: product.id, quantity: litres, purchaseType: "subscription", cadence: "weekly" }],
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const body = await response.json();
  return { deliveryDate, orderId: body.order.id as string, productId: product.id, body };
}

export async function buyOneTime(
  request: APIRequestContext,
  customer: ReturnType<typeof newCustomer>,
  { litres = 2, deliveryDate }: { litres?: number; deliveryDate: string },
) {
  const response = await request.post("/api/checkout", {
    headers: { Origin: ORIGIN, "Idempotency-Key": crypto.randomUUID() },
    data: {
      customer: { email: customer.email, fullName: customer.fullName, phone: customer.phone, addressLine1: customer.street, city: customer.city, postalCode: customer.postalCode },
      deliveryDate,
      paymentMethod: "cash",
      items: [{ productId: "prod_kravlje_1l", quantity: litres, purchaseType: "one_time" }],
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).order as { id: string; orderNumber: string; deliveryDate: string };
}
