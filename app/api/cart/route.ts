import { quoteCart } from "../../../server/commerce";
import { authenticateCustomer } from "../../../server/auth";
import { jsonResponse, readJson, withRoute } from "../../../server/domain";
import { checkoutReward } from "../../../server/loyalty";

export function POST(request: Request) {
  return withRoute(async () => {
    const input = await readJson(request);
    // A loyalty reward is shown only for the signed-in owner; anyone else gets AUTH_REQUIRED / not found.
    const reward = input.loyaltyRewardId ? await checkoutReward(input.loyaltyRewardId, await authenticateCustomer(request)) : null;
    return jsonResponse(await quoteCart(input, reward));
  });
}
