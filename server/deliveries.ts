import { shippingSnapshot } from "./address-snapshot";
import { packageSchedule } from "./packages";
import { contactEmail } from "./customer-contact";
import { stableJsonHash } from "./crypto";
import { DomainError, assertDomain, requiredString } from "./domain";
import { audit, enqueue } from "./outbox";
import { all, batch, first, type SqlValue } from "./sql";
import { addLocalDays, assertLocalDate, cutoffForDelivery, daysBetween, isCadenceDue } from "./time";
import { getBusinessSettings } from "./settings";
import { buildXlsx } from "./xlsx";
import { mutationGuard } from "./mutation-guard";
import { buildSpokeCsv } from "../integrations/spoke-csv.mjs";

interface DeliveryRow extends Record<string, unknown> {
  id: string; delivery_date: string; cutoff_at: string; status: "open" | "locked" | "completed";
  generated_at: string; locked_at: string | null; generation_key: string;
}

interface CustomerSnapshotRow extends Record<string, unknown> {
  customer_id: string; source_version?: number; next_delivery_date?: string; source_updated_at?: string; full_name: string; email: string; phone: string; address_line_1: string; address_line_2: string | null;
  city: string; postal_code: string; delivery_note: string | null;
}

interface ItemSnapshotRow extends Record<string, unknown> {
  source_id: string; product_id: string; product_name: string; unit_label: string; quantity: number; unit_price_minor: number; source_type: "order" | "subscription" | "next_only"; package_line_id?: string | null; order_item_id?: string | null;
}

interface DeliveryOrderView extends Record<string, unknown> {
  id: string;
  customer_id: string;
  status: string;
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
  const { deliveryDeadline } = await import("./delivery-cutoff");
  if ((await deliveryDeadline(normalized)).locked) return { ...await generateDelivery(normalized, `deadline:${normalized}`), canGenerate: false };
  const delivery = await first<DeliveryRow>("SELECT * FROM deliveries WHERE delivery_date = ?", normalized);
  if (!delivery) return { delivery: null, preparation: [], orders: [], canGenerate: true };
  return { ...(await deliveryPayload(normalized)), canGenerate: false };
}

export async function listDeliveries(limit = 60) {
  await lockOverdueDeliveries();
  return all<Record<string, unknown>>("SELECT d.*, COUNT(dor.id) AS order_count FROM deliveries d LEFT JOIN delivery_orders dor ON dor.delivery_id = d.id GROUP BY d.id ORDER BY d.delivery_date DESC LIMIT ?", limit);
}

