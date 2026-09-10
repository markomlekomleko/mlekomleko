import { stableJsonHash } from "./crypto";
import { DomainError, assertDomain, requiredString } from "./domain";
import { audit, enqueue } from "./outbox";
import { all, batch, first, type SqlValue } from "./sql";
import { addLocalDays, assertLocalDate, cutoffForDelivery, isCadenceDue } from "./time";
import { getBusinessSettings } from "./settings";
import { buildXlsx } from "./xlsx";
import { buildSpokeCsv } from "../integrations/spoke-csv.mjs";

interface DeliveryRow extends Record<string, unknown> {
  id: string; delivery_date: string; cutoff_at: string; status: "open" | "locked" | "completed";
  generated_at: string; locked_at: string | null; generation_key: string;
}

interface CustomerSnapshotRow extends Record<string, unknown> {
  customer_id: string; full_name: string; email: string; phone: string; address_line_1: string; address_line_2: string | null;
  city: string; postal_code: string; delivery_note: string | null;
}

interface ItemSnapshotRow extends Record<string, unknown> {
  source_id: string; product_id: string; product_name: string; unit_label: string; quantity: number; unit_price_minor: number; source_type: "order" | "subscription" | "next_only";
}

interface DeliveryOrderView extends Record<string, unknown> {
  id: string;
  note: string | null;
  source_order_id: string | null;
  subscription_id: string | null;
  customer_snapshot_json: string;
}

async function deliveryPayload(date: string) {
  const delivery = await first<DeliveryRow>("SELECT * FROM deliveries WHERE delivery_date = ?", date);
  if (!delivery) throw new DomainError("DELIVERY_NOT_FOUND", "Delivery was not found.", 404);
  const orders = await all<DeliveryOrderView>("SELECT delivery_orders.*, customers.email, customers.full_name, customers.phone FROM delivery_orders JOIN customers ON customers.id = delivery_orders.customer_id WHERE delivery_id = ? ORDER BY customers.full_name", delivery.id);
  const items = orders.length ? await all<Record<string, unknown> & { delivery_order_id: string }>(`SELECT * FROM delivery_items WHERE delivery_order_id IN (${orders.map(() => "?").join(",")}) ORDER BY product_name`, ...orders.map((order) => order.id)) : [];
  const preparation = await all<Record<string, unknown>>("SELECT di.product_id, di.product_name, di.unit_label, SUM(di.quantity) AS total_quantity FROM delivery_items di JOIN delivery_orders dor ON dor.id = di.delivery_order_id WHERE dor.delivery_id = ? AND dor.status != 'cancelled' GROUP BY di.product_id, di.product_name, di.unit_label ORDER BY di.product_name", delivery.id);
  return { delivery, preparation, orders: orders.map((order) => ({ ...order, customer_snapshot: JSON.parse(String(order.customer_snapshot_json)), items: items.filter((item) => item.delivery_order_id === order.id) })) };
}

export async function getDelivery(date: string) {
  const normalized = assertLocalDate(date);
  const delivery = await first<DeliveryRow>("SELECT * FROM deliveries WHERE delivery_date = ?", normalized);
  if (!delivery) return { delivery: null, preparation: [], orders: [], canGenerate: true };
  return { ...(await deliveryPayload(normalized)), canGenerate: false };
}

export async function listDeliveries(limit = 60) {
  return all<Record<string, unknown>>("SELECT d.*, COUNT(do.id) AS order_count FROM deliveries d LEFT JOIN delivery_orders do ON do.delivery_id = d.id GROUP BY d.id ORDER BY d.delivery_date DESC LIMIT ?", limit);
}

