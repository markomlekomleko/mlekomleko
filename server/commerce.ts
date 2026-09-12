import { randomToken, sha256, stableJsonHash } from "./crypto";
import { DomainError, assertDomain, emailAddress, enumValue, optionalString, positiveInt, rejectCardData, requiredString } from "./domain";
import { localPaymentGateway } from "./integrations";
import { audit, enqueue } from "./outbox";
import { ProductRow, publicProduct } from "./products";
import { all, batch, first, sqlPlaceholders, type SqlValue } from "./sql";
import { addLocalDays, assertBeforeCutoff, assertLocalDate, cutoffForDelivery, isCadenceDue, localDateAt, nextWeekday, occurrenceDatesInMonth, remainingOccurrencesInMonth } from "./time";
import { getBusinessSettings, getNextDeliveryWindow, isServiceablePostalCode } from "./settings";
import { generateDelivery } from "./deliveries";
import { purchaseAnalyticsEvent } from "./analytics";

interface CustomerRow extends Record<string, unknown> {
  id: string; email: string; full_name: string; phone: string; address_line_1: string; address_line_2: string | null;
  city: string; postal_code: string; delivery_note: string | null; source_json: string;
}

interface SubscriptionRow extends Record<string, unknown> {
  id: string; customer_id: string; status: "active" | "paused" | "cancelled"; payment_method: "card" | "cash";
  payment_provider_ref: string | null;
  pause_until: string | null; next_delivery_date: string; started_at: string; cancelled_at: string | null; cancellation_reason: string | null;
  version: number;
}

interface SubscriptionItemRow extends Record<string, unknown> {
  id: string; subscription_id: string; product_id: string; product_name?: string; unit_label?: string; price_minor?: number;
  quantity: number; cadence: "weekly" | "biweekly"; cadence_anchor_date: string; status: "active" | "cancelled";
}

type CheckoutItemInput = {
  productId: string;
  quantity: number;
  purchaseType: "one_time" | "subscription";
  cadence: "weekly" | "biweekly" | null;
};

interface PromoRow extends Record<string, unknown> {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  minimum_order_minor: number;
  usage_limit: number | null;
  times_used: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: number;
}

function parseCheckoutItems(value: unknown): CheckoutItemInput[] {
  assertDomain(Array.isArray(value) && value.length > 0 && value.length <= 50, "VALIDATION_ERROR", "items must contain 1-50 items.", 422, { field: "items" });
  return value.map((raw, index) => {
    assertDomain(raw && typeof raw === "object" && !Array.isArray(raw), "VALIDATION_ERROR", `items[${index}] is invalid.`, 422);
    const item = raw as Record<string, unknown>;
    const purchaseType = enumValue(item.purchaseType, `items[${index}].purchaseType`, ["one_time", "subscription"] as const);
    return {
      productId: requiredString(item.productId, `items[${index}].productId`, 100),
      quantity: positiveInt(item.quantity, `items[${index}].quantity`, 100),
      purchaseType,
      cadence: purchaseType === "subscription" ? enumValue(item.cadence, `items[${index}].cadence`, ["weekly", "biweekly"] as const) : null,
    };
  });
}

const ATTRIBUTION_KEYS = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"]);

