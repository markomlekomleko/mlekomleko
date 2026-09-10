import { env } from "@/server/runtime";
import { constantTimeEqual } from "../../../../server/crypto";
import { assertDomain, enumValue, jsonResponse, readJson, requiredString, withRoute } from "../../../../server/domain";
import { audit, enqueue } from "../../../../server/outbox";
import { batch, first } from "../../../../server/sql";
import { processOutboxFor } from "../../../../server/integration-jobs";
import { enforceRateLimit } from "../../../../server/rate-limit";
import { purchaseAnalyticsEvent } from "../../../../server/analytics";

export function POST(request: Request) {
  return withRoute(async () => {
    const configured = (env as unknown as { PAYMENT_WEBHOOK_SECRET?: string }).PAYMENT_WEBHOOK_SECRET;
    assertDomain(configured, "WEBHOOK_NOT_CONFIGURED", "PAYMENT_WEBHOOK_SECRET is required.", 503);
    const supplied = request.headers.get("x-webhook-secret") ?? "";
    assertDomain(await constantTimeEqual(supplied, configured), "INVALID_WEBHOOK_SIGNATURE", "Webhook signature is invalid.", 401);
    await enforceRateLimit(request, "payment-webhook", 120, 60);
    const body = await readJson(request);
    const eventId = requiredString(body.eventId, "eventId", 200);
    const orderId = requiredString(body.orderId, "orderId", 100);
    const status = enumValue(body.status, "status", ["paid", "failed", "refunded"] as const);
    const existing = await first<Record<string, unknown>>("SELECT id FROM webhook_events WHERE provider = 'local-mock' AND provider_event_id = ?", eventId);
    if (existing) return jsonResponse({ received: true, duplicate: true });
    const order = await first<Record<string, unknown>>("SELECT * FROM orders WHERE id = ?", orderId);
    assertDomain(order, "ORDER_NOT_FOUND", "Order was not found.", 404);
    const statements = [
      { sql: "INSERT INTO webhook_events (id, provider, provider_event_id, payload_json, processed_at) VALUES (?, 'local-mock', ?, ?, ?)", bindings: [crypto.randomUUID(), eventId, JSON.stringify(body), new Date().toISOString()] },
      { sql: "UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ?", bindings: [status, new Date().toISOString(), orderId] },
      audit("system", "payment-webhook", "payment.status_changed", "order", orderId, { paymentStatus: order.payment_status }, { paymentStatus: status }),
      enqueue("payment.status_changed", "order", orderId, { status, eventId }),
    ];
    if (status === "paid" && order.payment_status !== "paid") {
      statements.push(enqueue("fiscal.receipt.requested", "order", orderId, { orderId, eventId }));
      statements.push(enqueue("email.receipt.requested", "order", orderId, { orderId }));
      statements.push(purchaseAnalyticsEvent(orderId, String(order.order_number ?? orderId), `webhook:${eventId}`));
    }
    await batch(statements);
    await processOutboxFor("order", orderId);
    return jsonResponse({ received: true, duplicate: false });
  });
}
