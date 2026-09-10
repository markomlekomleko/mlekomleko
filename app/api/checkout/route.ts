import { checkout } from "../../../server/commerce";
import { jsonResponse, readJson, rejectCardData, withRoute } from "../../../server/domain";
import { processOutboxFor } from "../../../server/integration-jobs";
import { enforceRateLimit } from "../../../server/rate-limit";

export function POST(request: Request) {
  return withRoute(async () => {
    const body = await readJson(request);
    rejectCardData(body);
    await enforceRateLimit(request, "checkout", 20, 10 * 60);
    const result = await checkout(body, request.headers.get("idempotency-key"));
    await processOutboxFor("order", result.body.order.id);
    if (result.body.subscription?.id) await processOutboxFor("subscription", result.body.subscription.id);
    return jsonResponse(result.body, result.status);
  });
}
