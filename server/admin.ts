import { reserveInventory, releaseInventory } from "./inventory";
import { validatePolicy } from "./service-policy";
import { promoRules } from "./promotions";
import { shippingSnapshot } from "./address-snapshot";
import { DomainError, assertDomain, enumValue, nonNegativeInt, optionalString, requiredString } from "./domain";
import { orderFilters } from "./order-filters";
import { audit, enqueue } from "./outbox";
import { all, batch, first, type SqlValue } from "./sql";
import { getBusinessSettings } from "./settings";
import { purchaseAnalyticsEvent } from "./analytics";
import { quoteCart } from "./commerce";
import { generateDelivery, lockOverdueDeliveries } from "./deliveries";
import { cutoffForDelivery } from "./time";
import { assertDeliveryEditable } from "./delivery-cutoff";
import { mutationGuard } from "./mutation-guard";
import { activatePaidPackage } from "./packages";

export async function dashboard() {
  const [counts, revenue, nextDeliveries, preparation, funnel, topProducts, orderStates, profitBase, retention, postalProfit, channelProfit] = await Promise.all([
    first<Record<string, unknown>>(
      "SELECT (SELECT COUNT(*) FROM customers) AS customers, (SELECT COUNT(*) FROM subscriptions WHERE status = 'active') AS active_subscriptions, (SELECT COUNT(*) FROM orders) AS orders, (SELECT COUNT(*) FROM deliveries WHERE status = 'open') AS open_deliveries, (SELECT COUNT(*) FROM products WHERE is_active = 1) AS active_products",
    ),
    first<Record<string, unknown>>(
      "SELECT COALESCE(SUM(total_minor), 0) AS paid_revenue_minor, COALESCE(AVG(total_minor), 0) AS average_order_minor FROM orders WHERE payment_status = 'paid'",
    ),
    all<Record<string, unknown>>(
      "SELECT d.*, COUNT(o.id) AS order_count FROM deliveries d LEFT JOIN delivery_orders o ON o.delivery_id = d.id WHERE d.delivery_date >= date('now') GROUP BY d.id ORDER BY d.delivery_date LIMIT 8",
    ),
    all<Record<string, unknown>>(
      "SELECT d.delivery_date, di.product_name, di.unit_label, SUM(di.quantity) AS total_quantity FROM deliveries d JOIN delivery_orders dor ON dor.delivery_id = d.id JOIN delivery_items di ON di.delivery_order_id = dor.id WHERE d.delivery_date >= date('now') AND dor.status != 'cancelled' GROUP BY d.delivery_date, di.product_id, di.product_name, di.unit_label ORDER BY d.delivery_date, di.product_name LIMIT 100",
    ),
    all<Record<string, unknown>>(
      "SELECT event_name, COUNT(*) AS event_count, COUNT(DISTINCT session_id) AS sessions FROM analytics_events WHERE created_at >= datetime('now', '-30 days') GROUP BY event_name",
    ),
    all<Record<string, unknown>>(
      "SELECT product_name, SUM(quantity) AS units, SUM(line_total_minor) AS revenue_minor FROM order_items GROUP BY product_id, product_name ORDER BY revenue_minor DESC LIMIT 5",
    ),
    all<Record<string, unknown>>(
      "SELECT payment_status, fulfillment_status, COUNT(*) AS count FROM orders GROUP BY payment_status, fulfillment_status",
    ),
    first<Record<string, unknown>>(
      `SELECT
        COALESCE(SUM(total_minor), 0) AS revenue_minor,
        COALESCE(SUM(discount_minor), 0) AS discount_minor,
        COALESCE(SUM(delivery_fee_minor), 0) AS delivery_fee_revenue_minor,
        COALESCE(SUM(payment_fee_minor), 0) AS payment_fees_minor,
        COALESCE(SUM(estimated_delivery_cost_minor), 0) AS delivery_cost_minor,
        COALESCE((SELECT SUM(oi.total_cost_minor) FROM order_items oi JOIN orders paid ON paid.id = oi.order_id WHERE paid.payment_status = 'paid'), 0) AS product_cost_minor
       FROM orders WHERE payment_status = 'paid'`,
    ),
    first<Record<string, unknown>>(
      `SELECT
        (SELECT COUNT(*) FROM subscriptions WHERE status = 'active') AS active,
        (SELECT COUNT(*) FROM subscriptions WHERE status = 'cancelled' AND cancelled_at >= datetime('now', '-30 days')) AS cancelled_30d,
        (SELECT COUNT(*) FROM subscriptions) AS total,
        (SELECT COUNT(*) FROM abandoned_carts WHERE status = 'saved') AS recoverable_carts,
        (SELECT COUNT(*) FROM abandoned_carts WHERE status = 'converted') AS recovered_carts,
        (SELECT COALESCE(SUM(quantity * unit_price_minor), 0) FROM next_delivery_addons) AS addon_value_minor,
        (SELECT COUNT(DISTINCT o.id) FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE o.payment_status = 'paid' AND oi.purchase_type = 'subscription') AS subscription_orders,
        (SELECT COUNT(*) FROM orders WHERE payment_status = 'paid') AS paid_orders`,
    ),
    all<Record<string, unknown>>(
      `SELECT c.postal_code, COUNT(o.id) AS orders, SUM(o.total_minor) AS revenue_minor,
        SUM(o.total_minor - o.payment_fee_minor - o.estimated_delivery_cost_minor - COALESCE(costs.product_cost_minor, 0)) AS contribution_minor
       FROM orders o JOIN customers c ON c.id = o.customer_id
       LEFT JOIN (SELECT order_id, SUM(total_cost_minor) AS product_cost_minor FROM order_items GROUP BY order_id) costs ON costs.order_id = o.id
       WHERE o.payment_status = 'paid' GROUP BY c.postal_code ORDER BY contribution_minor DESC LIMIT 12`,
    ),
    all<Record<string, unknown>>(
      `SELECT COALESCE(NULLIF(json_extract(o.source_json, '$.utm_source'), ''), 'direct') AS channel, COUNT(o.id) AS orders,
        SUM(o.total_minor) AS revenue_minor,
        SUM(o.total_minor - o.payment_fee_minor - o.estimated_delivery_cost_minor - COALESCE(costs.product_cost_minor, 0)) AS contribution_minor
       FROM orders o LEFT JOIN (SELECT order_id, SUM(total_cost_minor) AS product_cost_minor FROM order_items GROUP BY order_id) costs ON costs.order_id = o.id
       WHERE o.payment_status = 'paid' GROUP BY channel ORDER BY contribution_minor DESC LIMIT 12`,
    ),
  ]);
  const profit = {
    ...profitBase,
    contribution_minor: Number(profitBase?.revenue_minor ?? 0) - Number(profitBase?.payment_fees_minor ?? 0) - Number(profitBase?.delivery_cost_minor ?? 0) - Number(profitBase?.product_cost_minor ?? 0),
  };
  return {
    counts,
    revenue: { ...revenue, currency: "RSD" },
    nextDeliveries,
    preparation,
    funnel,
    topProducts,
    orderStates,
    profit,
    retention,
    postalProfit,
    channelProfit,
  };
}

