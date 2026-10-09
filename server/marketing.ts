import { env } from "./runtime";
import { all, type Row } from "./sql";
import { classifySource } from "../integrations/marketing-attribution.mjs";
import { addLocalDays, localDateTimeToUtc } from "./time";
function object(value: unknown): Record<string, unknown> {
  if (typeof value === "string") { try { return object(JSON.parse(value)); } catch { return {}; } }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
const labels: Record<string, string> = { direct: "Direktno", manual: "Ručni unos", qr: "QR", influencer: "Influenseri", email: "Email", messaging: "WhatsApp / poruke", paid_social: "Plaćene društvene mreže", paid_search: "Plaćena pretraga", organic_search: "Organska pretraga", organic_social: "Društvene mreže", referral: "Preporuke / drugi sajtovi", unmeasured: "Bez pristanka / raniji podaci" };
export function trackingReadiness() {
  const e = env as Record<string, string | undefined>;
  return {
    mode: e.NEXT_PUBLIC_GTM_CONTAINER_ID ? "gtm" : "direct",
    ga4: Boolean(e.NEXT_PUBLIC_GA4_MEASUREMENT_ID && e.GA4_API_SECRET),
    gtm: Boolean(e.NEXT_PUBLIC_GTM_CONTAINER_ID),
    metaPixel: Boolean(e.NEXT_PUBLIC_META_PIXEL_ID),
    metaConversions: Boolean(e.NEXT_PUBLIC_META_PIXEL_ID && e.META_CONVERSIONS_ACCESS_TOKEN && e.META_GRAPH_API_VERSION),
    googleAds: Boolean(e.NEXT_PUBLIC_GOOGLE_ADS_ID),
    verification: "configuration_only",
  };
}
export async function marketingReport(from: string, to: string) {
  const start = localDateTimeToUtc(from, "00:00").toISOString().slice(0, 19);
  const end = localDateTimeToUtc(addLocalDays(to, 1), "00:00").toISOString().slice(0, 19);
  const [sessions, orders] = await Promise.all([
    all<Row>(`WITH ranked AS (
      SELECT anonymous_id, session_id, event_name, properties_json,
      ROW_NUMBER() OVER (PARTITION BY anonymous_id, session_id ORDER BY created_at, id) AS rn
      FROM analytics_events WHERE REPLACE(created_at, ' ', 'T') >= ? AND REPLACE(created_at, ' ', 'T') < ? AND event_name != 'purchase'
    ) SELECT anonymous_id, session_id,
      MAX(CASE WHEN rn = 1 THEN properties_json ELSE NULL END) AS properties_json,
      MAX(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS visited,
      MAX(CASE WHEN event_name = 'view_item' OR event_name = 'view_item_list' THEN 1 ELSE 0 END) AS viewed,
      MAX(CASE WHEN event_name = 'add_to_cart' THEN 1 ELSE 0 END) AS cart,
      MAX(CASE WHEN event_name = 'begin_checkout' THEN 1 ELSE 0 END) AS checkout
      FROM ranked GROUP BY anonymous_id, session_id`, start, end),
    all<Row>("SELECT id, source_json, total_minor, payment_status, fulfillment_status FROM orders WHERE REPLACE(created_at, ' ', 'T') >= ? AND REPLACE(created_at, ' ', 'T') < ?", start, end),
  ]);
  type Channel = { key: string; channel: string; label: string; source: string; medium: string; campaign: string; visits: number; products: number; carts: number; checkouts: number; orders: number; paidOrders: number; paidMinor: number; convertedSessions: Set<string> };
  const channels = new Map<string, Channel>();
  const sessionGroups = new Map<string, Channel>();
  const visited = new Set<string>();
  const bucket = (source: Record<string, unknown>, unmeasured = false) => {
    const attribution = unmeasured ? { channel: "unmeasured", source: "—", medium: "—", campaign: "—" } : classifySource(source);
    const key = JSON.stringify([attribution.channel, attribution.source, attribution.medium, attribution.campaign]);
    if (!channels.has(key)) channels.set(key, { key, ...attribution, label: labels[attribution.channel] ?? attribution.channel, visits: 0, products: 0, carts: 0, checkouts: 0, orders: 0, paidOrders: 0, paidMinor: 0, convertedSessions: new Set() });
    return channels.get(key)!;
  };
  const sessionKey = (anonymousId: unknown, sessionId: unknown) => JSON.stringify([anonymousId, sessionId]);
  for (const session of sessions) {
    const group = bucket(object(object(session.properties_json).attribution));
    const id = sessionKey(session.anonymous_id, session.session_id);
    sessionGroups.set(id, group);
    group.visits += Number(session.visited); group.products += Number(session.viewed); group.carts += Number(session.cart); group.checkouts += Number(session.checkout);
    if (session.visited) visited.add(id);
  }
  for (const order of orders) {
    const source = object(order.source_json);
    const identity = object(source.identity);
    const id = sessionKey(identity.anonymousId, identity.sessionId);
    const group = sessionGroups.get(id) ?? bucket(source, !Object.keys(source).some(key => key !== "consent") || (object(source.consent).analytics !== true && source.utm_source !== "admin"));
    group.orders++;
    if (order.payment_status === "paid") { group.paidOrders++; group.paidMinor += Number(order.total_minor); if (visited.has(id)) group.convertedSessions.add(id); }
  }
  return {
    channels: [...channels.values()].map(group => ({ ...group, convertedSessions: group.convertedSessions.size, conversionRate: group.visits ? Math.round(group.convertedSessions.size / group.visits * 10000) / 100 : 0 })).sort((a,b) => b.paidMinor - a.paidMinor || b.visits - a.visits),
    readiness: trackingReadiness(),
    attribution: "Poslednji relevantan izvor, do 90 dana uz pristanak. Koraci su broj različitih sesija; plaćene porudžbine i prihod koriste datum nastanka porudžbine i trenutni status naplate. Konverzija povezuje samo posete i plaćene porudžbine istog browsera/sesije u izabranom periodu. Bez procene korisnika koji nisu pristali.",
  };
}
