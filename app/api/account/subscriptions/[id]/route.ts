import { authenticateCustomer } from "../../../../../server/auth";
import { mutateSubscription } from "../../../../../server/commerce";
import { jsonResponse, readJson, withRoute } from "../../../../../server/domain";
import { processOutboxFor } from "../../../../../server/integration-jobs";

export function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return withRoute(async () => {
    const customer = await authenticateCustomer(request);
    const result = await mutateSubscription(customer.customerId, (await context.params).id, await readJson(request), request.headers.get("idempotency-key"));
    await processOutboxFor("subscription", result.subscriptionId);
    if (result.addonOrder && typeof result.addonOrder.id === "string") await processOutboxFor("order", result.addonOrder.id);
    return jsonResponse(result);
  });
}
