import { DomainError, assertDomain, enumValue, nonNegativeInt, optionalString, requiredString } from "./domain";
import { orderFilters } from "./order-filters";
import { audit, enqueue } from "./outbox";
import { all, batch, first, type SqlValue } from "./sql";
import { getBusinessSettings } from "./settings";
import { purchaseAnalyticsEvent } from "./analytics";
import { quoteCart } from "./commerce";
import { generateDelivery } from "./deliveries";
import { assertBeforeCutoff, cutoffForDelivery } from "./time";

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

export async function listCustomers(params = new URLSearchParams()) {
  const query = optionalString(params.get("q"), "q", 200);
  const where = query ? "WHERE (LOWER(c.full_name) LIKE LOWER(?) ESCAPE '!' OR LOWER(c.email) LIKE LOWER(?) ESCAPE '!' OR c.phone LIKE ? ESCAPE '!')" : "";
  const pattern = query ? `%${query.replace(/[!%_]/g, "!$&")}%` : "";
  return all<Record<string, unknown>>(
    `SELECT c.*, (SELECT COUNT(*) FROM subscriptions s WHERE s.customer_id = c.id) AS subscription_count, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count, (SELECT COALESCE(SUM(o.total_minor), 0) FROM orders o WHERE o.customer_id = c.id AND o.payment_status = 'paid') AS lifetime_value_minor FROM customers c ${where} ORDER BY c.created_at DESC LIMIT 500`, ...(query ? [pattern,pattern,pattern] : []),
  );
}

export async function listSubscriptions() {
  const subscriptions = await all<Record<string, unknown>>("SELECT s.*, c.full_name, c.email FROM subscriptions s JOIN customers c ON c.id = s.customer_id ORDER BY s.created_at DESC LIMIT 500");
  if (!subscriptions.length) return [];
  const placeholders = subscriptions.map(() => "?").join(",");
  const ids = subscriptions.map((subscription) => String(subscription.id));
  const [items, skips] = await Promise.all([
    all<Record<string, unknown>>(`SELECT si.*, p.name AS product_name FROM subscription_items si JOIN products p ON p.id = si.product_id WHERE si.subscription_id IN (${placeholders}) AND si.status = 'active'`, ...ids),
    all<Record<string, unknown>>(`SELECT subscription_id, delivery_date FROM subscription_skips WHERE subscription_id IN (${placeholders}) ORDER BY delivery_date DESC`, ...ids),
  ]);
  return subscriptions.map((subscription) => {
    const activeItems = items.filter((item) => item.subscription_id === subscription.id);
    return { ...subscription, item_count: activeItems.length, items: activeItems, skips: skips.filter((skip) => skip.subscription_id === subscription.id) };
  });
}

