export const PAYMENT_STATUSES = Object.freeze([
  "created",
  "requires_customer_action",
  "authorized",
  "captured",
  "failed",
  "cancelled",
  "refunded",
]);

export const FISCAL_RECEIPT_STATUSES = Object.freeze([
  "pending",
  "issued",
  "failed",
  "refunded",
]);

export const NOTIFICATION_EVENTS = Object.freeze([
  "order.created",
  "subscription.activated",
  "subscription.changed",
  "delivery.skipped",
  "subscription.paused",
  "subscription.resumed",
  "subscription.cancelled",
  "delivery.reminder",
  "payment.succeeded",
  "payment.failed",
  "receipt.issued",
]);

export const ANALYTICS_EVENTS = Object.freeze([
  "view_item",
  "add_to_cart",
  "begin_checkout",
  "purchase",
  "subscription_activated",
  "subscription_frequency_selected",
  "apply_promotion",
  "subscription_paused",
  "subscription_cancelled",
]);

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
}

function assertPositiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive safe integer.`);
  }
}

/**
 * Canonical request passed to an OTP or RaiAccept adapter.
 * `amountMinor` is always an integer; raw card data is intentionally rejected.
 */
export function assertPaymentChargeRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new TypeError("Payment request must be an object.");
  }
  assertNonEmptyString(request.operationId, "operationId");
  assertNonEmptyString(request.orderId, "orderId");
  assertPositiveInteger(request.amountMinor, "amountMinor");
  if (request.currency !== "RSD") {
    throw new TypeError("currency must be RSD for the local MVP.");
  }
  if (request.kind === "recurring") {
    assertNonEmptyString(request.paymentMethodToken, "paymentMethodToken");
  } else if (request.kind !== "one_time") {
    throw new TypeError("kind must be one_time or recurring.");
  }

  const forbidden = [
    "cardNumber",
    "pan",
    "cvv",
    "cvc",
    "expiry",
    "expirationDate",
  ];
  const found = forbidden.find((field) => request[field] != null);
  if (found) {
    throw new TypeError(
      `${found} must never enter the application; use a provider token instead.`,
    );
  }
  return request;
}

/**
 * Canonical outbox record. Delivery adapters consume this asynchronously and
 * must use `idempotencyKey` as their provider-side deduplication key when the
 * provider supports one.
 */
export function assertOutboxMessage(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new TypeError("Outbox message must be an object.");
  }
  assertNonEmptyString(message.idempotencyKey, "idempotencyKey");
  assertNonEmptyString(message.aggregateId, "aggregateId");
  if (!NOTIFICATION_EVENTS.includes(message.eventType)) {
    throw new TypeError(`Unsupported eventType: ${message.eventType}.`);
  }
  if (!["email", "whatsapp"].includes(message.channel)) {
    throw new TypeError("channel must be email or whatsapp.");
  }
  if (!message.payload || typeof message.payload !== "object") {
    throw new TypeError("payload must be an object.");
  }
  return message;
}

/** Provider-neutral response stored beside every external side effect. */
export function integrationResult({
  provider,
  externalId,
  status,
  idempotencyKey,
  occurredAt,
  metadata = {},
}) {
  assertNonEmptyString(provider, "provider");
  assertNonEmptyString(externalId, "externalId");
  assertNonEmptyString(status, "status");
  assertNonEmptyString(idempotencyKey, "idempotencyKey");
  assertNonEmptyString(occurredAt, "occurredAt");
  return Object.freeze({
    provider,
    externalId,
    status,
    idempotencyKey,
    occurredAt,
    metadata: Object.freeze({ ...metadata }),
  });
}