export function sanitizeAttribution(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const candidates = new Map<string, unknown>(Object.entries(source));
  if (typeof source.query === "string") {
    const query = source.query.startsWith("?") ? source.query.slice(1) : source.query;
    for (const [key, child] of new URLSearchParams(query)) candidates.set(key, child);
  }
  const result: Record<string, unknown> = {};
  for (const [key, child] of candidates) {
    if (!ATTRIBUTION_KEYS.has(key) || typeof child !== "string") continue;
    const clean = child.trim().slice(0, 200);
    if (clean) result[key] = clean;
  }
  if (typeof source.referrer === "string") {
    try {
      const url = new URL(source.referrer);
      if (url.protocol === "http:" || url.protocol === "https:") result.referrer_host = url.hostname.toLowerCase().slice(0, 253);
    } catch { /* Invalid referrers are deliberately discarded. */ }
  }
  if (typeof source.landingPath === "string") {
    const path = source.landingPath.split(/[?#]/, 1)[0].slice(0, 200);
    if (/^\/[a-zA-Z0-9/_-]*$/.test(path)) result.landing_path = path;
  }
  const sanitizeTouch = (touch: unknown) => {
    if (!touch || typeof touch !== "object" || Array.isArray(touch)) return null;
    const row = touch as Record<string, unknown>;
    const parameters: Record<string, string> = {};
    if (row.parameters && typeof row.parameters === "object" && !Array.isArray(row.parameters)) {
      for (const [key, child] of Object.entries(row.parameters as Record<string, unknown>)) {
        if (ATTRIBUTION_KEYS.has(key) && typeof child === "string" && child.trim()) parameters[key] = child.trim().slice(0, 200);
      }
    }
    const clean: Record<string, unknown> = { parameters };
    if (typeof row.landingPath === "string") {
      const path = row.landingPath.split(/[?#]/, 1)[0].slice(0, 200);
      if (/^\/[a-zA-Z0-9/_-]*$/.test(path)) clean.landingPath = path;
    }
    if (typeof row.referrerHost === "string" && /^[a-z0-9.-]+$/i.test(row.referrerHost)) clean.referrerHost = row.referrerHost.toLowerCase().slice(0, 253);
    if (typeof row.capturedAt === "string" && !Number.isNaN(Date.parse(row.capturedAt))) clean.capturedAt = new Date(row.capturedAt).toISOString();
    return clean;
  };
  const firstTouch = sanitizeTouch(source.firstTouch);
  const lastTouch = sanitizeTouch(source.lastTouch);
  if (firstTouch && lastTouch) {
    result.firstTouch = firstTouch;
    result.lastTouch = lastTouch;
    Object.assign(result, (lastTouch.parameters as Record<string, string>) ?? {});
  }
  return result;
}

async function resolvePromo(rawCode: unknown, subtotalMinor: number) {
  const code = optionalString(rawCode, "promoCode", 40)?.toUpperCase().replace(/\s+/g, "") ?? null;
  if (!code) return { promo: null, code: null, discountMinor: 0 };
  const promo = await first<PromoRow>("SELECT * FROM promo_codes WHERE code = ?", code);
  const now = Date.now();
  const valid = promo && Boolean(promo.is_active)
    && (!promo.starts_at || Date.parse(promo.starts_at) <= now)
    && (!promo.ends_at || Date.parse(promo.ends_at) >= now)
    && (promo.usage_limit == null || promo.times_used < promo.usage_limit)
    && subtotalMinor >= promo.minimum_order_minor;
  assertDomain(valid, "PROMO_INVALID", "Promo kod nije važeći ili uslovi nisu ispunjeni.", 422, { field: "promoCode" });
  const discountMinor = promo.discount_type === "percent"
    ? Math.floor(subtotalMinor * promo.discount_value / 100)
    : Math.min(subtotalMinor, promo.discount_value);
  return { promo, code, discountMinor };
}

function productUnitPrice(product: ProductRow, purchaseType: "one_time" | "subscription") {
  return purchaseType === "subscription"
    ? product.subscription_price_minor ?? product.price_minor
    : product.price_minor;
}

export async function quoteCart(input: Record<string, unknown>) {
  const items = parseCheckoutItems(input.items);
  const settings = await getBusinessSettings();
  const deliveryDate = input.deliveryDate == null ? (await getNextDeliveryWindow()).deliveryDate : assertLocalDate(input.deliveryDate);
  assertDomain(new Date(`${deliveryDate}T12:00:00Z`).getUTCDay() === settings.deliveryWeekday, "INVALID_DELIVERY_DATE", "Izabrani datum nije dan dostave.", 422);
  assertBeforeCutoff(cutoffForDelivery(deliveryDate, settings.cutoffHours, settings.deliveryLocalTime));
  const productIds = [...new Set(items.map((item) => item.productId))];
  const rows = await all<ProductRow>(`SELECT * FROM products WHERE id IN (${sqlPlaceholders(productIds.length)}) AND is_active = 1`, ...productIds);
  const products = new Map(rows.map((row) => [row.id, row]));
  const lines = items.map((item) => {
    const product = products.get(item.productId);
    assertDomain(product, "PRODUCT_UNAVAILABLE", `Proizvod ${item.productId} nije dostupan.`, 409);
    assertDomain(item.purchaseType !== "subscription" || Boolean(product.allow_subscription), "SUBSCRIPTION_UNAVAILABLE", "Redovna dostava nije dostupna za ovaj proizvod.", 409);
    const deliveryDates = item.purchaseType === "subscription" ? occurrenceDatesInMonth(deliveryDate, item.cadence!) : [deliveryDate];
    const occurrences = deliveryDates.length;
    const unitPriceMinor = productUnitPrice(product, item.purchaseType);
    return { ...item, productName: product.name, unitLabel: product.unit_label, unitPriceMinor, occurrences, deliveryDates, lineTotalMinor: unitPriceMinor * item.quantity * occurrences };
  });
  const subtotalMinor = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  const { code: promoCode, discountMinor } = await resolvePromo(input.promoCode, subtotalMinor);
  const deliveryOccurrences = Math.max(...lines.map((line) => line.occurrences), 1);
  const deliveryFeeMinor = settings.deliveryFeeMinor > 0 && !(settings.freeDeliveryThresholdMinor > 0 && subtotalMinor >= settings.freeDeliveryThresholdMinor)
    ? settings.deliveryFeeMinor * deliveryOccurrences
    : 0;
  const postalCode = optionalString(input.postalCode, "postalCode", 20);
  const serviceable = postalCode ? isServiceablePostalCode(settings, postalCode) : undefined;
  const recommendedRows = await all<ProductRow>(
    `SELECT * FROM products WHERE is_active = 1 ${productIds.length ? `AND id NOT IN (${sqlPlaceholders(productIds.length)})` : ""} ORDER BY (price_minor - cost_minor - packaging_cost_minor) DESC, is_featured DESC, sort_order ASC LIMIT 3`,
    ...productIds,
  );
  return {
    lines,
    subtotalMinor,
    discountMinor,
    deliveryFeeMinor,
    deliveryFeePerOccurrenceMinor: settings.deliveryFeeMinor,
    deliveryOccurrences,
    totalMinor: subtotalMinor - discountMinor + deliveryFeeMinor,
    promoCode,
    currency: "RSD",
    deliveryDate,
    cutoffAt: cutoffForDelivery(deliveryDate, settings.cutoffHours, settings.deliveryLocalTime),
    serviceable,
    freeDeliveryThresholdMinor: settings.freeDeliveryThresholdMinor,
    freeDeliveryRemainingMinor: settings.freeDeliveryThresholdMinor > subtotalMinor ? settings.freeDeliveryThresholdMinor - subtotalMinor : 0,
    recommendedAddons: recommendedRows.map((row) => publicProduct(row)),
  };
}

function orderNumber(hash: string): string {
  return `MM-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${hash.slice(0, 8).toUpperCase()}`;
}

export async function checkout(input: Record<string, unknown>, idempotencyKeyRaw: string | null) {
  rejectCardData(input);
  const idempotencyKey = requiredString(idempotencyKeyRaw ?? input.idempotencyKey, "Idempotency-Key", 200);
  assertDomain(idempotencyKey.length >= 8, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key must contain at least 8 characters.", 422);
  const requestHash = await stableJsonHash(input);
  const existing = await first<{ request_hash: string; response_json: string | null; status_code: number | null } & Record<string, unknown>>("SELECT request_hash, response_json, status_code FROM idempotency_keys WHERE namespace = 'checkout' AND key = ?", idempotencyKey);
  if (existing) {
    assertDomain(existing.request_hash === requestHash, "IDEMPOTENCY_CONFLICT", "This Idempotency-Key was already used for a different checkout.", 409);
    assertDomain(existing.response_json, "CHECKOUT_IN_PROGRESS", "Checkout is still being processed.", 409);
    return { status: existing.status_code ?? 201, body: JSON.parse(existing.response_json) };
  }

  const customerInput = input.customer;
  assertDomain(customerInput && typeof customerInput === "object" && !Array.isArray(customerInput), "VALIDATION_ERROR", "customer is required.", 422);
  const customerData = customerInput as Record<string, unknown>;
  const customer = {
    email: emailAddress(customerData.email),
    fullName: requiredString(customerData.fullName, "customer.fullName", 160),
    phone: requiredString(customerData.phone, "customer.phone", 40),
    addressLine1: requiredString(customerData.addressLine1, "customer.addressLine1", 200),
    addressLine2: optionalString(customerData.addressLine2, "customer.addressLine2", 200),
    city: requiredString(customerData.city, "customer.city", 100),
    postalCode: requiredString(customerData.postalCode, "customer.postalCode", 20),
    deliveryNote: optionalString(customerData.deliveryNote ?? input.note, "customer.deliveryNote", 500),
  };
  const items = parseCheckoutItems(input.items);
  const paymentMethod = enumValue(input.paymentMethod, "paymentMethod", ["card", "cash"] as const);
  const paymentToken = optionalString(input.paymentToken, "paymentToken", 300) ?? undefined;
  if (paymentMethod === "card") assertDomain(paymentToken, "PAYMENT_TOKEN_REQUIRED", "A provider paymentToken is required for card checkout. Raw card data is not accepted.", 422);
  if (paymentToken) assertDomain(!/^\d{12,19}$/.test(paymentToken.replace(/[ -]/g, "")), "CARD_DATA_REJECTED", "paymentToken looks like raw card data and was rejected.", 422);

  const settings = await getBusinessSettings();
  assertDomain(isServiceablePostalCode(settings, customer.postalCode), "DELIVERY_AREA_UNAVAILABLE", "Dostava trenutno nije dostupna za uneti poštanski broj.", 422, { field: "customer.postalCode" });
  const deliveryDate = input.deliveryDate == null ? (await getNextDeliveryWindow()).deliveryDate : assertLocalDate(input.deliveryDate);
  assertDomain(new Date(`${deliveryDate}T12:00:00Z`).getUTCDay() === settings.deliveryWeekday, "INVALID_DELIVERY_DATE", "Izabrani datum nije dan dostave.", 422);
  const cutoffAt = cutoffForDelivery(deliveryDate, settings.cutoffHours, settings.deliveryLocalTime);
  assertBeforeCutoff(cutoffAt);

  const productIds = [...new Set(items.map((item) => item.productId))];
  const productRows = await all<ProductRow>(`SELECT * FROM products WHERE id IN (${sqlPlaceholders(productIds.length)}) AND is_active = 1`, ...productIds);
  const products = new Map(productRows.map((product) => [product.id, product]));
  for (const item of items) {
    const product = products.get(item.productId);
    assertDomain(product, "PRODUCT_UNAVAILABLE", `Proizvod ${item.productId} nije dostupan.`, 409, { productId: item.productId });
    assertDomain(item.purchaseType !== "subscription" || Boolean(product.allow_subscription), "SUBSCRIPTION_UNAVAILABLE", "Redovna dostava nije dostupna za ovaj proizvod.", 409, { productId: item.productId });
  }

  const hasSubscription = items.some((item) => item.purchaseType === "subscription");
  const subtotalMinor = items.reduce((sum, item) => {
    const product = products.get(item.productId)!;
    const occurrences = item.purchaseType === "subscription" ? remainingOccurrencesInMonth(deliveryDate, item.cadence!) : 1;
    return sum + productUnitPrice(product, item.purchaseType) * item.quantity * occurrences;
  }, 0);
  assertDomain(Number.isSafeInteger(subtotalMinor), "AMOUNT_OVERFLOW", "Order total is too large.", 422);
  const { promo, code: promoCode, discountMinor } = await resolvePromo(input.promoCode, subtotalMinor);
  const deliveryOccurrences = Math.max(...items.map((item) => item.purchaseType === "subscription" ? remainingOccurrencesInMonth(deliveryDate, item.cadence!) : 1), 1);
  const deliveryFeeMinor = settings.deliveryFeeMinor > 0 && !(settings.freeDeliveryThresholdMinor > 0 && subtotalMinor >= settings.freeDeliveryThresholdMinor)
    ? settings.deliveryFeeMinor * deliveryOccurrences
    : 0;
  const totalMinor = subtotalMinor - discountMinor + deliveryFeeMinor;
  const hash = await stableJsonHash({ namespace: "checkout", idempotencyKey });
  const orderId = `ord_${hash.slice(0, 32)}`;
  const subscriptionId = hasSubscription ? `sub_${hash.slice(0, 32)}` : null;
  const knownCustomer = await first<CustomerRow>("SELECT * FROM customers WHERE email = ?", customer.email);
  const customerId = knownCustomer?.id ?? `cus_${(await stableJsonHash({ email: customer.email })).slice(0, 32)}`;
  const payment = await localPaymentGateway.authorize({ idempotencyKey, orderId, amountMinor: totalMinor, currency: "RSD", method: paymentMethod, paymentToken });
  assertDomain(payment.status !== "failed", "PAYMENT_FAILED", "Payment authorization failed.", 402);
  const now = new Date().toISOString();
  const paymentFeeMinor = paymentMethod === "card" ? Math.round(totalMinor * settings.paymentFeeBps / 10_000) : 0;
  const estimatedDeliveryCostMinor = settings.estimatedDeliveryCostMinor;
  const attribution = { ...sanitizeAttribution(input.attribution ?? input.source), consent: { analytics: input.analyticsConsent === true } };
  const eligibleConversionItems = !hasSubscription ? items.filter((item) => Boolean(products.get(item.productId)?.allow_subscription)) : [];
  const conversionToken = eligibleConversionItems.length ? randomToken() : null;
  const conversionTokenHash = conversionToken ? await sha256(conversionToken) : null;
  const conversionSavingMinor = eligibleConversionItems.reduce((sum, item) => {
    const product = products.get(item.productId)!;
    return sum + Math.max(0, product.price_minor - (product.subscription_price_minor ?? product.price_minor)) * item.quantity;
  }, 0);
  const response = {
    order: { id: orderId, orderNumber: orderNumber(hash), subtotalMinor, discountMinor, deliveryFeeMinor, totalMinor, promoCode, currency: "RSD", paymentStatus: payment.status, deliveryDate },
    subscription: subscriptionId ? { id: subscriptionId, status: "active", nextDeliveryDate: deliveryDate } : null,
    subscriptionOffer: conversionToken ? { token: conversionToken, eligibleItemCount: eligibleConversionItems.length, savingPerDeliveryMinor: conversionSavingMinor, expiresAt: new Date(Date.now() + 48 * 60 * 60_000).toISOString() } : null,
  };
  const statements: Array<{ sql: string; bindings?: SqlValue[] }> = [
    {
      sql: "INSERT INTO idempotency_keys (id, namespace, key, request_hash, response_json, status_code, expires_at) VALUES (?, 'checkout', ?, ?, ?, 201, ?)",
      bindings: [crypto.randomUUID(), idempotencyKey, requestHash, JSON.stringify(response), new Date(Date.now() + 7 * 86_400_000).toISOString()],
    },
    {
      sql: "INSERT INTO customers (id, email, full_name, phone, address_line_1, address_line_2, city, postal_code, delivery_note, source_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET full_name=excluded.full_name, phone=excluded.phone, address_line_1=excluded.address_line_1, address_line_2=excluded.address_line_2, city=excluded.city, postal_code=excluded.postal_code, delivery_note=excluded.delivery_note, source_json=excluded.source_json, updated_at=excluded.updated_at",
      bindings: [customerId, customer.email, customer.fullName, customer.phone, customer.addressLine1, customer.addressLine2, customer.city, customer.postalCode, customer.deliveryNote, JSON.stringify(attribution), now, now],
    },
  ];
  if (subscriptionId) statements.push({ sql: "INSERT INTO subscriptions (id, customer_id, status, payment_method, payment_provider_ref, next_delivery_date, started_at, created_at, updated_at) VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?)", bindings: [subscriptionId, customerId, paymentMethod, payment.providerReference, deliveryDate, now, now, now] });
  statements.push({
    sql: "INSERT INTO orders (id, order_number, customer_id, subscription_id, kind, payment_method, payment_provider_ref, payment_status, fulfillment_status, delivery_date, subtotal_minor, discount_minor, delivery_fee_minor, payment_fee_minor, estimated_delivery_cost_minor, credit_applied_minor, total_minor, promo_code, currency, customer_note, source_json, idempotency_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?, ?, ?, 0, ?, ?, 'RSD', ?, ?, ?, ?, ?)",
    bindings: [orderId, response.order.orderNumber, customerId, subscriptionId, hasSubscription ? "subscription_invoice" : "one_time", paymentMethod, payment.providerReference, payment.status, deliveryDate, subtotalMinor, discountMinor, deliveryFeeMinor, paymentFeeMinor, estimatedDeliveryCostMinor, totalMinor, promoCode, customer.deliveryNote, JSON.stringify(attribution), idempotencyKey, now, now],
  });
  for (const item of items) {
    const product = products.get(item.productId)!;
    const occurrences = item.purchaseType === "subscription" ? remainingOccurrencesInMonth(deliveryDate, item.cadence!) : 1;
    const unitPriceMinor = productUnitPrice(product, item.purchaseType);
    statements.push({ sql: "INSERT INTO order_items (id, order_id, product_id, product_name, unit_label, quantity, unit_price_minor, unit_cost_minor, unit_packaging_cost_minor, total_cost_minor, line_total_minor, purchase_type, cadence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", bindings: [crypto.randomUUID(), orderId, product.id, product.name, product.unit_label, item.quantity, unitPriceMinor, product.cost_minor, product.packaging_cost_minor, (product.cost_minor + product.packaging_cost_minor) * item.quantity * occurrences, unitPriceMinor * item.quantity * occurrences, item.purchaseType, item.cadence] });
    if (item.purchaseType === "subscription") statements.push({ sql: "INSERT INTO subscription_items (id, subscription_id, product_id, quantity, cadence, cadence_anchor_date, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)", bindings: [crypto.randomUUID(), subscriptionId, product.id, item.quantity, item.cadence, deliveryDate, now, now] });
  }
  if (promo) statements.push({ sql: "UPDATE promo_codes SET times_used = times_used + 1, updated_at = ? WHERE id = ?", bindings: [now, promo.id] });
  statements.push(audit("system", "checkout", "order.created", "order", orderId, null, response.order));
  statements.push(enqueue("order.created", "order", orderId, response));
  statements.push(enqueue("email.order_confirmation.requested", "order", orderId, response));
  statements.push(enqueue(payment.status === "paid" ? "payment.captured" : "payment.cash_due", "order", orderId, response.order));
  if (payment.status === "paid") {
    statements.push(enqueue("fiscal.receipt.requested", "order", orderId, response.order));
    statements.push(purchaseAnalyticsEvent(orderId, response.order.orderNumber, "checkout-capture"));
  }
  if (subscriptionId) statements.push(enqueue("subscription.activated", "subscription", subscriptionId, { ...response.subscription, cutoffAt }));
  if (conversionTokenHash) statements.push({ sql: "INSERT INTO order_conversion_tokens (id, order_id, token_hash, expires_at) VALUES (?, ?, ?, ?)", bindings: [crypto.randomUUID(), orderId, conversionTokenHash, response.subscriptionOffer!.expiresAt] });
  const recoveryCartId = optionalString(input.recoveryCartId, "recoveryCartId", 100);
  if (recoveryCartId) statements.push({ sql: "UPDATE abandoned_carts SET status = 'converted', converted_order_id = ?, updated_at = ? WHERE id = ?", bindings: [orderId, now, recoveryCartId] });
  try {
    await batch(statements);
  } catch (error) {
    const replay = await first<{ request_hash: string; response_json: string | null; status_code: number | null } & Record<string, unknown>>("SELECT request_hash, response_json, status_code FROM idempotency_keys WHERE namespace = 'checkout' AND key = ?", idempotencyKey);
    if (replay?.request_hash === requestHash && replay.response_json) return { status: replay.status_code ?? 201, body: JSON.parse(replay.response_json) };
    if (promo) await resolvePromo(promoCode, subtotalMinor);
    throw error;
  }
  return { status: 201, body: response };
}

interface ConversionRow extends Record<string, unknown> {
  token_id: string;
  order_id: string;
  customer_id: string;
  payment_method: "card" | "cash";
  payment_provider_ref: string | null;
  delivery_date: string;
  expires_at: string;
  used_at: string | null;
}

export async function convertOrderToSubscription(input: Record<string, unknown>) {
  const token = requiredString(input.token, "token", 200);
  assertDomain(token.length >= 32, "INVALID_TOKEN", "Ponuda za redovnu dostavu nije važeća.", 401);
  const cadence = enumValue(input.cadence ?? "weekly", "cadence", ["weekly", "biweekly"] as const);
  const tokenHash = await sha256(token);
  const conversion = await first<ConversionRow>(
    `SELECT oct.id AS token_id, oct.order_id, oct.expires_at, oct.used_at, o.customer_id, o.payment_method, o.payment_provider_ref, o.delivery_date
     FROM order_conversion_tokens oct JOIN orders o ON o.id = oct.order_id WHERE oct.token_hash = ?`,
    tokenHash,
  );
  assertDomain(conversion && !conversion.used_at && Date.parse(conversion.expires_at) > Date.now(), "INVALID_TOKEN", "Ponuda je iskorišćena ili je istekla.", 401);
  if (conversion.payment_method === "card") assertDomain(conversion.payment_provider_ref, "PAYMENT_METHOD_UNAVAILABLE", "Kartica se ne može koristiti za redovnu dostavu.", 409);
  const sourceItems = await all<ProductRow & { order_quantity: number }>(
    `SELECT p.*, oi.quantity AS order_quantity FROM order_items oi JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ? AND oi.purchase_type = 'one_time' AND p.is_active = 1 AND p.allow_subscription = 1`,
    conversion.order_id,
  );
  assertDomain(sourceItems.length > 0, "SUBSCRIPTION_UNAVAILABLE", "U ovoj porudžbini nema proizvoda dostupnih za redovnu dostavu.", 409);
  const idHash = await stableJsonHash({ conversion: conversion.token_id });
  const subscriptionId = `sub_${idHash.slice(0, 32)}`;
  const nextDeliveryDate = addLocalDays(conversion.delivery_date, 7);
  const now = new Date().toISOString();
  const statements: Array<{ sql: string; bindings?: SqlValue[] }> = [{
    sql: "INSERT INTO subscriptions (id, customer_id, status, payment_method, payment_provider_ref, next_delivery_date, started_at, created_at, updated_at) VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?)",
    bindings: [subscriptionId, conversion.customer_id, conversion.payment_method, conversion.payment_provider_ref, nextDeliveryDate, now, now, now],
  }];
  sourceItems.forEach((item) => statements.push({
    sql: "INSERT INTO subscription_items (id, subscription_id, product_id, quantity, cadence, cadence_anchor_date, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)",
    bindings: [crypto.randomUUID(), subscriptionId, item.id, item.order_quantity, cadence, nextDeliveryDate, now, now],
  }));
  statements.push({ sql: "UPDATE order_conversion_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL", bindings: [now, conversion.token_id] });
  statements.push(audit("customer", conversion.customer_id, "order.converted_to_subscription", "subscription", subscriptionId, null, { sourceOrderId: conversion.order_id, cadence, nextDeliveryDate }));
  const conversionSettings = await getBusinessSettings();
  const conversionCutoffAt = cutoffForDelivery(nextDeliveryDate, conversionSettings.cutoffHours, conversionSettings.deliveryLocalTime);
  statements.push(enqueue("subscription.activated", "subscription", subscriptionId, { sourceOrderId: conversion.order_id, cadence, nextDeliveryDate, cutoffAt: conversionCutoffAt }));
  await batch(statements);
  return { subscription: { id: subscriptionId, status: "active", cadence, nextDeliveryDate, itemCount: sourceItems.length } };
}

export async function getAccount(customerId: string) {
  const customer = await first<CustomerRow>("SELECT * FROM customers WHERE id = ?", customerId);
  assertDomain(customer, "ACCOUNT_NOT_FOUND", "Customer account was not found.", 404);
  const subscriptions = await all<SubscriptionRow>("SELECT * FROM subscriptions WHERE customer_id = ? ORDER BY created_at DESC", customerId);
  const items = subscriptions.length ? await all<SubscriptionItemRow>(`SELECT si.*, p.name AS product_name, p.unit_label, COALESCE(p.subscription_price_minor, p.price_minor) AS price_minor FROM subscription_items si JOIN products p ON p.id = si.product_id WHERE si.subscription_id IN (${sqlPlaceholders(subscriptions.length)}) ORDER BY si.created_at`, ...subscriptions.map((subscription) => subscription.id)) : [];
  const orders = await all<Record<string, unknown> & { id: string }>("SELECT id, order_number, kind, payment_status, fulfillment_status, delivery_date, total_minor, currency, created_at FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50", customerId);
  const oneTimeItems = await all<{ order_id: string; product_name: string; quantity: number; unit_label: string; delivery_date: string } & Record<string, unknown>>(
    `SELECT oi.order_id, oi.product_name, oi.quantity, oi.unit_label, o.delivery_date FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.customer_id = ? AND oi.purchase_type = 'one_time' AND o.kind IN ('one_time', 'subscription_invoice') AND o.fulfillment_status = 'planned' AND o.delivery_date >= ? ORDER BY o.delivery_date, oi.id`, customerId, localDateAt(),
  );
  const credits = await all<Record<string, unknown>>("SELECT id, subscription_id, order_id, amount_minor, reason, status, created_at FROM credits_ledger WHERE customer_id = ? ORDER BY created_at DESC", customerId);
  const addons = subscriptions.length ? await all<Record<string, unknown>>(
    `SELECT nda.id, nda.subscription_id, nda.product_id, nda.delivery_date, nda.quantity, nda.unit_price_minor, nda.order_id, nda.consumed_at, nda.cancelled_at, p.name AS product_name, p.unit_label, o.order_number, o.payment_status
     FROM next_delivery_addons nda JOIN products p ON p.id = nda.product_id LEFT JOIN orders o ON o.id = nda.order_id
     WHERE nda.subscription_id IN (${sqlPlaceholders(subscriptions.length)}) AND nda.consumed_at IS NULL AND nda.cancelled_at IS NULL ORDER BY nda.created_at`,
    ...subscriptions.map((subscription) => subscription.id),
  ) : [];
  const addonProducts = (await all<ProductRow>("SELECT * FROM products WHERE is_active = 1 ORDER BY (price_minor - cost_minor - packaging_cost_minor) DESC, sort_order LIMIT 8")).map((product) => publicProduct(product));
  const settings = await getBusinessSettings();
  const windows = subscriptions.length ? await all<{ delivery_date: string; cutoff_at: string; locked_at: string | null } & Record<string, unknown>>(
    `SELECT delivery_date, cutoff_at, locked_at FROM deliveries WHERE delivery_date IN (${sqlPlaceholders(subscriptions.length)})`, ...subscriptions.map((subscription) => subscription.next_delivery_date),
  ) : [];
  const deliveryHistory = await all<{ id: string; date: string; status: string } & Record<string, unknown>>(
    `SELECT dord.id, d.delivery_date AS date, dord.status FROM delivery_orders dord
     JOIN deliveries d ON d.id = dord.delivery_id WHERE dord.customer_id = ? ORDER BY d.delivery_date DESC LIMIT 50`, customerId,
  );
  const historyItems = deliveryHistory.length ? await all<{ delivery_order_id: string } & Record<string, unknown>>(
    `SELECT delivery_order_id, product_name, unit_label, quantity FROM delivery_items WHERE delivery_order_id IN (${sqlPlaceholders(deliveryHistory.length)}) ORDER BY created_at`, ...deliveryHistory.map((delivery) => delivery.id),
  ) : [];
  const skips = await all<{ id: string; date: string } & Record<string, unknown>>(
    `SELECT sk.id, sk.delivery_date AS date FROM subscription_skips sk JOIN subscriptions s ON s.id = sk.subscription_id WHERE s.customer_id = ? ORDER BY sk.delivery_date DESC LIMIT 50`, customerId,
  );
  return {
    customer: { id: customer.id, email: customer.email, fullName: customer.full_name, phone: customer.phone, addressLine1: customer.address_line_1, addressLine2: customer.address_line_2, city: customer.city, postalCode: customer.postal_code, deliveryNote: customer.delivery_note },
    subscriptions: subscriptions.map((subscription) => {
      const window = windows.find((entry) => entry.delivery_date === subscription.next_delivery_date);
      const cutoffAt = window?.cutoff_at ?? cutoffForDelivery(subscription.next_delivery_date, settings.cutoffHours, settings.deliveryLocalTime);
      const activeItems = items.filter((item) => item.subscription_id === subscription.id && item.status === "active");
      let afterSkipDate = addLocalDays(subscription.next_delivery_date, 7);
      for (let attempts = 0; attempts < 8 && activeItems.length && !activeItems.some((item) => isCadenceDue(item.cadence_anchor_date, afterSkipDate, item.cadence)); attempts += 1) afterSkipDate = addLocalDays(afterSkipDate, 7);
      return { id: subscription.id, version: subscription.version, status: subscription.status, paymentMethod: subscription.payment_method, pauseUntil: subscription.pause_until, nextDeliveryDate: subscription.next_delivery_date, cutoffAt, locked: Boolean(window?.locked_at) || Date.now() >= Date.parse(cutoffAt), afterSkipDate, cancellationReason: subscription.cancellation_reason, items: items.filter((item) => item.subscription_id === subscription.id).map((item) => ({ id: item.id, productId: item.product_id, productName: item.product_name, unitLabel: item.unit_label, priceMinor: item.price_minor, quantity: item.quantity, cadence: item.cadence, cadenceAnchorDate: item.cadence_anchor_date, dueNext: isCadenceDue(item.cadence_anchor_date, subscription.next_delivery_date, item.cadence), status: item.status })), nextOnlyAddons: addons.filter((item) => item.subscription_id === subscription.id) };
    }),
    currentDate: localDateAt(),
    deliveryHistory: [...deliveryHistory.map((delivery) => ({ ...delivery, items: historyItems.filter((item) => item.delivery_order_id === delivery.id) })), ...skips.map((skip) => ({ ...skip, status: "skipped", items: [] }))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50),
    addonProducts,
    oneTimeDeliveries: [...new Set(oneTimeItems.map((item) => item.delivery_date))].map((date) => ({ date, items: oneTimeItems.filter((item) => item.delivery_date === date) })),
    orders,
    credits,
  };
}

async function assertSubscriptionMutable(subscription: SubscriptionRow): Promise<void> {
  const settings = await getBusinessSettings();
  const delivery = await first<{ cutoff_at: string; locked_at: string | null } & Record<string, unknown>>("SELECT cutoff_at, locked_at FROM deliveries WHERE delivery_date = ?", subscription.next_delivery_date);
  const cutoffAt = delivery?.cutoff_at ?? cutoffForDelivery(subscription.next_delivery_date, settings.cutoffHours, settings.deliveryLocalTime);
  assertBeforeCutoff(cutoffAt, delivery?.locked_at);
}

async function paidThisMonth(subscriptionId: string, date: string): Promise<boolean> {
  return Boolean(await first<Record<string, unknown>>("SELECT id FROM orders WHERE subscription_id = ? AND kind = 'subscription_invoice' AND payment_status = 'paid' AND substr(delivery_date, 1, 7) = ? LIMIT 1", subscriptionId, date.slice(0, 7)));
}

export async function mutateSubscription(customerId: string, subscriptionId: string, input: Record<string, unknown>, rawKey: string | null) {
  const mutationKey = requiredString(rawKey ?? input.idempotencyKey, "Idempotency-Key", 200);
  assertDomain(mutationKey.length >= 8, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key must contain at least 8 characters.", 422);
  const requestHash = await stableJsonHash({ customerId, subscriptionId, input });
  const replay = await first<{ request_hash: string; response_json: string | null } & Record<string, unknown>>("SELECT request_hash, response_json FROM idempotency_keys WHERE namespace = 'subscription-mutation' AND key = ?", mutationKey);
  if (replay) {
    assertDomain(replay.request_hash === requestHash, "IDEMPOTENCY_CONFLICT", "Ovaj Idempotency-Key je već iskorišćen za drugu izmenu.", 409);
    const saved = replay.response_json ? JSON.parse(replay.response_json) as Record<string, unknown> : { subscriptionId, status: "processing" };
    return { ...saved, account: await getAccount(customerId) };
  }
  const subscription = await first<SubscriptionRow>("SELECT * FROM subscriptions WHERE id = ? AND customer_id = ?", subscriptionId, customerId);
  if (!subscription) throw new DomainError("SUBSCRIPTION_NOT_FOUND", "Subscription was not found.", 404);
  const expectedVersion = positiveInt(input.expectedVersion, "expectedVersion", 1_000_000_000);
  assertDomain(expectedVersion === subscription.version, "SUBSCRIPTION_VERSION_CONFLICT", "Pretplata je promenjena u drugom prozoru. Učitani su najnoviji podaci.", 409, { expectedVersion, currentVersion: subscription.version });
  let action = enumValue(input.action, "action", ["add_item", "update_item", "remove_item", "add_next_only", "skip_next", "slow_down", "pause", "resume", "cancel"] as const);
  assertDomain(subscription.status !== "cancelled", "SUBSCRIPTION_CANCELLED", "A cancelled subscription is terminal and cannot be changed or resumed.", 409);
  if (action === "resume") assertDomain(subscription.status === "paused", "INVALID_SUBSCRIPTION_STATE", "Only a paused subscription can be resumed.", 409);
  if (["add_item", "update_item", "remove_item", "add_next_only", "skip_next", "slow_down", "pause"].includes(action)) {
    assertDomain(subscription.status === "active", "INVALID_SUBSCRIPTION_STATE", "This action requires an active subscription.", 409);
  }
  // Resume intentionally schedules a new future delivery and never edits a stale/locked snapshot.
  if (action !== "resume") await assertSubscriptionMutable(subscription);
  const now = new Date().toISOString();
  const statements: Array<{ sql: string; bindings?: SqlValue[] }> = [
    { sql: "INSERT INTO subscription_mutation_versions (id, subscription_id, expected_version, mutation_key) VALUES (?, ?, ?, ?)", bindings: [crypto.randomUUID(), subscriptionId, expectedVersion, mutationKey] },
    { sql: "UPDATE subscriptions SET version = version + 1, updated_at = ? WHERE id = ? AND customer_id = ? AND version = ?", bindings: [now, subscriptionId, customerId, expectedVersion] },
  ];
  let resultingNextDeliveryDate = subscription.next_delivery_date;
  let adjustmentMinor = 0;
  let addonOrder: Record<string, unknown> | null = null;
  const activeItems = await all<SubscriptionItemRow & { price_minor: number }>("SELECT si.*, COALESCE(p.subscription_price_minor, p.price_minor) AS price_minor FROM subscription_items si JOIN products p ON p.id = si.product_id WHERE si.subscription_id = ? AND si.status = 'active'", subscriptionId);
  const pendingAddons = await all<{ id: string; order_id: string | null; payment_status: string | null; total_minor: number | null } & Record<string, unknown>>("SELECT nda.id, nda.order_id, o.payment_status, o.total_minor FROM next_delivery_addons nda LEFT JOIN orders o ON o.id = nda.order_id WHERE nda.subscription_id = ? AND nda.consumed_at IS NULL AND nda.cancelled_at IS NULL", subscriptionId);
  const paid = await paidThisMonth(subscriptionId, subscription.next_delivery_date);
  const deliveryValue = activeItems.filter((item) => isCadenceDue(item.cadence_anchor_date, subscription.next_delivery_date, item.cadence)).reduce((sum, item) => sum + item.price_minor * item.quantity, 0);
  const dueCount = (item: Pick<SubscriptionItemRow, "cadence_anchor_date" | "cadence">, cadence = item.cadence) => {
    let count = 0;
    const month = subscription.next_delivery_date.slice(0, 7);
    for (let date = subscription.next_delivery_date; date.startsWith(month); date = addLocalDays(date, 7)) {
      if (isCadenceDue(item.cadence_anchor_date, date, cadence)) count += 1;
    }
    return count;
  };

  if (action === "remove_item" && activeItems.length === 1 && activeItems[0].id === input.itemId) action = "cancel";

  if (action === "add_item") {
    const productId = requiredString(input.productId, "productId", 100);
    const quantity = positiveInt(input.quantity, "quantity", 100);
    const cadence = enumValue(input.cadence, "cadence", ["weekly", "biweekly"] as const);
    const product = await first<ProductRow>("SELECT * FROM products WHERE id = ? AND is_active = 1", productId);
    assertDomain(product && product.allow_subscription, "SUBSCRIPTION_UNAVAILABLE", "Proizvod nije dostupan za redovnu dostavu.", 409);
    const existingItem = activeItems.find((item) => item.product_id === productId && item.cadence === cadence);
    const anchor = existingItem?.cadence_anchor_date ?? subscription.next_delivery_date;
    if (existingItem) {
      assertDomain(existingItem.quantity + quantity <= 100, "VALIDATION_ERROR", "Najviše 100 komada po stavci.", 422);
      statements.push({ sql: "UPDATE subscription_items SET quantity = quantity + ?, updated_at = ? WHERE id = ?", bindings: [quantity, now, existingItem.id] });
    } else statements.push({ sql: "INSERT INTO subscription_items (id, subscription_id, product_id, quantity, cadence, cadence_anchor_date, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)", bindings: [crypto.randomUUID(), subscriptionId, productId, quantity, cadence, anchor, now, now] });
    if (paid) adjustmentMinor = -productUnitPrice(product, "subscription") * quantity * dueCount({ cadence_anchor_date: anchor, cadence });
  } else if (action === "update_item" || action === "remove_item") {
    const itemId = requiredString(input.itemId, "itemId", 100);
    const item = activeItems.find((candidate) => candidate.id === itemId);
    assertDomain(item, "SUBSCRIPTION_ITEM_NOT_FOUND", "Subscription item was not found.", 404);
    if (action === "remove_item") {
      statements.push({ sql: "UPDATE subscription_items SET status = 'cancelled', updated_at = ? WHERE id = ?", bindings: [now, itemId] });
      if (paid) adjustmentMinor = item.price_minor * item.quantity * dueCount(item);
    } else {
      const quantity = input.quantity === undefined ? item.quantity : positiveInt(input.quantity, "quantity", 100);
      const cadence = input.cadence === undefined ? item.cadence : enumValue(input.cadence, "cadence", ["weekly", "biweekly"] as const);
      statements.push({ sql: "UPDATE subscription_items SET quantity = ?, cadence = ?, updated_at = ? WHERE id = ?", bindings: [quantity, cadence, now, itemId] });
      if (paid) {
        const oldRemainder = item.price_minor * item.quantity * dueCount(item);
        const newRemainder = item.price_minor * quantity * dueCount(item, cadence);
        adjustmentMinor = oldRemainder - newRemainder;
      }
    }
  } else if (action === "add_next_only") {
    const productId = requiredString(input.productId, "productId", 100);
    const quantity = positiveInt(input.quantity, "quantity", 100);
    const product = await first<ProductRow>("SELECT * FROM products WHERE id = ? AND is_active = 1", productId);
    assertDomain(product, "PRODUCT_UNAVAILABLE", "Product is unavailable.", 409);
    const totalMinor = product.price_minor * quantity;
    const addonHash = await stableJsonHash({ namespace: "next-delivery-addon", mutationKey });
    const addonOrderId = `ord_${addonHash.slice(0, 32)}`;
    const addonOrderKey = `addon:${mutationKey}`;
    assertDomain(subscription.payment_method !== "card" || subscription.payment_provider_ref, "PAYMENT_METHOD_REQUIRED", "Sačuvani način kartičnog plaćanja nije dostupan; izaberite gotovinu ili ažurirajte karticu.", 409);
    const payment = await localPaymentGateway.authorize({ idempotencyKey: addonOrderKey, orderId: addonOrderId, amountMinor: totalMinor, currency: "RSD", method: subscription.payment_method, paymentToken: subscription.payment_provider_ref ?? undefined });
    assertDomain(payment.status !== "failed", "PAYMENT_FAILED", "Naplata dodatka nije uspela.", 402);
    const addonOrderNumber = orderNumber(addonHash);
    statements.push({ sql: "INSERT INTO orders (id, order_number, customer_id, subscription_id, kind, payment_method, payment_provider_ref, payment_status, fulfillment_status, delivery_date, subtotal_minor, discount_minor, delivery_fee_minor, payment_fee_minor, estimated_delivery_cost_minor, credit_applied_minor, total_minor, currency, customer_note, source_json, idempotency_key, created_at, updated_at) VALUES (?, ?, ?, ?, 'adjustment', ?, ?, ?, 'planned', ?, ?, 0, 0, 0, 0, 0, ?, 'RSD', ?, ?, ?, ?, ?)", bindings: [addonOrderId, addonOrderNumber, customerId, subscriptionId, subscription.payment_method, payment.providerReference, payment.status, subscription.next_delivery_date, totalMinor, totalMinor, `Dodatak uz dostavu ${subscription.next_delivery_date}`, JSON.stringify({ type: "next_delivery_addon", subscriptionId }), addonOrderKey, now, now] });
    statements.push({ sql: "INSERT INTO order_items (id, order_id, product_id, product_name, unit_label, quantity, unit_price_minor, unit_cost_minor, unit_packaging_cost_minor, total_cost_minor, line_total_minor, purchase_type, cadence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'one_time', NULL)", bindings: [crypto.randomUUID(), addonOrderId, product.id, product.name, product.unit_label, quantity, product.price_minor, product.cost_minor, product.packaging_cost_minor, (product.cost_minor + product.packaging_cost_minor) * quantity, totalMinor] });
    statements.push({ sql: "INSERT INTO next_delivery_addons (id, subscription_id, product_id, delivery_date, quantity, unit_price_minor, order_id) VALUES (?, ?, ?, ?, ?, ?, ?)", bindings: [crypto.randomUUID(), subscriptionId, productId, subscription.next_delivery_date, quantity, product.price_minor, addonOrderId] });
    addonOrder = { id: addonOrderId, orderNumber: addonOrderNumber, totalMinor, paymentStatus: payment.status, paymentMethod: subscription.payment_method, deliveryDate: subscription.next_delivery_date };
    statements.push(enqueue("order.created", "order", addonOrderId, { order: addonOrder, source: "next_delivery_addon" }));
    statements.push(enqueue("email.order_confirmation.requested", "order", addonOrderId, { order: addonOrder, source: "next_delivery_addon" }));
    statements.push(enqueue(payment.status === "paid" ? "payment.captured" : "payment.cash_due", "order", addonOrderId, addonOrder));
    if (payment.status === "paid") {
      statements.push(enqueue("fiscal.receipt.requested", "order", addonOrderId, addonOrder));
      statements.push(purchaseAnalyticsEvent(addonOrderId, addonOrderNumber, "next-delivery-addon"));
    }
  } else if (action === "skip_next") {
    let nextDueDate = addLocalDays(subscription.next_delivery_date, 7);
    for (let attempts = 0; attempts < 8 && activeItems.length && !activeItems.some((item) => isCadenceDue(item.cadence_anchor_date, nextDueDate, item.cadence)); attempts += 1) nextDueDate = addLocalDays(nextDueDate, 7);
    statements.push({ sql: "INSERT INTO subscription_skips (id, subscription_id, delivery_date) VALUES (?, ?, ?) ON CONFLICT(subscription_id, delivery_date) DO NOTHING", bindings: [crypto.randomUUID(), subscriptionId, subscription.next_delivery_date] });
    statements.push({ sql: "UPDATE subscriptions SET next_delivery_date = ?, updated_at = ? WHERE id = ?", bindings: [nextDueDate, now, subscriptionId] });
    resultingNextDeliveryDate = nextDueDate;
    if (paid) adjustmentMinor = deliveryValue;
  } else if (action === "slow_down") {
    statements.push({ sql: "UPDATE subscription_items SET cadence = 'biweekly', updated_at = ? WHERE subscription_id = ? AND status = 'active'", bindings: [now, subscriptionId] });
    if (paid) adjustmentMinor = activeItems.reduce((sum, item) => sum + item.price_minor * item.quantity * (dueCount(item) - dueCount(item, "biweekly")), 0);
  } else if (action === "pause") {
    const pauseUntil = assertLocalDate(input.pauseUntil, "pauseUntil");
    assertDomain(pauseUntil > subscription.next_delivery_date, "VALIDATION_ERROR", "pauseUntil must be after the next delivery.", 422);
    let resumeDate = subscription.next_delivery_date;
    while (resumeDate < pauseUntil) resumeDate = addLocalDays(resumeDate, 7);
    for (let attempts = 0; attempts < 8 && activeItems.length && !activeItems.some((item) => isCadenceDue(item.cadence_anchor_date, resumeDate, item.cadence)); attempts += 1) resumeDate = addLocalDays(resumeDate, 7);
    resultingNextDeliveryDate = resumeDate;
    statements.push({ sql: "UPDATE subscriptions SET status = 'paused', pause_until = ?, next_delivery_date = ?, updated_at = ? WHERE id = ?", bindings: [pauseUntil, resumeDate, now, subscriptionId] });
    if (paid) {
      for (let date = subscription.next_delivery_date; date < resumeDate && date.startsWith(subscription.next_delivery_date.slice(0, 7)); date = addLocalDays(date, 7)) {
        adjustmentMinor += activeItems.filter((item) => isCadenceDue(item.cadence_anchor_date, date, item.cadence)).reduce((sum, item) => sum + item.price_minor * item.quantity, 0);
      }
    }
  } else if (action === "resume") {
    const settings = await getBusinessSettings();
    let resumeDate = subscription.next_delivery_date > localDateAt() ? subscription.next_delivery_date : nextWeekday(new Date(), settings.deliveryWeekday);
    for (let attempts = 0; attempts < 12; attempts += 1) {
      const delivery = await first<{ cutoff_at: string; locked_at: string | null } & Record<string, unknown>>("SELECT cutoff_at, locked_at FROM deliveries WHERE delivery_date = ?", resumeDate);
      const cutoffAt = delivery?.cutoff_at ?? cutoffForDelivery(resumeDate, settings.cutoffHours, settings.deliveryLocalTime);
      if (!delivery?.locked_at && Date.now() < Date.parse(cutoffAt)) break;
      resumeDate = addLocalDays(resumeDate, 7);
    }
    resultingNextDeliveryDate = resumeDate;
    statements.push({ sql: "UPDATE subscriptions SET status = 'active', pause_until = NULL, next_delivery_date = ?, updated_at = ? WHERE id = ?", bindings: [resumeDate, now, subscriptionId] });
  } else if (action === "cancel") {
    const reason = optionalString(input.reason, "reason", 240) ?? "not_provided";
    statements.push({ sql: "UPDATE subscriptions SET status = 'cancelled', cancelled_at = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?", bindings: [now, reason, now, subscriptionId] });
    if (paid) adjustmentMinor = activeItems.reduce((sum, item) => sum + item.price_minor * item.quantity * dueCount(item), 0);
    const paidAddonCredit = pendingAddons.filter((addon) => addon.payment_status === "paid").reduce((sum, addon) => sum + Number(addon.total_minor ?? 0), 0);
    adjustmentMinor += paidAddonCredit;
    statements.push({ sql: "UPDATE next_delivery_addons SET cancelled_at = ? WHERE subscription_id = ? AND consumed_at IS NULL AND cancelled_at IS NULL", bindings: [now, subscriptionId] });
    statements.push({ sql: "UPDATE orders SET fulfillment_status = 'cancelled', updated_at = ? WHERE id IN (SELECT order_id FROM next_delivery_addons WHERE subscription_id = ? AND cancelled_at = ? AND order_id IS NOT NULL)", bindings: [now, subscriptionId, now] });
  }
  if (resultingNextDeliveryDate !== subscription.next_delivery_date && action !== "cancel") {
    statements.push({ sql: "UPDATE next_delivery_addons SET delivery_date = ? WHERE subscription_id = ? AND delivery_date = ? AND consumed_at IS NULL AND cancelled_at IS NULL", bindings: [resultingNextDeliveryDate, subscriptionId, subscription.next_delivery_date] });
    statements.push({ sql: "UPDATE orders SET delivery_date = ?, updated_at = ? WHERE id IN (SELECT order_id FROM next_delivery_addons WHERE subscription_id = ? AND delivery_date = ? AND consumed_at IS NULL AND cancelled_at IS NULL AND order_id IS NOT NULL)", bindings: [resultingNextDeliveryDate, now, subscriptionId, resultingNextDeliveryDate] });
  }
  if (adjustmentMinor !== 0) statements.push({ sql: "INSERT INTO credits_ledger (id, customer_id, subscription_id, amount_minor, reason, status) VALUES (?, ?, ?, ?, ?, 'open')", bindings: [crypto.randomUUID(), customerId, subscriptionId, adjustmentMinor, `paid_month_${action}`] });
  const response = { subscriptionId, action, version: expectedVersion + 1, adjustmentMinor, currency: "RSD", addonOrder };
  statements.push({ sql: "INSERT INTO idempotency_keys (id, namespace, key, request_hash, response_json, status_code, expires_at) VALUES (?, 'subscription-mutation', ?, ?, ?, 200, ?)", bindings: [crypto.randomUUID(), mutationKey, requestHash, JSON.stringify(response), new Date(Date.now() + 400 * 86_400_000).toISOString()] });
  statements.push(audit("customer", customerId, `subscription.${action}`, "subscription", subscriptionId, subscription, { ...input, adjustmentMinor }));
  const notificationSettings = await getBusinessSettings();
  const notificationDelivery = action === "cancel" ? null : await first<{ cutoff_at: string } & Record<string, unknown>>("SELECT cutoff_at FROM deliveries WHERE delivery_date = ?", resultingNextDeliveryDate);
  const notificationCutoffAt = action === "cancel" ? null : notificationDelivery?.cutoff_at ?? cutoffForDelivery(resultingNextDeliveryDate, notificationSettings.cutoffHours, notificationSettings.deliveryLocalTime);
  statements.push(enqueue(`subscription.${action}`, "subscription", subscriptionId, { customerId, nextDeliveryDate: resultingNextDeliveryDate, cutoffAt: notificationCutoffAt, adjustmentMinor, addonOrder }));
  try {
    await batch(statements);
  } catch (error) {
    const raced = await first<{ request_hash: string; response_json: string | null } & Record<string, unknown>>("SELECT request_hash, response_json FROM idempotency_keys WHERE namespace = 'subscription-mutation' AND key = ?", mutationKey);
    if (raced?.request_hash === requestHash && raced.response_json) return { ...JSON.parse(raced.response_json), account: await getAccount(customerId) };
    const current = await first<{ version: number } & Record<string, unknown>>("SELECT version FROM subscriptions WHERE id = ? AND customer_id = ?", subscriptionId, customerId);
    if (current && current.version !== expectedVersion) throw new DomainError("SUBSCRIPTION_VERSION_CONFLICT", "Pretplata je promenjena u drugom prozoru. Učitani su najnoviji podaci.", 409, { expectedVersion, currentVersion: current.version });
    throw error;
  }
  // Open projections are operational read models, so refresh them immediately after an accepted pre-cutoff mutation.
  // Locked snapshots are never regenerated. A distinct key makes each accepted mutation a new idempotent generation run.
  for (const date of new Set([subscription.next_delivery_date, resultingNextDeliveryDate])) {
    const openDelivery = await first<Record<string, unknown>>("SELECT id FROM deliveries WHERE delivery_date = ? AND status = 'open'", date);
    if (openDelivery) await generateDelivery(date, `account-refresh:${subscriptionId}:${date}:${now}`);
  }
  return { ...response, account: await getAccount(customerId) };
}