function directoryPage(params: URLSearchParams) {
  const page = Number(params.get("page") || 1), pageSize = Number(params.get("pageSize") || 50);
  assertDomain(Number.isInteger(page) && page >= 1 && page <= 1000000 && Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 100, "VALIDATION_ERROR", "Stranica ili broj rezultata nije ispravan.", 422);
  return { page, pageSize };
}
export async function listCustomers(params = new URLSearchParams()) {
  const { page, pageSize } = directoryPage(params);
  const query = optionalString(params.get("q"), "q", 200);
  const status = params.get("status");
  assertDomain(!status || ["active", "paused", "cancelled"].includes(status), "VALIDATION_ERROR", "Nepoznat status pretplate.", 422);
  const conditions: string[] = [], bindings: SqlValue[] = [];
  if (query) {
    conditions.push("(LOWER(c.full_name) LIKE LOWER(?) ESCAPE '!' OR LOWER(c.email) LIKE LOWER(?) ESCAPE '!' OR c.phone LIKE ? ESCAPE '!')");
    const pattern = `%${query.replace(/[!%_]/g, "!$&")}%`;
    bindings.push(pattern, pattern, pattern);
  }
  if (status) { conditions.push("EXISTS (SELECT 1 FROM subscriptions fs WHERE fs.customer_id = c.id AND fs.status = ?)"); bindings.push(status); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [customers, count] = await Promise.all([
    all<Record<string, unknown>>(`SELECT c.*, (SELECT COUNT(*) FROM subscriptions s WHERE s.customer_id = c.id) AS subscription_count, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count, (SELECT COALESCE(SUM(o.total_minor), 0) FROM orders o WHERE o.customer_id = c.id AND o.payment_status = 'paid') AS lifetime_value_minor FROM customers c ${where} ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`, ...bindings, pageSize, (page - 1) * pageSize),
    first<Record<string, unknown>>(`SELECT COUNT(*) AS total FROM customers c ${where}`, ...bindings),
  ]);
  return { customers, total: Number(count?.total || 0), page, pageSize };
}

export async function listSubscriptions(params = new URLSearchParams()) {
  const { page, pageSize } = directoryPage(params);
  const status = params.get("status"), customerId = optionalString(params.get("customerId"), "customerId", 100);
  assertDomain(!status || ["active", "paused", "cancelled"].includes(status), "VALIDATION_ERROR", "Nepoznat status pretplate.", 422);
  const conditions: string[] = [], bindings: SqlValue[] = [];
  if (status) { conditions.push("s.status = ?"); bindings.push(status); }
  if (customerId) { conditions.push("s.customer_id = ?"); bindings.push(customerId); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [subscriptions, count] = await Promise.all([
    all<Record<string, unknown>>(`SELECT s.*, c.full_name, c.email FROM subscriptions s JOIN customers c ON c.id = s.customer_id ${where} ORDER BY s.created_at DESC, s.id DESC LIMIT ? OFFSET ?`, ...bindings, pageSize, (page - 1) * pageSize),
    first<Record<string, unknown>>(`SELECT COUNT(*) AS total FROM subscriptions s ${where}`, ...bindings),
  ]);
  const paging = { total: Number(count?.total || 0), page, pageSize };
  if (!subscriptions.length) return { subscriptions: [], ...paging };
  const placeholders = subscriptions.map(() => "?").join(",");
  const ids = subscriptions.map((subscription) => String(subscription.id));
  const [items, skips] = await Promise.all([
    all<Record<string, unknown>>(`SELECT si.*, p.name AS product_name FROM subscription_items si JOIN products p ON p.id = si.product_id WHERE si.subscription_id IN (${placeholders}) AND si.status = 'active'`, ...ids),
    all<Record<string, unknown>>(`SELECT subscription_id, delivery_date FROM subscription_skips WHERE subscription_id IN (${placeholders}) ORDER BY delivery_date DESC`, ...ids),
  ]);
  return { ...paging, subscriptions: subscriptions.map((subscription) => {
    const activeItems = items.filter((item) => item.subscription_id === subscription.id);
    return { ...subscription, item_count: activeItems.length, items: activeItems, skips: skips.filter((skip) => skip.subscription_id === subscription.id) };
  }) };
}

export async function listOrders(params = new URLSearchParams()) {
  const { where, bindings, orderBy, page, pageSize } = orderFilters(params);
  const from = "FROM orders o JOIN customers c ON c.id = o.customer_id LEFT JOIN fiscal_receipts fr ON fr.order_id = o.id AND fr.id = (SELECT fx.id FROM fiscal_receipts fx WHERE fx.order_id = o.id AND fx.kind != 'refund' ORDER BY CASE WHEN fx.kind = 'final' THEN 0 WHEN fx.kind = 'advance' THEN 1 ELSE 2 END LIMIT 1)";
  const [orders, count] = await Promise.all([
    all<Record<string, unknown>>(`SELECT o.*, c.full_name, c.email, c.phone, fr.status AS fiscal_status, fr.invoice_number ${from} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, ...bindings, pageSize, (page - 1) * pageSize),
    first<Record<string, unknown>>(`SELECT COUNT(*) AS total ${from} ${where}`, ...bindings),
  ]);
  return { orders, total: Number(count?.total ?? 0), page, pageSize };
}

export async function updateOrder(input: Record<string, unknown>, actor: { type: "admin" | "customer"; id: string } = { type: "admin", id: "local-admin" }) {
  const id = requiredString(input.id, "id", 100);
  const before = await first<Record<string, unknown>>("SELECT * FROM orders WHERE id = ?", id);
  if (!before) throw new DomainError("ORDER_NOT_FOUND", "Porudžbina nije pronađena.", 404);
  assertDomain(actor.type !== "customer" || before.customer_id === actor.id, "ORDER_NOT_FOUND", "Porudžbina nije pronađena.", 404);
  if (input.expectedUpdatedAt !== undefined) assertDomain(input.expectedUpdatedAt === before.updated_at, "ORDER_VERSION_CONFLICT", "Porudžbina je u međuvremenu promenjena. Osvežite podatke.", 409);
  if (actor.type === "customer") assertDomain(before.kind === "one_time" && before.payment_status === "pending" && before.fulfillment_status === "planned" && input.paymentStatus === undefined && (input.fulfillmentStatus === undefined || input.fulfillmentStatus === "cancelled"), "ORDER_NOT_EDITABLE", "Ovu porudžbinu nije moguće samostalno menjati.", 409);
  const paymentStatus = input.paymentStatus === undefined
    ? String(before.payment_status)
    : enumValue(input.paymentStatus, "paymentStatus", ["pending", "paid", "failed", "refunded"] as const);
  const fulfillmentStatus = input.fulfillmentStatus === undefined
    ? String(before.fulfillment_status)
    : enumValue(input.fulfillmentStatus, "fulfillmentStatus", ["planned", "locked", "delivered", "cancelled"] as const);
  const packageOrder = await first<Record<string, unknown>>("SELECT status FROM subscription_packages WHERE order_id = ?", id);
  if (packageOrder) {
    assertDomain(paymentStatus === before.payment_status || (before.payment_status !== "paid" && paymentStatus === "paid"), "PACKAGE_PAYMENT_IMMUTABLE", "Za povraćaj uplaćenog paketa potrebna je zasebna refundacija sa fiskalnim dokumentom.", 409);
    assertDomain(fulfillmentStatus === before.fulfillment_status, "PACKAGE_DELIVERY_MANAGED", "Isporuke paketa potvrđujete pojedinačno u odeljku Dostave.", 409);
  }
  const customerNote = input.customerNote === undefined
    ? (typeof before.customer_note === "string" ? before.customer_note : null)
    : optionalString(input.customerNote, "customerNote", 500);
  const editingDelivery = input.items !== undefined || input.customer !== undefined;
  const changingContents = editingDelivery || customerNote !== before.customer_note || (fulfillmentStatus !== before.fulfillment_status && ["cancelled", "planned"].includes(fulfillmentStatus));
  if (changingContents) await assertDeliveryEditable(String(before.delivery_date));
  const after = { paymentStatus, fulfillmentStatus, customerNote };
  const statements: Array<{ sql: string; bindings?: SqlValue[] }> = [
    {
      sql: "UPDATE orders SET payment_status = ?, fulfillment_status = ?, customer_note = ?, updated_at = ? WHERE id = ?",
      bindings: [paymentStatus, fulfillmentStatus, customerNote ?? null, new Date(Math.max(Date.now(), Date.parse(String(before.updated_at)) + 1)).toISOString(), id],
    },
    audit(actor.type, actor.id, "order.updated", "order", id, before, after),
    enqueue("order.updated", "order", id, after),
  ];
  if (fulfillmentStatus === "cancelled" && before.fulfillment_status !== "cancelled") statements.push(...releaseInventory(id));
  if (editingDelivery) {
    if (input.customer !== undefined) await lockOverdueDeliveries(String(before.customer_id));
    assertDomain(before.kind === "one_time" && before.payment_status === "pending" && paymentStatus === "pending" && before.fulfillment_status === "planned" && fulfillmentStatus === "planned", "ORDER_NOT_EDITABLE", "Stavke i adresu možete menjati samo pre naplate i zaključavanja jednokratne porudžbine.", 409);
    const customer = await first<Record<string, unknown>>("SELECT * FROM customers WHERE id = ?", String(before.customer_id));
    assertDomain(customer, "CUSTOMER_NOT_FOUND", "Kupac nije pronađen.", 404);
    const address = input.customer === undefined ? {} : input.customer;
    assertDomain(address && typeof address === "object" && !Array.isArray(address), "VALIDATION_ERROR", "Adresa nije ispravna.", 422);
    const fields = address as Record<string, unknown>;
    const savedShipping = shippingSnapshot({ ...customer, shipping_json: before.shipping_json });
    const street = fields.addressLine1 === undefined ? String(savedShipping.addressLine1) : requiredString(fields.addressLine1, "addressLine1", 200);
    const city = fields.city === undefined ? String(savedShipping.city) : requiredString(fields.city, "city", 100);
    const postalCode = fields.postalCode === undefined ? String(savedShipping.postalCode) : requiredString(fields.postalCode, "postalCode", 5);
    const currentItems = await all<Record<string, unknown>>("SELECT product_id, quantity FROM order_items WHERE order_id = ?", id);
    const replacement = input.items ?? currentItems.map((item) => ({ productId: item.product_id, quantity: item.quantity }));
    assertDomain(Array.isArray(replacement) && replacement.every((item) => item && typeof item === "object" && !Array.isArray(item)), "VALIDATION_ERROR", "Stavke porudžbine nisu ispravne.", 422);
    const quote = await quoteCart({ items: replacement.map((item) => ({ ...item, purchaseType: "one_time" })), deliveryDate: before.delivery_date, city, postalCode, promoCode: before.promo_code });
    assertDomain(quote.serviceable !== false, "DELIVERY_AREA_UNAVAILABLE", "Adresa nije u zoni dostave.", 422);
    if (input.items !== undefined) {
      assertDomain(!await first("SELECT di.id FROM delivery_items di JOIN delivery_orders dor ON dor.id=di.delivery_order_id JOIN order_items oi ON oi.id=di.order_item_id WHERE oi.order_id=? AND dor.status='delivered' LIMIT 1",id),"ORDER_PARTIALLY_DELIVERED","Već delimično isporučena porudžbina zahteva zasebnu korekciju.",409);
      statements.push(...releaseInventory(id));
      statements.push(...await reserveInventory(id,quote.lines.map(line=>({productId:line.productId,quantity:line.quantity,lastDate:String(before.delivery_date)})),true));
      statements.push({sql:"UPDATE delivery_items SET order_item_id=NULL WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id=?) AND delivery_order_id IN (SELECT id FROM delivery_orders WHERE status='planned')",bindings:[id]});
      statements.push({ sql: "DELETE FROM order_items WHERE order_id = ?", bindings: [id] });
      for (const line of quote.lines) statements.push({
        sql: "INSERT INTO order_items (id, order_id, product_id, product_name, unit_label, quantity, unit_price_minor, unit_cost_minor, unit_packaging_cost_minor, total_cost_minor, line_total_minor, purchase_type, cadence) SELECT ?, ?, id, name, unit_label, ?, ?, cost_minor, packaging_cost_minor, (cost_minor + packaging_cost_minor) * ?, ?, 'one_time', NULL FROM products WHERE id = ?",
        bindings: [crypto.randomUUID(), id, line.quantity, line.unitPriceMinor, line.quantity, line.lineTotalMinor, line.productId],
      });
      statements.push({ sql: "UPDATE orders SET subtotal_minor = ?, discount_minor = ?, delivery_fee_minor = ?, total_minor = ? WHERE id = ?", bindings: [quote.subtotalMinor, quote.discountMinor, quote.deliveryFeeMinor, quote.totalMinor, id] });
    }
    if (input.customer !== undefined) statements.push({ sql: "UPDATE orders SET shipping_json = ? WHERE id = ?", bindings: [JSON.stringify({ ...savedShipping, addressLine1: street, city, postalCode }), id] });
    statements.push(audit(actor.type, actor.id, "order.delivery_updated", "order", id, { items: currentItems, address: { street: customer.address_line_1, city: customer.city, postalCode: customer.postal_code } }, { items: quote.lines, address: { street, city, postalCode } }));
  }
  const activation = paymentStatus === "paid" && before.payment_status !== "paid" ? await activatePaidPackage(id) : null;
  if (activation) statements.push(...activation.statements);
  if (paymentStatus === "paid" && before.payment_status !== "paid") {
    statements.push(enqueue("fiscal.receipt.requested", "order", id, { orderId: id, source: "admin-payment-confirmation" }));
    statements.push(enqueue("email.receipt.requested", "order", id, { orderId: id }));
    statements.push(purchaseAnalyticsEvent(id, String(before.order_number ?? id), "admin-payment-confirmation"));
  }
  if (editingDelivery || paymentStatus !== before.payment_status || fulfillmentStatus !== before.fulfillment_status || customerNote !== before.customer_note) statements.push(enqueue("email.order_updated.requested", "order", id, { ...after, deliveryDate: activation?.date ?? before.delivery_date, detailsChanged: editingDelivery }));
  if (changingContents) await assertDeliveryEditable(String(before.delivery_date));
  if (changingContents || paymentStatus !== before.payment_status) statements.push({ sql: "UPDATE deliveries SET generation_key = ? WHERE delivery_date = ? AND status = 'open'", bindings: [`changed:${crypto.randomUUID()}`, String(before.delivery_date)] });
  const guard = mutationGuard("EXISTS (SELECT 1 FROM orders WHERE id = ? AND updated_at = ? AND fulfillment_status = ? AND payment_status = ?)", [id, String(before.updated_at), String(before.fulfillment_status), String(before.payment_status)]);
  try { await batch([guard.check, ...statements, guard.cleanup]); }
  catch (error) {
    const current = await first<Record<string, unknown>>("SELECT updated_at, fulfillment_status, payment_status FROM orders WHERE id = ?", id);
    if (current && (current.updated_at !== before.updated_at || current.fulfillment_status !== before.fulfillment_status || current.payment_status !== before.payment_status)) throw new DomainError("ORDER_VERSION_CONFLICT", "Porudžbina je u međuvremenu promenjena. Osvežite podatke.", 409);
    throw error;
  }
  if (editingDelivery || fulfillmentStatus !== before.fulfillment_status || paymentStatus !== before.payment_status) {
    const date = activation?.date ?? String(before.delivery_date);
    const delivery = await first<Record<string, unknown>>("SELECT id FROM deliveries WHERE delivery_date = ? AND status = 'open'", date);
    if (delivery) await generateDelivery(date, `admin-order:${id}:${crypto.randomUUID()}`);
  }
  return first<Record<string, unknown>>("SELECT * FROM orders WHERE id = ?", id);
}

export async function readSettings() {
  const rows = await all<{ key: string; value_json: string } & Record<string, unknown>>(
    "SELECT key, value_json, updated_at FROM settings ORDER BY key",
  );
  return Object.fromEntries(rows.map((row) => {
    try { return [row.key, JSON.parse(row.value_json)]; } catch { return [row.key, row.value_json]; }
  }));
}

const textSettings = new Map<string, number>([
  ["storeName", 120],
  ["announcementText", 180],
  ["announcementLinkLabel", 80],
  ["announcementUrl", 500],
  ["heroEyebrow", 120],
  ["heroTitle", 140],
  ["heroSubtitle", 420],
  ["heroPrimaryLabel", 80],
  ["heroPrimaryUrl", 500],
  ["heroSecondaryLabel", 80],
  ["heroSecondaryUrl", 500],
  ["serviceAreaTitle", 140],
  ["serviceAreaNote", 260],
  ["guaranteeTitle", 120],
  ["guaranteeText", 420],
  ["trustItemOne", 180],
  ["trustItemTwo", 180],
  ["trustItemThree", 180],
]);
const numericSettings = new Map<string, number>([
  ["cutoffHours", 168],
  ["deliveryWeekday", 6],
  ["deliveryFeeMinor", 10_000_000],
  ["freeDeliveryThresholdMinor", 100_000_000],
  ["routeCapacity", 100_000],
  ["estimatedDeliveryCostMinor", 10_000_000],
  ["paymentFeeBps", 10_000],
]);
const booleanSettings = new Set(["announcementEnabled"]);
const urlSettings = new Set(["announcementUrl", "heroPrimaryUrl", "heroSecondaryUrl"]);

function safeLink(value: string, field: string) {
  assertDomain(
    value.startsWith("/") || /^https:\/\//i.test(value),
    "VALIDATION_ERROR",
    `${field} mora biti lokalna putanja ili HTTPS adresa.`,
    422,
    { field },
  );
  return value;
}

export async function updateSettings(input: Record<string, unknown>) {
  const allowed = new Set([
    ...textSettings.keys(),
    ...numericSettings.keys(),
    ...booleanSettings,
    "deliveryLocalTime",
    "servicePostalCodes",
    "deliveryWeekdays", "minimumOrderMinor", "holidays", "serviceRegions", "deliverySlots",
  ]);
  const entries = Object.entries(input);
  assertDomain(
    entries.length > 0 && entries.every(([key]) => allowed.has(key)),
    "VALIDATION_ERROR",
    "Poslato je nepoznato podešavanje.",
    422,
  );
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (["minimumOrderMinor", "holidays", "serviceRegions", "deliverySlots"].includes(key)) { normalized[key] = validatePolicy(key,value);
    } else if (key === "deliveryWeekdays") {
      assertDomain(Array.isArray(value) && value.length > 0 && value.every((day) => Number.isInteger(day) && day >= 0 && day <= 6), "VALIDATION_ERROR", "Izaberite dane dostave.", 422);
      normalized[key] = [...new Set(value as number[])].sort();
    } else if (numericSettings.has(key)) {
      normalized[key] = nonNegativeInt(value, key, numericSettings.get(key));
    } else if (booleanSettings.has(key)) {
      normalized[key] = value === true || value === 1 || value === "1" || value === "true";
    } else if (key === "deliveryLocalTime") {
      const parsed = requiredString(value, key, 5);
      assertDomain(/^([01]\d|2[0-3]):[0-5]\d$/.test(parsed), "VALIDATION_ERROR", "Vreme dostave mora biti HH:mm.", 422);
      normalized[key] = parsed;
    } else if (key === "servicePostalCodes") {
      const values = Array.isArray(value) ? value : String(value ?? "").split(",");
      const postalCodes = [...new Set(values.map((item) => String(item).trim()).filter(Boolean))];
      assertDomain(postalCodes.every((item) => /^\d{2,5}\*?$/.test(item)), "VALIDATION_ERROR", "Unesite poštanski broj od pet cifara ili prefiks od dve do četiri cifre.", 422);
      normalized[key] = postalCodes;
    } else {
      const parsed = requiredString(value, key, textSettings.get(key) ?? 500);
      normalized[key] = urlSettings.has(key) ? safeLink(parsed, key) : parsed;
    }
  }
  const changingDeadline = normalized.cutoffHours !== undefined || normalized.deliveryLocalTime !== undefined;
  // Preserve deliveries that have already crossed the old deadline before changing the policy.
  if (changingDeadline || normalized.holidays !== undefined) await lockOverdueDeliveries();
  const now = new Date().toISOString();
  const statements: Array<{ sql: string; bindings?: SqlValue[] }> = Object.entries(normalized).map(([key, value]) => ({
    sql: "INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at",
    bindings: [key, JSON.stringify(value), now],
  }));
  if (Array.isArray(normalized.holidays)) {
    const { addLocalDays, isCadenceDue } = await import("./time");
    const { packageSchedule } = await import("./packages");
    const settings = { ...await getBusinessSettings(), ...normalized } as Awaited<ReturnType<typeof getBusinessSettings>>;
    const orders = await all<Record<string,unknown>>("SELECT * FROM orders WHERE fulfillment_status='planned'");
    for (const order of orders) if (settings.holidays.includes(String(order.delivery_date))) {
      let date = addLocalDays(String(order.delivery_date),1);
      while(settings.holidays.includes(date) || !settings.deliveryWeekdays.includes(new Date(`${date}T12:00:00Z`).getUTCDay())) date=addLocalDays(date,1);
      const guard=mutationGuard("EXISTS(SELECT 1 FROM orders WHERE id=? AND updated_at=? AND fulfillment_status='planned')",[String(order.id),String(order.updated_at)]);
      statements.push(guard.check,{sql:'UPDATE orders SET delivery_date=?,updated_at=? WHERE id=?',bindings:[date,now,String(order.id)]},enqueue('email.order_updated.requested','order',String(order.id),{deliveryDate:date,reason:'holiday'}),guard.cleanup);
    }
    const subscriptions = await all<Record<string,unknown>>("SELECT * FROM subscriptions WHERE status!='cancelled'");
    for (const sub of subscriptions) if (settings.holidays.includes(String(sub.next_delivery_date))) {
      const schedule=await packageSchedule(String(sub.id));let date=addLocalDays(String(sub.next_delivery_date),7);
      while(settings.holidays.includes(date) || (schedule.length && !schedule.some(item=>isCadenceDue(item.cadence_anchor_date,date,item.cadence))))date=addLocalDays(date,7);
      const guard=mutationGuard('EXISTS(SELECT 1 FROM subscriptions WHERE id=? AND version=?)',[String(sub.id),Number(sub.version)]);
      statements.push(guard.check,{sql:'UPDATE subscriptions SET next_delivery_date=?,version=version+1,updated_at=? WHERE id=?',bindings:[date,now,String(sub.id)]},{sql:'UPDATE next_delivery_addons SET delivery_date=? WHERE subscription_id=? AND consumed_at IS NULL AND cancelled_at IS NULL',bindings:[date,String(sub.id)]},enqueue('email.order_updated.requested','subscription',String(sub.id),{deliveryDate:date,reason:'holiday'}),guard.cleanup);
    }
    statements.push({sql:"UPDATE deliveries SET generation_key=? WHERE status='open'",bindings:[`holiday:${crypto.randomUUID()}`]});
  }
  statements.push(audit("admin", "local-admin", "settings.updated", "settings", "business", await getBusinessSettings(), normalized));
  await batch(statements);
  if (changingDeadline) {
    const settings = await getBusinessSettings();
    const open = await all<{ id: string; delivery_date: string } & Record<string, unknown>>("SELECT id, delivery_date FROM deliveries WHERE status = 'open'");
    if (open.length) await batch(open.map((delivery) => ({ sql: "UPDATE deliveries SET cutoff_at = ? WHERE id = ? AND status = 'open'", bindings: [cutoffForDelivery(delivery.delivery_date, settings.cutoffHours, settings.deliveryLocalTime), delivery.id] })));
    await lockOverdueDeliveries();
  }
  return readSettings();
}

export interface PromoCodeRow extends Record<string, unknown> {
  id: string;
  code: string;
  description: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  minimum_order_minor: number;
  usage_limit: number | null;
  times_used: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function promoCodeValue(value: unknown) {
  const code = requiredString(value, "code", 40).toUpperCase().replace(/\s+/g, "");
  assertDomain(/^[A-Z0-9_-]+$/.test(code), "VALIDATION_ERROR", "Promo kod može sadržati slova, brojeve, _ i -.", 422);
  return code;
}

export async function listPromoCodes() {
  return all<PromoCodeRow>("SELECT * FROM promo_codes ORDER BY created_at DESC");
}

export async function createPromoCode(input: Record<string, unknown>) {
  const id = crypto.randomUUID();
  const code = promoCodeValue(input.code);
  const discountType = enumValue(input.discountType, "discountType", ["percent", "fixed"] as const);
  const discountValue = nonNegativeInt(input.discountValue, "discountValue", discountType === "percent" ? 100 : 100_000_000);
  assertDomain(discountValue > 0, "VALIDATION_ERROR", "Vrednost popusta mora biti veća od nule.", 422);
  const usageLimit = input.usageLimit === undefined || input.usageLimit === null || input.usageLimit === ""
    ? null
    : nonNegativeInt(input.usageLimit, "usageLimit", 1_000_000);
  const value = {
    id,
    code,
    description: optionalString(input.description, "description", 240) ?? "",
    discountType,
    discountValue,
    minimumOrderMinor: input.minimumOrderMinor === undefined ? 0 : nonNegativeInt(input.minimumOrderMinor, "minimumOrderMinor", 100_000_000),
    usageLimit,
    startsAt: optionalString(input.startsAt, "startsAt", 40),
    endsAt: optionalString(input.endsAt, "endsAt", 40),
    isActive: input.isActive === false ? 0 : 1,
  };
  const now = new Date().toISOString();
  await batch([
    {
      sql: "INSERT INTO promo_codes (id, code, description, discount_type, discount_value, minimum_order_minor, usage_limit, times_used, starts_at, ends_at, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)",
      bindings: [id, code, value.description, discountType, discountValue, value.minimumOrderMinor, usageLimit, value.startsAt, value.endsAt, value.isActive, now, now],
    },
    { ...promoRules(input), bindings: [...promoRules(input).bindings, id] },
    audit("admin", "local-admin", "promo.created", "promo_code", id, null, value),
  ]);
  return first<PromoCodeRow>("SELECT * FROM promo_codes WHERE id = ?", id);
}

export async function updatePromoCode(id: string, input: Record<string, unknown>) {
  const before = await first<PromoCodeRow>("SELECT * FROM promo_codes WHERE id = ?", id);
  if (!before) throw new DomainError("PROMO_NOT_FOUND", "Promo kod nije pronađen.", 404);
  const discountType = input.discountType === undefined ? before.discount_type : enumValue(input.discountType, "discountType", ["percent", "fixed"] as const);
  const discountValue = input.discountValue === undefined ? before.discount_value : nonNegativeInt(input.discountValue, "discountValue", discountType === "percent" ? 100 : 100_000_000);
  assertDomain(discountValue > 0, "VALIDATION_ERROR", "Vrednost popusta mora biti veća od nule.", 422);
  const next = {
    code: input.code === undefined ? before.code : promoCodeValue(input.code),
    description: input.description === undefined ? before.description : optionalString(input.description, "description", 240) ?? "",
    discountType,
    discountValue,
    minimumOrderMinor: input.minimumOrderMinor === undefined ? before.minimum_order_minor : nonNegativeInt(input.minimumOrderMinor, "minimumOrderMinor", 100_000_000),
    usageLimit: input.usageLimit === undefined ? before.usage_limit : input.usageLimit === null || input.usageLimit === "" ? null : nonNegativeInt(input.usageLimit, "usageLimit", 1_000_000),
    startsAt: input.startsAt === undefined ? before.starts_at : optionalString(input.startsAt, "startsAt", 40),
    endsAt: input.endsAt === undefined ? before.ends_at : optionalString(input.endsAt, "endsAt", 40),
    isActive: input.isActive === undefined ? before.is_active : input.isActive === true ? 1 : 0,
  };
  await batch([
    {
      sql: "UPDATE promo_codes SET code = ?, description = ?, discount_type = ?, discount_value = ?, minimum_order_minor = ?, usage_limit = ?, starts_at = ?, ends_at = ?, is_active = ?, updated_at = ? WHERE id = ?",
      bindings: [next.code, next.description, next.discountType, next.discountValue, next.minimumOrderMinor, next.usageLimit, next.startsAt, next.endsAt, next.isActive, new Date().toISOString(), id],
    },
    { ...promoRules(input, before), bindings: [...promoRules(input, before).bindings, id] },
    audit("admin", "local-admin", "promo.updated", "promo_code", id, before, next),
  ]);
  return first<PromoCodeRow>("SELECT * FROM promo_codes WHERE id = ?", id);
}

export async function removePromoCode(id: string) {
  const before = await first<PromoCodeRow>("SELECT * FROM promo_codes WHERE id = ?", id);
  if (!before) throw new DomainError("PROMO_NOT_FOUND", "Promo kod nije pronađen.", 404);
  await batch([
    { sql: "UPDATE promo_codes SET is_active = 0 WHERE id = ?", bindings: [id] },
    audit("admin", "local-admin", "promo.deleted", "promo_code", id, before, null),
  ]);
  return { deleted: true };
}
