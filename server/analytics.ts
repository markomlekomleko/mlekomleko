import { assertDomain, requiredString } from "./domain";
import { enqueueOnce } from "./outbox";
import { run } from "./sql";

const eventNames = new Set([
  "page_view",
  "view_item_list",
  "view_item",
  "select_item",
  "add_to_cart",
  "view_cart",
  "begin_checkout",
  "add_payment_info",
  "order_created",
  "subscription_selected",
  "delivery_cadence_selected",
  "postcode_checked",
  "promo_applied",
  "account_login_requested",
  "subscription_paused",
  "subscription_resumed",
  "subscription_cancelled",
  "subscription_cancel_started",
  "subscription_saved",
  "subscription_converted",
  "add_to_next_delivery",
  "cart_recovery_saved",
]);
const forbiddenKey = /(email|phone|address|full.?name|first.?name|last.?name|postal.?code|note)/i;

function cleanProperties(value: unknown, depth = 0): unknown {
  if (depth > 3 || value == null) return null;
  if (typeof value === "string") return value.slice(0, 240);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => cleanProperties(item, depth + 1));
  if (typeof value !== "object") return null;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !forbiddenKey.test(key))
      .slice(0, 40)
      .map(([key, child]) => [key.slice(0, 80), cleanProperties(child, depth + 1)]),
  );
}

export async function recordAnalyticsEvent(input: Record<string, unknown>) {
  assertDomain(input.consent === true, "CONSENT_REQUIRED", "Analytics consent is required.", 403);
  const eventName = requiredString(input.eventName, "eventName", 80);
  assertDomain(eventNames.has(eventName), "VALIDATION_ERROR", "Unknown analytics event.", 422);
  const anonymousId = requiredString(input.anonymousId, "anonymousId", 120);
  const sessionId = requiredString(input.sessionId, "sessionId", 120);
  const path = requiredString(input.path, "path", 300);
  assertDomain(path.startsWith("/"), "VALIDATION_ERROR", "Analytics path must be local.", 422);
  const orderId = typeof input.orderId === "string" ? input.orderId.slice(0, 120) : null;
  const properties = cleanProperties(input.properties ?? {});
  await run(
    "INSERT INTO analytics_events (id, event_name, anonymous_id, session_id, order_id, path, properties_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
    crypto.randomUUID(), eventName, anonymousId, sessionId, orderId, path, JSON.stringify(properties),
  );
  return { accepted: true };
}

export function purchaseAnalyticsEvent(orderId: string, transactionId?: string, source = "payment-confirmation") {
  const eventId = `purchase:${orderId}`;
  return enqueueOnce("analytics.purchase", "order", orderId, { eventId, transactionId: transactionId ?? orderId, source }, eventId);
}
