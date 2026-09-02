import { requireAdmin } from "../../../../server/auth";
import { integrationOperationsStatus, processOutbox, queueDeliveryReminders, retryFailedOutbox } from "../../../../server/integration-jobs";
import { assertDomain, jsonResponse, readJson, withRoute } from "../../../../server/domain";

export function GET(request: Request) {
  return withRoute(async () => { await requireAdmin(request); return jsonResponse(await integrationOperationsStatus()); });
}

export function POST(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    const input = await readJson(request);
    const action = input.action;
    if (action === "process") return jsonResponse(await processOutbox(Number(input.limit ?? 50)));
    if (action === "retry_failed") return jsonResponse(await retryFailedOutbox());
    if (action === "delivery_reminders") return jsonResponse(await queueDeliveryReminders(input.date));
    assertDomain(false, "VALIDATION_ERROR", "action must be process, retry_failed, or delivery_reminders.", 422);
  });
}
