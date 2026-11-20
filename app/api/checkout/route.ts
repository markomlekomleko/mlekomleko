import { checkout } from "../../../server/commerce";
import { jsonResponse, readJson, rejectCardData, withRoute } from "../../../server/domain";
import { processOutboxFor } from "../../../server/integration-jobs";
import { enforceRateLimit } from "../../../server/rate-limit";
import { assertNotDemoCheckout, assertSameOrigin, authenticateCustomer } from "@/server/auth";

export function POST(request: Request) {
  return withRoute(async () => {
    await assertNotDemoCheckout(request);
    const body = await readJson(request);
    rejectCardData(body);
    await enforceRateLimit(request, "checkout", 20, 10 * 60);
    // Using a loyalty reward is a cookie-authenticated write: same-origin and the owner's session.
    let session = null;
    if (body.loyaltyRewardId) { assertSameOrigin(request); session = await authenticateCustomer(request); }
    const result = await checkout(body, request.headers.get("idempotency-key"), undefined, session);
    await processOutboxFor("order", result.body.order.id);
    if (result.body.subscription?.id) await processOutboxFor("subscription", result.body.subscription.id);
    return jsonResponse(result.body, result.status);
  });
}
