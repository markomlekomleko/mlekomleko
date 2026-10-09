import { env } from "./runtime";
import { run, type Row } from "./sql";
import { sha256 } from "./crypto";
import { ecommerceInvoiceItems, sanitizeAnalyticsIdentity } from "../integrations/marketing-attribution.mjs";
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return {}; return value as Record<string, unknown>; }
export async function dispatchPurchaseAnalytics(order: Row, items: Row[], eventId: string, transactionId: string) {
  if (order.payment_status !== "paid") return `purchase-not-paid:${order.id}`;
  let source: Record<string, unknown> = {};
  try { source = object(JSON.parse(String(order.source_json || "{}"))); } catch { /* Denied for legacy invalid data. */ }
  const consent = object(source.consent);
  if (consent.analytics !== true) return `analytics-consent-denied:${order.id}`;
  const identity = sanitizeAnalyticsIdentity(source.identity) as Record<string,string>;
  const anonymousId = identity.anonymousId || `server:${(await sha256(String(order.customer_id))).slice(0,24)}`;
  const sessionId = identity.sessionId || `order:${order.id}`;
  const ecommerceItems: Array<{ item_id: string; item_name: string; item_variant: string; price: number; quantity: number }> = ecommerceInvoiceItems(items);
  const properties = { eventId, transactionId, valueMinor: Number(order.total_minor), currency: "RSD", paymentMethod: order.payment_method, items: ecommerceItems };
  await run("INSERT INTO analytics_events (id, event_name, anonymous_id, session_id, order_id, path, properties_json) VALUES (?, 'purchase', ?, ?, ?, '/checkout', ?) ON CONFLICT(id) DO NOTHING", eventId, anonymousId, sessionId, String(order.id), JSON.stringify(properties));
  const config = env as Record<string,string | undefined>;
  const measurementId = config.GA4_MEASUREMENT_ID || config.NEXT_PUBLIC_GA4_MEASUREMENT_ID;
  // Paid cash and recurring invoices may arrive days later. They retain the allowed
  // browser identity, while the payment itself is recorded at its actual processing time.
  if (measurementId && config.GA4_API_SECRET) {
    const response = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(config.GA4_API_SECRET)}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: identity.gaClientId || anonymousId, consent: { ad_user_data: consent.marketing === true ? "GRANTED" : "DENIED", ad_personalization: consent.marketing === true ? "GRANTED" : "DENIED" }, events: [{ name: "purchase", params: { transaction_id: transactionId, value: Number(order.total_minor) / 100, currency: "RSD", shipping: Number(order.delivery_fee_minor) / 100, coupon: order.promo_code || undefined, event_id: eventId, items: ecommerceItems, session_id: /^\d+$/.test(identity.gaSessionId || "") ? Number(identity.gaSessionId) : undefined, engagement_time_msec: 1 } }] }),
    });
    if (!response.ok) throw new Error(`GA4_HTTP_${response.status}: purchase zahtev nije prihvaćen`);
  }
  if (consent.marketing === true && config.NEXT_PUBLIC_META_PIXEL_ID && config.META_CONVERSIONS_ACCESS_TOKEN && /^v\d+\.\d+$/.test(config.META_GRAPH_API_VERSION || "")) {
    const response = await fetch(`https://graph.facebook.com/${config.META_GRAPH_API_VERSION}/${config.NEXT_PUBLIC_META_PIXEL_ID}/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ access_token: config.META_CONVERSIONS_ACCESS_TOKEN, data: [{ event_name: "Purchase", event_time: Math.floor(Date.now()/1000), event_id: eventId, action_source: "website", event_source_url: `${config.APP_ORIGIN || ""}/checkout`, user_data: { external_id: [await sha256(anonymousId)], fbp: identity.fbp, fbc: identity.fbc }, custom_data: { currency: "RSD", value: Number(order.total_minor)/100, order_id: transactionId, content_type: "product", contents: ecommerceItems.map(item => ({ id: item.item_id, quantity: item.quantity, item_price: item.price })) } }] }) });
    if (!response.ok) throw new Error(`META_HTTP_${response.status}: purchase zahtev nije prihvaćen`);
    const result = await response.json() as { events_received?: number };
    if (!result.events_received) throw new Error("META_EVENT_NOT_ACCEPTED: Meta nije potvrdila prihvatanje događaja");
  }
  return eventId;
}
