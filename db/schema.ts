import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    shortDescription: text("short_description").notNull().default(""),
    description: text("description").notNull().default(""),
    category: text("category").notNull().default("Ostalo"),
    unitLabel: text("unit_label").notNull(),
    priceMinor: integer("price_minor").notNull(),
    costMinor: integer("cost_minor").notNull().default(0),
    packagingCostMinor: integer("packaging_cost_minor").notNull().default(0),
    subscriptionPriceMinor: integer("subscription_price_minor"),
    compareAtPriceMinor: integer("compare_at_price_minor"),
    currency: text("currency").notNull().default("RSD"),
    imageUrl: text("image_url"),
    imageAlt: text("image_alt").notNull().default(""),
    badge: text("badge"),
    origin: text("origin").notNull().default(""),
    isFeatured: integer("is_featured", { mode: "boolean" }).notNull().default(false),
    allowSubscription: integer("allow_subscription", { mode: "boolean" }).notNull().default(true),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    badiSku: integer("badi_sku"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("products_slug_unique").on(table.slug),
    check("products_price_nonnegative", sql`${table.priceMinor} >= 0`),
    check("products_cost_nonnegative", sql`${table.costMinor} >= 0`),
    check("products_packaging_cost_nonnegative", sql`${table.packagingCostMinor} >= 0`),
    check("products_subscription_price_nonnegative", sql`${table.subscriptionPriceMinor} IS NULL OR ${table.subscriptionPriceMinor} >= 0`),
    check("products_compare_price_nonnegative", sql`${table.compareAtPriceMinor} IS NULL OR ${table.compareAtPriceMinor} >= 0`),
    check("products_currency_rsd", sql`${table.currency} = 'RSD'`),
  ],
);

export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    addressLine1: text("address_line_1").notNull(),
    addressLine2: text("address_line_2"),
    city: text("city").notNull(),
    postalCode: text("postal_code").notNull(),
    deliveryNote: text("delivery_note"),
    sourceJson: text("source_json").notNull().default("{}"),
    ...timestamps,
  },
  (table) => [uniqueIndex("customers_email_unique").on(table.email)],
);

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull().references(() => customers.id),
    status: text("status", { enum: ["active", "paused", "cancelled"] }).notNull().default("active"),
    paymentMethod: text("payment_method", { enum: ["card", "cash"] }).notNull(),
    // Opaque provider token/reference only. Never a PAN, CVC, or other raw card data.
    paymentProviderRef: text("payment_provider_ref"),
    pauseUntil: text("pause_until"),
    nextDeliveryDate: text("next_delivery_date").notNull(),
    startedAt: text("started_at").notNull(),
    cancelledAt: text("cancelled_at"),
    cancellationReason: text("cancellation_reason"),
    ...timestamps,
  },
  (table) => [index("subscriptions_customer_idx").on(table.customerId), index("subscriptions_status_idx").on(table.status)],
);

