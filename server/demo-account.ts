import { env } from "@/server/runtime";
import { assertSameOrigin } from "./auth";
import { randomToken, sha256 } from "./crypto";
import { assertDomain } from "./domain";
import { DEMO_CUSTOMER_EMAIL, DEMO_CUSTOMER_ID } from "./demo-identity";
import { enforceRateLimit } from "./rate-limit";
import { batch, first } from "./sql";
import { addLocalDays, cutoffForDelivery, localDateAt, nextWeekday } from "./time";

export function demoLoginAvailable() {
  return (env as Record<string, string | undefined>).DEMO_LOGIN_ENABLED !== "false";
}

export async function loginDemoCustomer(request: Request) {
  assertSameOrigin(request);
  assertDomain(demoLoginAvailable(), "DEMO_UNAVAILABLE", "Demo nalog trenutno nije dostupan.", 404);
  await enforceRateLimit(request, "demo-login", 20, 15 * 60);
  const sessionToken = randomToken();
  const sessionExpiresAt = new Date(Date.now() + 8 * 60 * 60_000).toISOString();
  // A fixed reserved identity cannot be redirected to an existing customer's email.
  await batch([
    {
      sql: "INSERT INTO customers (id, email, full_name, phone, address_line_1, city, postal_code) VALUES (?, ?, 'Demo korisnik', '', 'Primer adrese 12', 'Beograd', '11000') ON CONFLICT DO NOTHING",
      bindings: [DEMO_CUSTOMER_ID, DEMO_CUSTOMER_EMAIL],
    },
    {
      sql: "DELETE FROM auth_tokens WHERE customer_id = ? AND kind = 'session' AND (expires_at <= ? OR used_at IS NOT NULL)",
      bindings: [DEMO_CUSTOMER_ID, new Date().toISOString()],
    },
    {
      sql: "INSERT INTO auth_tokens (id, customer_id, email, token_hash, kind, expires_at) SELECT ?, id, email, ?, 'session', ? FROM customers WHERE id = ? AND email = ?",
      bindings: [crypto.randomUUID(), await sha256(sessionToken), sessionExpiresAt, DEMO_CUSTOMER_ID, DEMO_CUSTOMER_EMAIL],
    },
  ]);
  const issued = await first("SELECT id FROM auth_tokens WHERE token_hash = ? AND customer_id = ?", await sha256(sessionToken), DEMO_CUSTOMER_ID);
  assertDomain(issued, "DEMO_UNAVAILABLE", "Demo nalog trenutno nije dostupan.", 503);
  return { sessionToken, sessionExpiresAt };
}

// Examples are generated for display only: no orders, payments, deliveries or outbox jobs are inserted.
export function getDemoAccount() {
  const currentDate = localDateAt();
  const nextDeliveryDate = nextWeekday(new Date(Date.now() + 3 * 86_400_000), 2);
  // History is always in the past: from Sunday to Tuesday the next delivery is more than
  // a week away, so the Tuesday before it has not happened yet (or is today).
  let skippedDate = addLocalDays(nextDeliveryDate, -7);
  while (skippedDate >= currentDate) skippedDate = addLocalDays(skippedDate, -7);
  const previousDate = addLocalDays(skippedDate, -7);
  const firstDate = addLocalDays(skippedDate, -14);
  // Weekly only: 2 L per delivery in a paid package of four realized deliveries.
  const items = [
    { id: "demo-cow", productId: "prod_kravlje_1l", productName: "Kravlje mleko", unitLabel: "1 L", priceMinor: 25000, quantity: 2, cadence: "weekly", cadenceAnchorDate: firstDate, status: "active", dueNext: true },
  ];
  const cutoffAt = cutoffForDelivery(nextDeliveryDate, 36, "07:00");
  return {
    demo: true,
    currentDate,
    customer: { fullName: "Demo korisnik", email: DEMO_CUSTOMER_EMAIL, phone: "", addressLine1: "Primer adrese 12", addressLine2: "Primer podataka za dostavu", city: "Beograd", postalCode: "11000" },
    subscriptions: [{
      id: "demo-subscription", version: 1, status: "active", nextDeliveryDate,
      pauseUntil: null, renewalEnabled: true, maxPauseUntil: addLocalDays(nextDeliveryDate, 60),
      cutoffAt, locked: Date.now() >= Date.parse(cutoffAt),
      afterSkipDate: addLocalDays(nextDeliveryDate, 7), items, nextOnlyAddons: [],
      packageSummary: { purchased: 4, realized: 2, remaining: 2, openForAdditions: 2, paymentStatus: "paid" },
      currentPackage: items.map((item) => ({
        line_id: item.id, product_name: item.productName, quantity: item.quantity,
        required_deliveries: 4, delivered: 2, delivered_units: item.quantity * 2, required_units: item.quantity * 4,
      })),
    }],
    orders: [{ id: "demo-order", order_number: "DEMO-001", kind: "subscription_invoice", role: "package", payment_method: "cash", delivery_date: firstDate, subtotal_minor: 200000, delivery_fee_minor: 140000, discount_minor: 0, total_minor: 340000, payment_status: "paid", fulfillment_status: "planned", surcharge: null }],
    addonProducts: [],
    deliveryHistory: [
      { id: "demo-skip", date: skippedDate, status: "skipped", items: [] },
      ...[previousDate, firstDate].map((date, index) => ({
        id: `demo-delivery-${index}`, date, status: "delivered",
        items: items.map((item) => ({ product_name: item.productName, unit_label: item.unitLabel, quantity: item.quantity, source_type: "subscription" })),
      })),
    ],
    oneTimeDeliveries: [],
    loyalty: {
      target: 12, startDate: addLocalDays(firstDate, -42), realizedSinceStart: 8, progress: 8, remaining: 4,
      gift: { quantity: 2, deliveryDiscountMinor: 35000 }, rewards: [], available: null, openDeliveryCreditMinor: 0,
    },
  };
}