export async function generateDelivery(rawDate: unknown, rawKey: string | null) {
  const date = assertLocalDate(rawDate);
  const generationKey = requiredString(rawKey, "Idempotency-Key", 200);
  assertDomain(generationKey.length >= 8, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key must contain at least 8 characters.", 422);
  const settings = await getBusinessSettings();
  const now = new Date().toISOString();
  const delivery = await first<DeliveryRow>("SELECT * FROM deliveries WHERE delivery_date = ?", date);
  if (delivery && delivery.status !== "open") return deliveryPayload(date);
  if (delivery?.generation_key === generationKey) return deliveryPayload(date);
  const deliveryId = delivery?.id ?? crypto.randomUUID();
  const cutoffAt = delivery?.cutoff_at ?? cutoffForDelivery(date, settings.cutoffHours, settings.deliveryLocalTime);

  const oneTimeSources = await all<CustomerSnapshotRow & { source_order_id: string }>(
    "SELECT o.id AS source_order_id, o.customer_id, c.full_name, c.email, c.phone, c.address_line_1, c.address_line_2, c.city, c.postal_code, COALESCE(o.customer_note, c.delivery_note) AS delivery_note FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.delivery_date = ? AND o.kind = 'one_time' AND o.fulfillment_status = 'planned' AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.purchase_type = 'one_time')",
    date,
  );
  const subscriptionSources = await all<CustomerSnapshotRow & { subscription_id: string }>(
    "SELECT s.id AS subscription_id, s.customer_id, c.full_name, c.email, c.phone, c.address_line_1, c.address_line_2, c.city, c.postal_code, c.delivery_note FROM subscriptions s JOIN customers c ON c.id = s.customer_id WHERE (s.status = 'active' OR (s.status = 'paused' AND s.pause_until <= ?)) AND s.next_delivery_date <= ? AND NOT EXISTS (SELECT 1 FROM subscription_skips sk WHERE sk.subscription_id = s.id AND sk.delivery_date = ?)",
    date, date, date,
  );
  const orderItems = oneTimeSources.length ? await all<ItemSnapshotRow>(`SELECT oi.order_id AS source_id, oi.product_id, oi.product_name, oi.unit_label, oi.quantity, oi.unit_price_minor, 'order' AS source_type FROM order_items oi WHERE oi.purchase_type = 'one_time' AND oi.order_id IN (${oneTimeSources.map(() => "?").join(",")})`, ...oneTimeSources.map((source) => source.source_order_id)) : [];
  const subscriptionItems = subscriptionSources.length ? await all<(ItemSnapshotRow & { cadence: "weekly" | "biweekly"; cadence_anchor_date: string })>(`SELECT si.subscription_id AS source_id, si.product_id, p.name AS product_name, p.unit_label, si.quantity, COALESCE(p.subscription_price_minor, p.price_minor) AS unit_price_minor, 'subscription' AS source_type, si.cadence, si.cadence_anchor_date FROM subscription_items si JOIN products p ON p.id = si.product_id WHERE si.status = 'active' AND si.subscription_id IN (${subscriptionSources.map(() => "?").join(",")})`, ...subscriptionSources.map((source) => source.subscription_id)) : [];
  const addons = subscriptionSources.length ? await all<ItemSnapshotRow>(`SELECT a.subscription_id AS source_id, a.product_id, p.name AS product_name, p.unit_label, a.quantity, a.unit_price_minor, 'next_only' AS source_type FROM next_delivery_addons a JOIN products p ON p.id = a.product_id WHERE a.delivery_date = ? AND a.consumed_at IS NULL AND a.cancelled_at IS NULL AND a.subscription_id IN (${subscriptionSources.map(() => "?").join(",")})`, date, ...subscriptionSources.map((source) => source.subscription_id)) : [];

  const statements: Array<{ sql: string; bindings?: SqlValue[] }> = [];
  if (delivery) {
    statements.push({ sql: "DELETE FROM delivery_items WHERE delivery_order_id IN (SELECT id FROM delivery_orders WHERE delivery_id = ?)", bindings: [deliveryId] });
    statements.push({ sql: "DELETE FROM delivery_orders WHERE delivery_id = ?", bindings: [deliveryId] });
    statements.push({ sql: "UPDATE deliveries SET generated_at = ?, generation_key = ? WHERE id = ?", bindings: [now, generationKey, deliveryId] });
  } else {
    statements.push({ sql: "INSERT INTO deliveries (id, delivery_date, cutoff_at, status, generated_at, generation_key) VALUES (?, ?, ?, 'open', ?, ?)", bindings: [deliveryId, date, cutoffAt, now, generationKey] });
  }
  const addDeliveryOrder = (source: CustomerSnapshotRow, sourceOrderId: string | null, subscriptionId: string | null, sourceItems: ItemSnapshotRow[]) => {
    if (!sourceItems.length) return;
    const id = crypto.randomUUID();
    const snapshot = { fullName: source.full_name, email: source.email, phone: source.phone, addressLine1: source.address_line_1, addressLine2: source.address_line_2, city: source.city, postalCode: source.postal_code };
    statements.push({ sql: "INSERT INTO delivery_orders (id, delivery_id, source_order_id, subscription_id, customer_id, customer_snapshot_json, note, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'planned')", bindings: [id, deliveryId, sourceOrderId, subscriptionId, source.customer_id, JSON.stringify(snapshot), source.delivery_note] });
    for (const item of sourceItems) statements.push({ sql: "INSERT INTO delivery_items (id, delivery_order_id, product_id, product_name, unit_label, quantity, unit_price_minor, source_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", bindings: [crypto.randomUUID(), id, item.product_id, item.product_name, item.unit_label, item.quantity, item.unit_price_minor, item.source_type] });
  };
  for (const source of oneTimeSources) addDeliveryOrder(source, source.source_order_id, null, orderItems.filter((item) => item.source_id === source.source_order_id));
  for (const source of subscriptionSources) {
    const due = subscriptionItems.filter((item) => item.source_id === source.subscription_id && isCadenceDue(item.cadence_anchor_date, date, item.cadence));
    addDeliveryOrder(source, null, source.subscription_id, [...due, ...addons.filter((item) => item.source_id === source.subscription_id)]);
  }
  statements.push(audit("system", "delivery-job", delivery ? "delivery.regenerated" : "delivery.generated", "delivery", deliveryId, delivery, { date, cutoffAt }));
  statements.push(enqueue("delivery.generated", "delivery", deliveryId, { date, cutoffAt }));
  await batch(statements);
  return deliveryPayload(date);
}

export async function lockDelivery(rawDate: unknown, idempotencyKey: string | null, force = false) {
  const date = assertLocalDate(rawDate);
  const key = requiredString(idempotencyKey, "Idempotency-Key", 200);
  assertDomain(key.length >= 8, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key must contain at least 8 characters.", 422);
  const hash = await stableJsonHash({ date, force });
  const replay = await first<{ request_hash: string } & Record<string, unknown>>("SELECT request_hash FROM idempotency_keys WHERE namespace = 'delivery-lock' AND key = ?", key);
  if (replay) {
    assertDomain(replay.request_hash === hash, "IDEMPOTENCY_CONFLICT", "This Idempotency-Key was already used for a different delivery lock.", 409);
    return deliveryPayload(date);
  }
  const delivery = await first<DeliveryRow>("SELECT * FROM deliveries WHERE delivery_date = ?", date);
  if (!delivery) throw new DomainError("DELIVERY_NOT_FOUND", "Generate the delivery before locking it.", 404);
  if (delivery.status === "locked" || delivery.status === "completed") return deliveryPayload(date);
  assertDomain(force || Date.now() >= Date.parse(delivery.cutoff_at), "CUTOFF_NOT_REACHED", "Delivery cannot be locked before cutoff unless force=true is explicitly used by an admin.", 409, { cutoffAt: delivery.cutoff_at });
  const response = { deliveryId: delivery.id, date, status: "locked" };
  const subscriptionRows = await all<{ subscription_id: string } & Record<string, unknown>>("SELECT DISTINCT subscription_id FROM delivery_orders WHERE delivery_id = ? AND subscription_id IS NOT NULL", delivery.id);
  const advanceStatements: Array<{ sql: string; bindings?: SqlValue[] }> = [];
  for (const row of subscriptionRows) {
    const items = await all<{ cadence: "weekly" | "biweekly"; cadence_anchor_date: string } & Record<string, unknown>>("SELECT cadence, cadence_anchor_date FROM subscription_items WHERE subscription_id = ? AND status = 'active'", row.subscription_id);
    let nextDate = addLocalDays(date, 7);
    for (let attempts = 0; attempts < 8 && items.length && !items.some((item) => isCadenceDue(item.cadence_anchor_date, nextDate, item.cadence)); attempts += 1) nextDate = addLocalDays(nextDate, 7);
    advanceStatements.push({ sql: "UPDATE subscriptions SET next_delivery_date = ?, status = CASE WHEN status = 'paused' THEN 'active' ELSE status END, pause_until = NULL, updated_at = ? WHERE id = ? AND next_delivery_date <= ?", bindings: [nextDate, new Date().toISOString(), row.subscription_id, date] });
  }
  await batch([
    { sql: "INSERT INTO idempotency_keys (id, namespace, key, request_hash, response_json, status_code, expires_at) VALUES (?, 'delivery-lock', ?, ?, ?, 200, ?) ON CONFLICT(namespace, key) DO NOTHING", bindings: [crypto.randomUUID(), key, hash, JSON.stringify(response), new Date(Date.now() + 30 * 86_400_000).toISOString()] },
    { sql: "UPDATE deliveries SET status = 'locked', locked_at = ? WHERE id = ? AND status = 'open'", bindings: [new Date().toISOString(), delivery.id] },
    { sql: "UPDATE delivery_orders SET status = 'locked' WHERE delivery_id = ? AND status = 'planned'", bindings: [delivery.id] },
    { sql: "UPDATE orders SET fulfillment_status = 'locked', updated_at = ? WHERE id IN (SELECT source_order_id FROM delivery_orders WHERE delivery_id = ? AND source_order_id IS NOT NULL)", bindings: [new Date().toISOString(), delivery.id] },
    { sql: "UPDATE next_delivery_addons SET consumed_at = ? WHERE delivery_date = ? AND cancelled_at IS NULL AND subscription_id IN (SELECT subscription_id FROM delivery_orders WHERE delivery_id = ?)", bindings: [new Date().toISOString(), date, delivery.id] },
    ...advanceStatements,
    audit("admin", "local-admin", "delivery.locked", "delivery", delivery.id, delivery, response),
    enqueue("delivery.locked", "delivery", delivery.id, response),
  ]);
  return deliveryPayload(date);
}

function exportRows(payload: Awaited<ReturnType<typeof deliveryPayload>>) {
  return payload.orders.map((order) => {
    const snapshot = order.customer_snapshot as Record<string, unknown>;
    const items = order.items as Array<Record<string, unknown>>;
    return {
      deliveryAddress: { line1: snapshot.addressLine1, line2: snapshot.addressLine2, city: snapshot.city, postalCode: snapshot.postalCode },
      customer: { fullName: snapshot.fullName, phone: snapshot.phone, email: snapshot.email },
      note: order.note,
      orderId: order.source_order_id ?? order.subscription_id ?? order.id,
      items: items.map((item) => ({ name: item.product_name, unit: item.unit_label, quantity: Number(item.quantity) })),
    };
  });
}

export async function spokeCsv(rawDate: unknown): Promise<string> {
  const payload = await deliveryPayload(assertLocalDate(rawDate));
  return buildSpokeCsv(exportRows(payload));
}

export async function deliveryXlsx(rawDate: unknown): Promise<Uint8Array> {
  const date = assertLocalDate(rawDate);
  const payload = await deliveryPayload(date);
  const deliveries = exportRows(payload);
  return buildXlsx([
    {
      name: "Dostave",
      rows: [
        ["Address Line 1", "Address Line 2", "City", "Postal Code", "Customer name", "Phone", "Email", "Notes", "Order ID", "Products"],
        ...deliveries.map((order) => [order.deliveryAddress.line1 as string, order.deliveryAddress.line2 as string, order.deliveryAddress.city as string, order.deliveryAddress.postalCode as string, order.customer.fullName as string, order.customer.phone as string, order.customer.email as string, order.note, order.orderId as string, order.items.map((item) => `${item.quantity} x ${String(item.name)}${item.unit ? ` (${String(item.unit)})` : ""}`).join("; ")]),
      ],
    },
    {
      name: "Priprema",
      rows: [
        ["Datum dostave", "Proizvod", "Jedinica", "Ukupna količina"],
        ...payload.preparation.map((item) => [date, item.product_name as string, item.unit_label as string, Number(item.total_quantity)]),
      ],
    },
  ]);
}