export async function listOrders(params = new URLSearchParams()) {
  const { where, bindings, orderBy, page, pageSize } = orderFilters(params);
  const from = "FROM orders o JOIN customers c ON c.id = o.customer_id LEFT JOIN fiscal_receipts fr ON fr.order_id = o.id AND fr.operation_key = 'receipt:' || o.id || ':sale'";
  const [orders, count] = await Promise.all([
    all<Record<string, unknown>>(`SELECT o.*, c.full_name, c.email, c.phone, fr.status AS fiscal_status, fr.invoice_number ${from} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, ...bindings, pageSize, (page - 1) * pageSize),
    first<Record<string, unknown>>(`SELECT COUNT(*) AS total ${from} ${where}`, ...bindings),
  ]);
  return { orders, total: Number(count?.total ?? 0), page, pageSize };
}

export async function updateOrder(input: Record<string, unknown>) {
  const id = requiredString(input.id, "id", 100);
  const before = await first<Record<string, unknown>>("SELECT * FROM orders WHERE id = ?", id);
  if (!before) throw new DomainError("ORDER_NOT_FOUND", "Porudžbina nije pronađena.", 404);
  const paymentStatus = input.paymentStatus === undefined
    ? String(before.payment_status)
    : enumValue(input.paymentStatus, "paymentStatus", ["pending", "paid", "failed", "refunded"] as const);
  const fulfillmentStatus = input.fulfillmentStatus === undefined
    ? String(before.fulfillment_status)
    : enumValue(input.fulfillmentStatus, "fulfillmentStatus", ["planned", "locked", "delivered", "cancelled"] as const);
  const customerNote = input.customerNote === undefined
    ? (typeof before.customer_note === "string" ? before.customer_note : null)
    : optionalString(input.customerNote, "customerNote", 500);
  const after = { paymentStatus, fulfillmentStatus, customerNote };
  const statements: Array<{ sql: string; bindings?: SqlValue[] }> = [
    {
      sql: "UPDATE orders SET payment_status = ?, fulfillment_status = ?, customer_note = ?, updated_at = ? WHERE id = ?",
      bindings: [paymentStatus, fulfillmentStatus, customerNote ?? null, new Date().toISOString(), id],
    },
    audit("admin", "local-admin", "order.updated", "order", id, before, after),
    enqueue("order.updated", "order", id, after),
  ];
  const editingDelivery = input.items !== undefined || input.customer !== undefined;
  if (editingDelivery) {
    assertDomain(before.kind === "one_time" && before.payment_status === "pending" && paymentStatus === "pending" && before.fulfillment_status === "planned" && fulfillmentStatus === "planned", "ORDER_NOT_EDITABLE", "Stavke i adresu možete menjati samo pre naplate i zaključavanja jednokratne porudžbine.", 409);
    const settings = await getBusinessSettings();
    const delivery = await first<Record<string, unknown>>("SELECT * FROM deliveries WHERE delivery_date = ?", String(before.delivery_date));
    assertBeforeCutoff(cutoffForDelivery(String(before.delivery_date), settings.cutoffHours, settings.deliveryLocalTime), delivery?.status && delivery.status !== "open" ? "locked" : null);
    const customer = await first<Record<string, unknown>>("SELECT * FROM customers WHERE id = ?", String(before.customer_id));
    assertDomain(customer, "CUSTOMER_NOT_FOUND", "Kupac nije pronađen.", 404);
    const address = input.customer === undefined ? {} : input.customer;
    assertDomain(address && typeof address === "object" && !Array.isArray(address), "VALIDATION_ERROR", "Adresa nije ispravna.", 422);
    const fields = address as Record<string, unknown>;
    const street = fields.addressLine1 === undefined ? String(customer.address_line_1) : requiredString(fields.addressLine1, "addressLine1", 200);
    const city = fields.city === undefined ? String(customer.city) : requiredString(fields.city, "city", 100);
    const postalCode = fields.postalCode === undefined ? String(customer.postal_code) : requiredString(fields.postalCode, "postalCode", 5);
    const currentItems = await all<Record<string, unknown>>("SELECT product_id, quantity FROM order_items WHERE order_id = ?", id);
    const replacement = input.items ?? currentItems.map((item) => ({ productId: item.product_id, quantity: item.quantity }));
    assertDomain(Array.isArray(replacement) && replacement.every((item) => item && typeof item === "object" && !Array.isArray(item)), "VALIDATION_ERROR", "Stavke porudžbine nisu ispravne.", 422);
    const quote = await quoteCart({ items: replacement.map((item) => ({ ...item, purchaseType: "one_time" })), deliveryDate: before.delivery_date, city, postalCode, promoCode: before.promo_code });
    assertDomain(quote.serviceable !== false, "DELIVERY_AREA_UNAVAILABLE", "Adresa nije u zoni dostave.", 422);
    if (input.items !== undefined) {
      statements.push({ sql: "DELETE FROM order_items WHERE order_id = ?", bindings: [id] });
      for (const line of quote.lines) statements.push({
        sql: "INSERT INTO order_items (id, order_id, product_id, product_name, unit_label, quantity, unit_price_minor, unit_cost_minor, unit_packaging_cost_minor, total_cost_minor, line_total_minor, purchase_type, cadence) SELECT ?, ?, id, name, unit_label, ?, ?, cost_minor, packaging_cost_minor, (cost_minor + packaging_cost_minor) * ?, ?, 'one_time', NULL FROM products WHERE id = ?",
        bindings: [crypto.randomUUID(), id, line.quantity, line.unitPriceMinor, line.quantity, line.lineTotalMinor, line.productId],
      });
      statements.push({ sql: "UPDATE orders SET subtotal_minor = ?, discount_minor = ?, delivery_fee_minor = ?, total_minor = ? WHERE id = ?", bindings: [quote.subtotalMinor, quote.discountMinor, quote.deliveryFeeMinor, quote.totalMinor, id] });
    }
    if (input.customer !== undefined) statements.push({ sql: "UPDATE customers SET address_line_1 = ?, city = ?, postal_code = ?, updated_at = ? WHERE id = ?", bindings: [street, city, postalCode, new Date().toISOString(), String(before.customer_id)] });
    statements.push(audit("admin", "local-admin", "order.delivery_updated", "order", id, { items: currentItems, address: { street: customer.address_line_1, city: customer.city, postalCode: customer.postal_code } }, { items: quote.lines, address: { street, city, postalCode } }));
  }
  if (paymentStatus === "paid" && before.payment_status !== "paid") {
    statements.push(enqueue("fiscal.receipt.requested", "order", id, { orderId: id, source: "admin-payment-confirmation" }));
    statements.push(enqueue("email.receipt.requested", "order", id, { orderId: id }));
    statements.push(purchaseAnalyticsEvent(id, String(before.order_number ?? id), "admin-payment-confirmation"));
  }
  if (editingDelivery || paymentStatus !== before.payment_status || fulfillmentStatus !== before.fulfillment_status || customerNote !== before.customer_note) statements.push(enqueue("email.order_updated.requested", "order", id, { ...after, deliveryDate: before.delivery_date, detailsChanged: editingDelivery }));
  await batch(statements);
  if (editingDelivery || fulfillmentStatus !== before.fulfillment_status) {
    const delivery = await first<Record<string, unknown>>("SELECT id FROM deliveries WHERE delivery_date = ? AND status = 'open'", String(before.delivery_date));
    if (delivery) await generateDelivery(String(before.delivery_date), `admin-order:${id}:${crypto.randomUUID()}`);
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
    "deliveryWeekdays",
  ]);
  const entries = Object.entries(input);
  assertDomain(
    entries.length > 0 && entries.every(([key]) => allowed.has(key)),
    "VALIDATION_ERROR",
    "Poslato je nepoznato podešavanje.",
    422,
  );
  const normalized: Record<string, string | number | boolean | string[] | number[]> = {};
  for (const [key, value] of entries) {
    if (key === "deliveryWeekdays") {
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
  const now = new Date().toISOString();
  const statements: Array<{ sql: string; bindings?: SqlValue[] }> = Object.entries(normalized).map(([key, value]) => ({
    sql: "INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at",
    bindings: [key, JSON.stringify(value), now],
  }));
  statements.push(audit("admin", "local-admin", "settings.updated", "settings", "business", await getBusinessSettings(), normalized));
  await batch(statements);
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
    audit("admin", "local-admin", "promo.updated", "promo_code", id, before, next),
  ]);
  return first<PromoCodeRow>("SELECT * FROM promo_codes WHERE id = ?", id);
}

export async function removePromoCode(id: string) {
  const before = await first<PromoCodeRow>("SELECT * FROM promo_codes WHERE id = ?", id);
  if (!before) throw new DomainError("PROMO_NOT_FOUND", "Promo kod nije pronađen.", 404);
  await batch([
    { sql: "DELETE FROM promo_codes WHERE id = ?", bindings: [id] },
    audit("admin", "local-admin", "promo.deleted", "promo_code", id, before, null),
  ]);
  return { deleted: true };
}