export async function generateDelivery(rawDate: unknown, rawKey: string | null, preview = false, forceLock = false) {
  const date = assertLocalDate(rawDate);
  const generationKey = requiredString(rawKey, "Idempotency-Key", 200);
  assertDomain(generationKey.length >= 8, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key must contain at least 8 characters.", 422);
  const settings = await getBusinessSettings();
  const now = new Date().toISOString();
  const delivery = await first<DeliveryRow>("SELECT * FROM deliveries WHERE delivery_date = ?", date);
  if (delivery && delivery.status !== "open") return deliveryPayload(date);
  if (!preview && !forceLock && delivery?.generation_key === generationKey) {
    if (Date.now() >= Date.parse(delivery.cutoff_at)) return generateDelivery(date, `deadline-refresh:${date}:${crypto.randomUUID()}`);
    return deliveryPayload(date);
  }
  if (settings.holidays.includes(date) && !delivery?.locked_at) return {delivery: delivery ?? {id:"holiday",delivery_date:date,cutoff_at:cutoffForDelivery(date,settings.cutoffHours,settings.deliveryLocalTime),status:"open" as const,generated_at:now,locked_at:null,generation_key:generationKey},orders:[],preparation:[]};
  const deliveryId = delivery?.id ?? crypto.randomUUID();
  const cutoffAt = delivery?.cutoff_at ?? cutoffForDelivery(date, settings.cutoffHours, settings.deliveryLocalTime);
  // At the deadline even a preview persists the final immutable snapshot.
  if (preview && Date.now() >= Date.parse(cutoffAt)) return generateDelivery(date, `deadline:${date}`);

  const oneTimeSources = await all<CustomerSnapshotRow & { source_order_id: string }>(
    "SELECT o.id AS source_order_id, o.shipping_json, o.updated_at AS source_updated_at, o.customer_id, c.full_name, c.email, c.phone, c.address_line_1, c.address_line_2, c.city, c.postal_code, COALESCE(o.customer_note, c.delivery_note) AS delivery_note FROM orders o JOIN customers c ON c.id = o.customer_id WHERE NOT EXISTS(SELECT 1 FROM refund_requests r WHERE r.order_id=o.id AND r.status IN ('requested','approved','processing','unknown')) AND o.delivery_date = ? AND o.kind IN ('one_time', 'subscription_invoice') AND o.fulfillment_status = 'planned' AND (o.payment_status = 'paid' OR NOT EXISTS (SELECT 1 FROM subscription_packages sp WHERE sp.order_id = o.id)) AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.purchase_type = 'one_time')",
    date,
  );
  const subscriptionSources = await all<CustomerSnapshotRow & { subscription_id: string }>(
    "SELECT s.id AS subscription_id, s.shipping_json, s.next_delivery_date, s.version AS source_version, s.customer_id, c.full_name, c.email, c.phone, c.address_line_1, c.address_line_2, c.city, c.postal_code, c.delivery_note FROM subscriptions s JOIN customers c ON c.id = s.customer_id WHERE (s.status = 'active' OR (s.status = 'paused' AND s.pause_until <= ?)) AND s.next_delivery_date <= ? AND NOT EXISTS (SELECT 1 FROM subscription_skips sk WHERE sk.subscription_id = s.id AND sk.delivery_date = ?)",
    date, date, date,
  );
  const orderItems = oneTimeSources.length ? await all<ItemSnapshotRow>(`SELECT oi.order_id AS source_id, oi.id AS order_item_id, oi.product_id, oi.product_name, oi.unit_label, oi.quantity - (SELECT COALESCE(SUM(COALESCE(di.delivered_quantity,di.quantity)),0) FROM delivery_items di JOIN delivery_orders dor ON dor.id=di.delivery_order_id WHERE di.order_item_id=oi.id AND dor.status='delivered') AS quantity, oi.unit_price_minor, 'order' AS source_type, (SELECT pl.id FROM package_lines pl WHERE pl.order_item_id = oi.id) AS package_line_id FROM order_items oi WHERE oi.purchase_type = 'one_time' AND oi.order_id IN (${oneTimeSources.map(() => "?").join(",")})`, ...oneTimeSources.map((source) => source.source_order_id)) : [];
  let subscriptionItems = subscriptionSources.length ? await all<(ItemSnapshotRow & { cadence: "weekly" | "biweekly"; cadence_anchor_date: string })>(`SELECT si.subscription_id AS source_id, si.product_id, p.name AS product_name, p.unit_label, si.quantity, COALESCE(p.subscription_price_minor, p.price_minor) AS unit_price_minor, 'subscription' AS source_type, si.cadence, si.cadence_anchor_date FROM subscription_items si JOIN products p ON p.id = si.product_id WHERE si.status = 'active' AND si.subscription_id IN (${subscriptionSources.map(() => "?").join(",")})`, ...subscriptionSources.map((source) => source.subscription_id)) : [];
  const managedSubscriptions = new Set((await all<{subscription_id: string} & Record<string, unknown>>("SELECT DISTINCT subscription_id FROM subscription_packages")).map(row => row.subscription_id));
  subscriptionItems = subscriptionItems.filter(item => !managedSubscriptions.has(item.source_id));
  const purchasedItems = await all<ItemSnapshotRow & { cadence: "weekly" | "biweekly"; cadence_anchor_date: string }>(`
    SELECT sp.subscription_id AS source_id, oi.id AS order_item_id, oi.product_id, oi.product_name, oi.unit_label, oi.quantity, oi.unit_price_minor,
      'subscription' AS source_type, COALESCE(oi.cadence, 'weekly') AS cadence, pl.anchor_date AS cadence_anchor_date, pl.id AS package_line_id, pl.required_deliveries, (SELECT COALESCE(SUM(CASE WHEN dor.status = 'delivered' THEN COALESCE(di.delivered_quantity,di.quantity) ELSE di.quantity END),0) FROM delivery_items di JOIN delivery_orders dor ON dor.id = di.delivery_order_id JOIN deliveries d ON d.id = dor.delivery_id WHERE di.package_line_id = pl.id AND dor.status IN ('locked','delivered') AND d.delivery_date != ?) AS reserved, pl.cancelled_quantity, pl.imported_delivered_quantity
    FROM package_lines pl JOIN subscription_packages sp ON sp.id = pl.package_id JOIN orders o ON o.id = sp.order_id JOIN order_items oi ON oi.id = pl.order_item_id
    WHERE sp.status = 'open' AND o.payment_status = 'paid' AND NOT EXISTS(SELECT 1 FROM refund_requests r WHERE r.order_id=o.id AND r.status IN ('requested','approved','processing','unknown')) AND (oi.purchase_type = 'subscription' OR (pl.anchor_date < ?)) AND
      (SELECT COALESCE(SUM(CASE WHEN dor.status = 'delivered' THEN COALESCE(di.delivered_quantity,di.quantity) ELSE di.quantity END),0) FROM delivery_items di JOIN delivery_orders dor ON dor.id = di.delivery_order_id JOIN deliveries d ON d.id = dor.delivery_id
       WHERE di.package_line_id = pl.id AND dor.status IN ('locked','delivered') AND d.delivery_date != ?) + pl.cancelled_quantity + pl.imported_delivered_quantity < pl.required_deliveries * oi.quantity`, date, date, date);
  subscriptionItems.push(...purchasedItems.filter(item => {
    const source = subscriptionSources.find(source => source.subscription_id === item.source_id);
    if (!source?.next_delivery_date) return false;
    let firstDate = source.next_delivery_date;
    for (let n = 0; n < 110 && (settings.holidays.includes(firstDate) || !isCadenceDue(item.cadence_anchor_date, firstDate, item.cadence)); n++) firstDate = addLocalDays(firstDate, 7);
    const projectedIndex = Math.floor(daysBetween(firstDate, date) / (item.cadence === "weekly" ? 7 : 14));
    const remaining = item.quantity * Number(item.required_deliveries) - Number(item.cancelled_quantity) - Number(item.imported_delivered_quantity) - Number(item.reserved) - projectedIndex * item.quantity;
    if (projectedIndex < 0 || remaining <= 0) return false;
    item.quantity = Math.min(item.quantity, remaining);
    return true;
  }));
  const addons = subscriptionSources.length ? await all<ItemSnapshotRow>(`SELECT a.subscription_id AS source_id, (SELECT id FROM order_items WHERE order_id=a.order_id LIMIT 1) AS order_item_id, a.product_id, p.name AS product_name, p.unit_label, a.quantity, a.unit_price_minor, 'next_only' AS source_type FROM next_delivery_addons a JOIN products p ON p.id = a.product_id WHERE a.delivery_date = ? AND a.consumed_at IS NULL AND a.cancelled_at IS NULL AND a.subscription_id IN (${subscriptionSources.map(() => "?").join(",")})`, date, ...subscriptionSources.map((source) => source.subscription_id)) : [];

  const conditions = [delivery ? "EXISTS (SELECT 1 FROM deliveries WHERE id = ? AND status = 'open' AND generation_key = ?)" : "NOT EXISTS (SELECT 1 FROM deliveries WHERE delivery_date = ?)"];
  const guardBindings: SqlValue[] = delivery ? [delivery.id, delivery.generation_key] : [date];
  conditions.push("(SELECT COUNT(*) FROM orders o WHERE NOT EXISTS(SELECT 1 FROM refund_requests r WHERE r.order_id=o.id AND r.status IN ('requested','approved','processing','unknown')) AND o.delivery_date = ? AND o.kind IN ('one_time', 'subscription_invoice') AND o.fulfillment_status = 'planned' AND (o.payment_status = 'paid' OR NOT EXISTS (SELECT 1 FROM subscription_packages sp WHERE sp.order_id = o.id)) AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.purchase_type = 'one_time')) = ?");
  guardBindings.push(date, oneTimeSources.length);
  conditions.push("(SELECT COUNT(*) FROM subscriptions s WHERE (s.status = 'active' OR (s.status = 'paused' AND s.pause_until <= ?)) AND s.next_delivery_date <= ? AND NOT EXISTS (SELECT 1 FROM subscription_skips sk WHERE sk.subscription_id = s.id AND sk.delivery_date = ?)) = ?");
  guardBindings.push(date, date, date, subscriptionSources.length);
  for (const source of subscriptionSources) { conditions.push("EXISTS (SELECT 1 FROM subscriptions WHERE id = ? AND version = ?)"); guardBindings.push(source.subscription_id, Number(source.source_version)); }
  for (const source of oneTimeSources) { conditions.push("EXISTS (SELECT 1 FROM orders WHERE id = ? AND updated_at = ? AND fulfillment_status = 'planned')"); guardBindings.push(source.source_order_id, String(source.source_updated_at)); }
  const guard = mutationGuard(conditions.join(" AND "), guardBindings);
  const statements: Array<{ sql: string; bindings?: SqlValue[] }> = [guard.check];
  if (delivery) {
    statements.push({ sql: "DELETE FROM delivery_items WHERE delivery_order_id IN (SELECT id FROM delivery_orders WHERE delivery_id = ?)", bindings: [deliveryId] });
    statements.push({ sql: "DELETE FROM delivery_orders WHERE delivery_id = ?", bindings: [deliveryId] });
    statements.push({ sql: "UPDATE deliveries SET generated_at = ?, generation_key = ? WHERE id = ?", bindings: [now, generationKey, deliveryId] });
  } else {
    statements.push({ sql: "INSERT INTO deliveries (id, delivery_date, cutoff_at, status, generated_at, generation_key) VALUES (?, ?, ?, 'open', ?, ?)", bindings: [deliveryId, date, cutoffAt, now, generationKey] });
  }
  const previewOrders: Awaited<ReturnType<typeof deliveryPayload>>["orders"] = [];
  const addDeliveryOrder = (source: CustomerSnapshotRow, sourceOrderId: string | null, subscriptionId: string | null, sourceItems: ItemSnapshotRow[]) => {
    sourceItems = sourceItems.filter(item=>item.quantity > 0);
    if (!sourceItems.length) return;
    const id = crypto.randomUUID();
    const snapshot = { ...shippingSnapshot(source), email: contactEmail(source.email) };
    previewOrders.push({ id, note: source.delivery_note, source_order_id: sourceOrderId, subscription_id: subscriptionId,
      customer_id: source.customer_id, customer_snapshot_json: JSON.stringify(snapshot), customer_snapshot: snapshot,
      status: "planned", items: sourceItems.map(item => ({ ...item, delivery_order_id: id })) });
    statements.push({ sql: "INSERT INTO delivery_orders (id, delivery_id, source_order_id, subscription_id, customer_id, customer_snapshot_json, note, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'planned')", bindings: [id, deliveryId, sourceOrderId, subscriptionId, source.customer_id, JSON.stringify(snapshot), source.delivery_note] });
    for (const item of sourceItems) statements.push({ sql: "INSERT INTO delivery_items (id, delivery_order_id, product_id, product_name, unit_label, quantity, unit_price_minor, source_type, package_line_id, order_item_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", bindings: [crypto.randomUUID(), id, item.product_id, item.product_name, item.unit_label, item.quantity, item.unit_price_minor, item.source_type, item.package_line_id ?? null, item.order_item_id ?? null] });
  };
  for (const source of oneTimeSources) addDeliveryOrder(source, source.source_order_id, null, orderItems.filter((item) => item.source_id === source.source_order_id));
  for (const source of subscriptionSources) {
    const due = subscriptionItems.filter((item) => item.source_id === source.subscription_id && isCadenceDue(item.cadence_anchor_date, date, item.cadence));
    addDeliveryOrder(source, null, source.subscription_id, [...due, ...addons.filter((item) => item.source_id === source.subscription_id)]);
  }
  if (preview) {
    const totals = new Map<string, Record<string, unknown>>();
    for (const order of previewOrders) for (const item of order.items) {
      const key = String(item.product_id);
      const previous = totals.get(key);
      totals.set(key, { product_id: key, product_name: item.product_name, unit_label: item.unit_label, total_quantity: Number(previous?.total_quantity ?? 0) + Number(item.quantity) });
    }
    return { delivery: delivery ?? { id: deliveryId, delivery_date: date, cutoff_at: cutoffAt, status: "open" as const, generated_at: now, locked_at: null, generation_key: generationKey }, orders: previewOrders, preparation: [...totals.values()] };
  }
  statements.push(audit("system", "delivery-job", delivery ? "delivery.regenerated" : "delivery.generated", "delivery", deliveryId, delivery, { date, cutoffAt }));
  statements.push(enqueue("delivery.generated", "delivery", deliveryId, { date, cutoffAt }));
  // Materialization and lock are one transaction: no accepted mutation can slip between them.
  if (forceLock || Date.now() >= Date.parse(cutoffAt)) {
    for (const order of previewOrders) for (const item of order.items) if (item.package_line_id) {
      const allocationGuard = mutationGuard("EXISTS (SELECT 1 FROM package_lines pl JOIN subscription_packages sp ON sp.id = pl.package_id JOIN orders o ON o.id = sp.order_id WHERE pl.id = ? AND sp.status = 'open' AND o.payment_status = 'paid' AND NOT EXISTS(SELECT 1 FROM refund_requests r WHERE r.order_id=o.id AND r.status IN ('requested','approved','processing','unknown')) AND (SELECT COALESCE(SUM(CASE WHEN dor.status = 'delivered' THEN COALESCE(di.delivered_quantity,di.quantity) ELSE di.quantity END),0) FROM delivery_items di JOIN delivery_orders dor ON dor.id = di.delivery_order_id WHERE di.package_line_id = pl.id AND dor.status IN ('locked','delivered')) + pl.cancelled_quantity + pl.imported_delivered_quantity + ? <= pl.required_deliveries * (SELECT quantity FROM order_items WHERE id = pl.order_item_id))", [String(item.package_line_id), Number(item.quantity)]);
      statements.push(allocationGuard.check, allocationGuard.cleanup);
    }
    statements.push(...await lockStatements(deliveryId, date, previewOrders.filter(order => order.subscription_id).map(order => String(order.subscription_id))));
    statements.push(audit(forceLock ? "admin" : "system", forceLock ? "admin-panel" : "delivery-deadline", "delivery.locked", "delivery", deliveryId, delivery, { date, cutoffAt }));
    statements.push(enqueue("delivery.locked", "delivery", deliveryId, { date, cutoffAt }));
  }
  try { await batch([...statements, guard.cleanup]); }
  catch (error) {
    const current = await first<DeliveryRow>("SELECT * FROM deliveries WHERE delivery_date = ?", date);
    if (current && current.status !== "open") return deliveryPayload(date);
    if (/mutation_guards|allowed|CHECK constraint|deliveries_delivery_date/i.test(String(error))) throw new DomainError("DELIVERY_VERSION_CONFLICT", "Lista dostave se upravo promenila. Osvežite prikaz.", 409);
    throw error;
  }
  return deliveryPayload(date);
}

async function lockStatements(deliveryId: string, date: string, subscriptionIds: string[]) {
  const settings = await getBusinessSettings();
  const advanceStatements: Array<{ sql: string; bindings?: SqlValue[] }> = [];
  for (const row of subscriptionIds.map(subscription_id => ({ subscription_id }))) {
    const currentItems = await all<{ cadence: "weekly" | "biweekly"; cadence_anchor_date: string } & Record<string, unknown>>("SELECT cadence, cadence_anchor_date FROM subscription_items WHERE subscription_id = ? AND status = 'active'", row.subscription_id);
    const purchased = await packageSchedule(row.subscription_id);
    const items = purchased.length ? purchased : currentItems;
    let nextDate = addLocalDays(date, 7);
    for (let attempts = 0; attempts < 110 && (settings.holidays.includes(nextDate) || (items.length && !items.some((item) => isCadenceDue(item.cadence_anchor_date, nextDate, item.cadence)))); attempts += 1) nextDate = addLocalDays(nextDate, 7);
    advanceStatements.push({ sql: "UPDATE subscriptions SET next_delivery_date = ?, version = version + 1, status = CASE WHEN status = 'paused' THEN 'active' ELSE status END, pause_until = NULL, pause_started_on = NULL, updated_at = ? WHERE id = ? AND next_delivery_date <= ?", bindings: [nextDate, new Date().toISOString(), row.subscription_id, date] });
  }
  return [
    { sql: "UPDATE deliveries SET status = 'locked', locked_at = ? WHERE id = ? AND status = 'open'", bindings: [new Date().toISOString(), deliveryId] },
    { sql: "UPDATE delivery_orders SET status = 'locked' WHERE delivery_id = ? AND status = 'planned'", bindings: [deliveryId] },
    { sql: "UPDATE orders SET fulfillment_status = 'locked', updated_at = ? WHERE id IN (SELECT source_order_id FROM delivery_orders WHERE delivery_id = ? AND source_order_id IS NOT NULL)", bindings: [new Date().toISOString(), deliveryId] },
    { sql: "UPDATE next_delivery_addons SET consumed_at = ? WHERE delivery_date = ? AND cancelled_at IS NULL AND subscription_id IN (SELECT subscription_id FROM delivery_orders WHERE delivery_id = ?)", bindings: [new Date().toISOString(), date, deliveryId] },
    ...advanceStatements,
  ];
}

export async function lockDelivery(rawDate: unknown, idempotencyKey: string | null, force = false, actor: "admin" | "system" = "admin") {
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
  const result = await generateDelivery(date, `lock:${key}`, false, true);
  await batch([{ sql: "INSERT INTO idempotency_keys (id, namespace, key, request_hash, response_json, status_code, expires_at) VALUES (?, 'delivery-lock', ?, ?, ?, 200, ?) ON CONFLICT(namespace, key) DO NOTHING", bindings: [crypto.randomUUID(), key, hash, JSON.stringify({ deliveryId: delivery.id, date, actor, status: "locked" }), new Date(Date.now() + 30 * 86_400_000).toISOString()] }]);
  return result;
}

/** Scheduler catch-up and request-time materialization; the timestamp guard is always authoritative. */
export async function lockOverdueDeliveries(customerId?: string) {
  const settings = await getBusinessSettings();
  const completed = new Set<string>();
  for (let pass = 0; pass < 16; pass++) {
    const candidates = await all<{ delivery_date: string } & Record<string, unknown>>(
      customerId
        ? "SELECT delivery_date FROM orders WHERE customer_id = ? AND fulfillment_status = 'planned' UNION SELECT next_delivery_date AS delivery_date FROM subscriptions WHERE customer_id = ? AND status IN ('active', 'paused') ORDER BY delivery_date LIMIT 200"
        : "SELECT delivery_date FROM deliveries WHERE status = 'open' UNION SELECT delivery_date FROM orders WHERE fulfillment_status = 'planned' UNION SELECT next_delivery_date AS delivery_date FROM subscriptions WHERE status IN ('active', 'paused') ORDER BY delivery_date LIMIT 200",
      ...(customerId ? [customerId, customerId] : []),
    );
    let progressed = false;
    for (const { delivery_date: date } of candidates) {
      if (completed.has(date)) continue;
      const existing = await first<DeliveryRow>("SELECT * FROM deliveries WHERE delivery_date = ?", date);
      const deadline = existing?.cutoff_at ?? cutoffForDelivery(date, settings.cutoffHours, settings.deliveryLocalTime);
      if (Date.now() < Date.parse(deadline)) continue;
      completed.add(date);
      if (existing && existing.status !== "open") continue;
      await generateDelivery(date, `deadline:${date}`);
      progressed = true;
    }
    if (!progressed) break;
  }
  return [...completed];
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
  const date = assertLocalDate(rawDate);
  await getDelivery(date);
  const payload = await deliveryPayload(date);
  return buildSpokeCsv(exportRows(payload));
}

export async function deliveryXlsx(rawDate: unknown): Promise<Uint8Array> {
  const date = assertLocalDate(rawDate);
  await getDelivery(date);
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
