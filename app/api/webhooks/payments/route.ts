import { env } from "@/server/runtime";
import { constantTimeEqual } from "../../../../server/crypto";
import { assertDomain, enumValue, jsonResponse, readJson, requiredString, withRoute } from "../../../../server/domain";
import { audit, enqueue } from "../../../../server/outbox";
import { batch, first } from "../../../../server/sql";
import { processOutboxFor } from "../../../../server/integration-jobs";
import { enforceRateLimit } from "../../../../server/rate-limit";
import { purchaseAnalyticsEvent } from "../../../../server/analytics";
import { activatePaidPackage } from "../../../../server/packages";
import { mutationGuard } from "../../../../server/mutation-guard";

export function POST(request: Request) {
  return withRoute(async () => {
    const configured = (env as unknown as { PAYMENT_WEBHOOK_SECRET?: string }).PAYMENT_WEBHOOK_SECRET;
    assertDomain(configured, "WEBHOOK_NOT_CONFIGURED", "PAYMENT_WEBHOOK_SECRET is required.", 503);
    const supplied = request.headers.get("x-webhook-secret") ?? "";
    assertDomain(await constantTimeEqual(supplied, configured), "INVALID_WEBHOOK_SIGNATURE", "Webhook signature is invalid.", 401);
    const runtime = env as unknown as Record<string, string | undefined>;
    assertDomain(["local", "test"].includes(runtime.APP_ENV ?? "") && runtime.PAYMENT_MODE === "mock", "PAYMENT_ADAPTER_NOT_CONNECTED", "Ovaj webhook je dostupan samo lokalnom simulatoru. Bankarski adapter još nije povezan.", 503);
    await enforceRateLimit(request, "payment-webhook", 120, 60);
    const body = await readJson(request);
    const eventId = requiredString(body.eventId, "eventId", 200);
    const orderId = requiredString(body.orderId, "orderId", 100);
    const status = enumValue(body.status, "status", ["paid", "failed", "refunded"] as const);
    const existing = await first<Record<string, unknown>>("SELECT id FROM webhook_events WHERE provider = 'local-mock' AND provider_event_id = ?", eventId);
    if (existing) return jsonResponse({ received: true, duplicate: true });
    const order = await first<Record<string, unknown>>("SELECT * FROM orders WHERE id = ?", orderId);
    assertDomain(order, "ORDER_NOT_FOUND", "Order was not found.", 404);
    const packageOrder = await first<Record<string, unknown>>("SELECT id FROM subscription_packages WHERE order_id = ?", orderId);
    assertDomain(!packageOrder || order.payment_status !== "paid" || status === "paid", "PACKAGE_PAYMENT_IMMUTABLE", "Za povraćaj uplaćenog paketa potrebna je zasebna refundacija sa fiskalnim dokumentom.", 409);
    const activation = status === "paid" && order.payment_status !== "paid" ? await activatePaidPackage(orderId) : null;
    const statements = [
      { sql: "INSERT INTO webhook_events (id, provider, provider_event_id, payload_json, processed_at) VALUES (?, 'local-mock', ?, ?, ?)", bindings: [crypto.randomUUID(), eventId, JSON.stringify(body), new Date().toISOString()] },
      { sql: "UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ?", bindings: [status, new Date().toISOString(), orderId] },
      audit("system", "payment-webhook", "payment.status_changed", "order", orderId, { paymentStatus: order.payment_status }, { paymentStatus: status }),
      enqueue("payment.status_changed", "order", orderId, { status, eventId }),
    ];
    if (activation) statements.push(...activation.statements);
    if (status === "paid" && order.payment_status !== "paid") {
      statements.push(enqueue("fiscal.receipt.requested", "order", orderId, { orderId, eventId }));
      statements.push(enqueue("email.receipt.requested", "order", orderId, { orderId }));
      statements.push(purchaseAnalyticsEvent(orderId, String(order.order_number ?? orderId), `webhook:${eventId}`));
    }
    const guard = mutationGuard("EXISTS (SELECT 1 FROM orders WHERE id = ? AND payment_status = ? AND updated_at = ?)", [orderId, String(order.payment_status), String(order.updated_at)]);
    await batch([guard.check, ...statements, guard.cleanup]);
    await processOutboxFor("order", orderId);
    return jsonResponse({ received: true, duplicate: false });
  });
}
