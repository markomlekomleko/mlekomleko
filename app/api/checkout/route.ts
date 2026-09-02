import { checkout } from "../../../server/commerce";
import { jsonResponse, readJson, withRoute } from "../../../server/domain";
import { processOutboxFor } from "../../../server/integration-jobs";

export function POST(request: Request) {
  return withRoute(async () => {
    const result = await checkout(await readJson(request), request.headers.get("idempotency-key"));
    await processOutboxFor("order", result.body.order.id);
    if (result.body.subscription?.id) await processOutboxFor("subscription", result.body.subscription.id);
    return jsonResponse(result.body, result.status);
  });
}
