import { authenticateCustomer } from "../../../../../server/auth";
import { mutateSubscription } from "../../../../../server/commerce";
import { jsonResponse, readJson, withRoute } from "../../../../../server/domain";

export function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return withRoute(async () => {
    const customer = await authenticateCustomer(request);
    return jsonResponse(await mutateSubscription(customer.customerId, (await context.params).id, await readJson(request)));
  });
}
