import { completeDeliveryOrder } from "@/server/delivery-completion";
import { processOutboxFor } from "@/server/integration-jobs";
import { requireAdmin } from "../../../../server/auth";
import { generateDelivery, getDelivery, listDeliveries, lockDelivery } from "../../../../server/deliveries";
import { enumValue, jsonResponse, readJson, withRoute } from "../../../../server/domain";

export function GET(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    const date = new URL(request.url).searchParams.get("date");
    return jsonResponse(date ? await getDelivery(date) : { deliveries: await listDeliveries() });
  });
}

export function POST(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    const body = await readJson(request);
    const action = enumValue(body.action, "action", ["generate", "lock", "complete"] as const);
    if (action === "complete") {
      const result = await completeDeliveryOrder(body);
      for (const orderId of result.orderIds ?? []) await processOutboxFor("order", orderId);
      return jsonResponse(result);
    }
    const result = action === "generate"
      ? await generateDelivery(body.date, request.headers.get("idempotency-key"))
      : await lockDelivery(body.date, request.headers.get("idempotency-key"), body.force === true);
    return jsonResponse(result);
  });
}
