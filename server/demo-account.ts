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
  const previousDate = addLocalDays(nextDeliveryDate, -14);
  const firstDate = addLocalDays(nextDeliveryDate, -21);
  const items = [
    { id: "demo-cow", productName: "Kravlje mleko", unitLabel: "1 L", priceMinor: 25000, quantity: 4, cadence: "weekly", cadenceAnchorDate: firstDate, status: "active", dueNext: true },
    { id: "demo-goat", productName: "Kozje mleko", unitLabel: "1 L", priceMinor: 35000, quantity: 2, cadence: "biweekly", cadenceAnchorDate: firstDate, status: "active", dueNext: true },
  ];
  return {
    demo: true,
    currentDate,
    customer: { fullName: "Demo korisnik", email: DEMO_CUSTOMER_EMAIL, phone: "", addressLine1: "Primer adrese 12", addressLine2: "Primer podataka za dostavu", city: "Beograd", postalCode: "11000" },
    subscriptions: [{
      id: "demo-subscription", version: 1, status: "active", nextDeliveryDate,
      pauseUntil: null, renewalEnabled: true, maxPauseUntil: addLocalDays(nextDeliveryDate, 60),
      cutoffAt: cutoffForDelivery(nextDeliveryDate, 24), locked: false,
      afterSkipDate: addLocalDays(nextDeliveryDate, 7), items, nextOnlyAddons: [],
      currentPackage: items.map((item, index) => ({
        line_id: item.id, product_name: item.productName, quantity: item.quantity,
        required_deliveries: index ? 2 : 4, delivered: index ? 1 : 2,
        delivered_units: item.quantity * (index ? 1 : 2), required_units: item.quantity * (index ? 2 : 4),
      })),
    }],
    orders: [{ id: "demo-order", order_number: "DEMO-001", kind: "subscription_invoice", delivery_date: firstDate, total_minor: 540000, payment_status: "paid", fulfillment_status: "planned" }],
    addonProducts: [],
    deliveryHistory: [previousDate, firstDate].map((date, index) => ({
      id: `demo-delivery-${index}`, date, status: "delivered",
      items: items.filter((_, itemIndex) => !itemIndex || index === 1).map((item) => ({ product_name: item.productName, unit_label: item.unitLabel, quantity: item.quantity })),
    })),
    oneTimeDeliveries: [],
  };
}