export const subscriptionItems = sqliteTable(
  "subscription_items",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id").notNull().references(() => subscriptions.id),
    productId: text("product_id").notNull().references(() => products.id),
    quantity: integer("quantity").notNull(),
    cadence: text("cadence", { enum: ["weekly", "biweekly"] }).notNull(),
    cadenceAnchorDate: text("cadence_anchor_date").notNull(),
    status: text("status", { enum: ["active", "cancelled"] }).notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    index("subscription_items_subscription_idx").on(table.subscriptionId),
    check("subscription_items_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

export const subscriptionSkips = sqliteTable(
  "subscription_skips",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id").notNull().references(() => subscriptions.id),
    deliveryDate: text("delivery_date").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("subscription_skips_unique").on(table.subscriptionId, table.deliveryDate)],
);

export const nextDeliveryAddons = sqliteTable(
  "next_delivery_addons",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id").notNull().references(() => subscriptions.id),
    productId: text("product_id").notNull().references(() => products.id),
    deliveryDate: text("delivery_date").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    orderId: text("order_id").references(() => orders.id),
    consumedAt: text("consumed_at"),
    cancelledAt: text("cancelled_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("next_delivery_addons_subscription_date_idx").on(table.subscriptionId, table.deliveryDate),
    check("next_delivery_addons_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    orderNumber: text("order_number").notNull(),
    customerId: text("customer_id").notNull().references(() => customers.id),
    subscriptionId: text("subscription_id").references(() => subscriptions.id),
    kind: text("kind", { enum: ["one_time", "subscription_invoice", "adjustment"] }).notNull(),
    paymentMethod: text("payment_method", { enum: ["card", "cash"] }).notNull(),
    paymentProviderRef: text("payment_provider_ref"),
    paymentStatus: text("payment_status", { enum: ["pending", "paid", "failed", "refunded"] }).notNull(),
    fulfillmentStatus: text("fulfillment_status", { enum: ["planned", "locked", "delivered", "cancelled"] }).notNull().default("planned"),
    deliveryDate: text("delivery_date").notNull(),
    subtotalMinor: integer("subtotal_minor").notNull(),
    discountMinor: integer("discount_minor").notNull().default(0),
    deliveryFeeMinor: integer("delivery_fee_minor").notNull().default(0),
    paymentFeeMinor: integer("payment_fee_minor").notNull().default(0),
    estimatedDeliveryCostMinor: integer("estimated_delivery_cost_minor").notNull().default(0),
    creditAppliedMinor: integer("credit_applied_minor").notNull().default(0),
    totalMinor: integer("total_minor").notNull(),
    promoCode: text("promo_code"),
    currency: text("currency").notNull().default("RSD"),
    customerNote: text("customer_note"),
    sourceJson: text("source_json").notNull().default("{}"),
    idempotencyKey: text("idempotency_key").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("orders_number_unique").on(table.orderNumber),
    uniqueIndex("orders_idempotency_unique").on(table.idempotencyKey),
    index("orders_delivery_date_idx").on(table.deliveryDate),
    check("orders_amounts_nonnegative", sql`${table.subtotalMinor} >= 0 AND ${table.discountMinor} >= 0 AND ${table.deliveryFeeMinor} >= 0 AND ${table.creditAppliedMinor} >= 0 AND ${table.totalMinor} >= 0`),
    check("orders_currency_rsd", sql`${table.currency} = 'RSD'`),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull().references(() => orders.id),
    productId: text("product_id").notNull().references(() => products.id),
    productName: text("product_name").notNull(),
    unitLabel: text("unit_label").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    unitCostMinor: integer("unit_cost_minor").notNull().default(0),
    unitPackagingCostMinor: integer("unit_packaging_cost_minor").notNull().default(0),
    totalCostMinor: integer("total_cost_minor").notNull().default(0),
    lineTotalMinor: integer("line_total_minor").notNull(),
    purchaseType: text("purchase_type", { enum: ["one_time", "subscription"] }).notNull(),
    cadence: text("cadence", { enum: ["weekly", "biweekly"] }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("order_items_order_idx").on(table.orderId), check("order_items_quantity_positive", sql`${table.quantity} > 0`)],
);

export const deliveries = sqliteTable(
  "deliveries",
  {
    id: text("id").primaryKey(),
    deliveryDate: text("delivery_date").notNull(),
    cutoffAt: text("cutoff_at").notNull(),
    status: text("status", { enum: ["open", "locked", "completed"] }).notNull().default("open"),
    generatedAt: text("generated_at").notNull(),
    lockedAt: text("locked_at"),
    generationKey: text("generation_key").notNull(),
  },
  (table) => [uniqueIndex("deliveries_date_unique").on(table.deliveryDate), uniqueIndex("deliveries_generation_key_unique").on(table.generationKey)],
);

export const deliveryOrders = sqliteTable(
  "delivery_orders",
  {
    id: text("id").primaryKey(),
    deliveryId: text("delivery_id").notNull().references(() => deliveries.id),
    sourceOrderId: text("source_order_id").references(() => orders.id),
    subscriptionId: text("subscription_id").references(() => subscriptions.id),
    customerId: text("customer_id").notNull().references(() => customers.id),
    customerSnapshotJson: text("customer_snapshot_json").notNull(),
    note: text("note"),
    status: text("status", { enum: ["planned", "locked", "delivered", "cancelled"] }).notNull().default("planned"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("delivery_orders_delivery_idx").on(table.deliveryId),
    uniqueIndex("delivery_orders_order_unique").on(table.deliveryId, table.sourceOrderId),
    uniqueIndex("delivery_orders_subscription_unique").on(table.deliveryId, table.subscriptionId),
  ],
);

export const deliveryItems = sqliteTable(
  "delivery_items",
  {
    id: text("id").primaryKey(),
    deliveryOrderId: text("delivery_order_id").notNull().references(() => deliveryOrders.id),
    productId: text("product_id").notNull(),
    productName: text("product_name").notNull(),
    unitLabel: text("unit_label").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    sourceType: text("source_type", { enum: ["order", "subscription", "next_only"] }).notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("delivery_items_delivery_order_idx").on(table.deliveryOrderId), check("delivery_items_quantity_positive", sql`${table.quantity} > 0`)],
);

export const creditsLedger = sqliteTable(
  "credits_ledger",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull().references(() => customers.id),
    subscriptionId: text("subscription_id").references(() => subscriptions.id),
    orderId: text("order_id").references(() => orders.id),
    amountMinor: integer("amount_minor").notNull(),
    reason: text("reason").notNull(),
    status: text("status", { enum: ["open", "applied", "void"] }).notNull().default("open"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    appliedAt: text("applied_at"),
  },
  (table) => [index("credits_ledger_customer_status_idx").on(table.customerId, table.status)],
);

export const authTokens = sqliteTable(
  "auth_tokens",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").references(() => customers.id),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    kind: text("kind", { enum: ["magic_link", "session"] }).notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("auth_tokens_hash_unique").on(table.tokenHash), index("auth_tokens_email_idx").on(table.email)],
);

export const idempotencyKeys = sqliteTable(
  "idempotency_keys",
  {
    id: text("id").primaryKey(),
    namespace: text("namespace").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseJson: text("response_json"),
    statusCode: integer("status_code"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [uniqueIndex("idempotency_namespace_key_unique").on(table.namespace, table.key)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const promoCodes = sqliteTable(
  "promo_codes",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    description: text("description").notNull().default(""),
    discountType: text("discount_type", { enum: ["percent", "fixed"] }).notNull(),
    discountValue: integer("discount_value").notNull(),
    minimumOrderMinor: integer("minimum_order_minor").notNull().default(0),
    usageLimit: integer("usage_limit"),
    timesUsed: integer("times_used").notNull().default(0),
    startsAt: text("starts_at"),
    endsAt: text("ends_at"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("promo_codes_code_unique").on(table.code),
    index("promo_codes_active_idx").on(table.isActive, table.startsAt, table.endsAt),
    check("promo_codes_value_positive", sql`${table.discountValue} > 0`),
    check("promo_codes_minimum_nonnegative", sql`${table.minimumOrderMinor} >= 0`),
  ],
);

export const analyticsEvents = sqliteTable(
  "analytics_events",
  {
    id: text("id").primaryKey(),
    eventName: text("event_name").notNull(),
    anonymousId: text("anonymous_id").notNull(),
    sessionId: text("session_id").notNull(),
    orderId: text("order_id"),
    path: text("path").notNull(),
    propertiesJson: text("properties_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("analytics_events_name_created_idx").on(table.eventName, table.createdAt),
    index("analytics_events_session_idx").on(table.sessionId, table.createdAt),
  ],
);

export const bundles = sqliteTable(
  "bundles",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    eyebrow: text("eyebrow").notNull().default("Pametan paket"),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    isFeatured: integer("is_featured", { mode: "boolean" }).notNull().default(false),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [uniqueIndex("bundles_slug_unique").on(table.slug), index("bundles_active_sort_idx").on(table.isActive, table.sortOrder)],
);

export const bundleItems = sqliteTable(
  "bundle_items",
  {
    id: text("id").primaryKey(),
    bundleId: text("bundle_id").notNull().references(() => bundles.id),
    productId: text("product_id").notNull().references(() => products.id),
    quantity: integer("quantity").notNull(),
    purchaseType: text("purchase_type", { enum: ["one_time", "subscription"] }).notNull(),
    cadence: text("cadence", { enum: ["weekly", "biweekly"] }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("bundle_items_bundle_sort_idx").on(table.bundleId, table.sortOrder), check("bundle_items_quantity_positive", sql`${table.quantity} > 0`)],
);

export const abandonedCarts = sqliteTable(
  "abandoned_carts",
  {
    id: text("id").primaryKey(),
    email: text("email"),
    phone: text("phone"),
    itemsJson: text("items_json").notNull(),
    promoCode: text("promo_code"),
    emailConsent: integer("email_consent", { mode: "boolean" }).notNull().default(false),
    whatsappConsent: integer("whatsapp_consent", { mode: "boolean" }).notNull().default(false),
    status: text("status", { enum: ["saved", "converted", "opted_out"] }).notNull().default("saved"),
    recoveryQueuedAt: text("recovery_queued_at"),
    convertedOrderId: text("converted_order_id").references(() => orders.id),
    ...timestamps,
  },
  (table) => [index("abandoned_carts_status_updated_idx").on(table.status, table.updatedAt)],
);

export const orderConversionTokens = sqliteTable(
  "order_conversion_tokens",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull().references(() => orders.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("order_conversion_tokens_order_unique").on(table.orderId), uniqueIndex("order_conversion_tokens_hash_unique").on(table.tokenHash)],
);

export const webhookEvents = sqliteTable(
  "webhook_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    payloadJson: text("payload_json").notNull(),
    receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    processedAt: text("processed_at"),
  },
  (table) => [uniqueIndex("webhook_events_provider_id_unique").on(table.provider, table.providerEventId)],
);

export const fiscalReceipts = sqliteTable(
  "fiscal_receipts",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull().references(() => orders.id),
    operationKey: text("operation_key").notNull(),
    kind: text("kind", { enum: ["normal", "advance", "final", "refund"] }).notNull().default("normal"),
    status: text("status", { enum: ["pending", "issued", "failed", "skipped"] }).notNull().default("pending"),
    provider: text("provider").notNull().default("badi"),
    providerReference: text("provider_reference"),
    invoiceNumber: text("invoice_number"),
    pdfUrl: text("pdf_url"),
    attempts: integer("attempts").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    requestedAt: text("requested_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    issuedAt: text("issued_at"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("fiscal_receipts_operation_unique").on(table.operationKey),
    index("fiscal_receipts_order_idx").on(table.orderId),
    index("fiscal_receipts_status_idx").on(table.status, table.updatedAt),
  ],
);

// Append-only by application contract. No update/delete service is exposed.
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorType: text("actor_type", { enum: ["customer", "admin", "system"] }).notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("audit_log_entity_idx").on(table.entityType, table.entityId, table.createdAt)],
);

// Append-only event record; delivery state lives in status/attempt columns.
export const outbox = sqliteTable(
  "outbox",
  {
    id: text("id").primaryKey(),
    topic: text("topic").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    payloadJson: text("payload_json").notNull(),
    idempotencyKey: text("idempotency_key"),
    status: text("status", { enum: ["pending", "sent", "failed"] }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: text("available_at").notNull(),
    externalId: text("external_id"),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    sentAt: text("sent_at"),
  },
  (table) => [index("outbox_pending_idx").on(table.status, table.availableAt), uniqueIndex("outbox_idempotency_unique").on(table.idempotencyKey)],
);
