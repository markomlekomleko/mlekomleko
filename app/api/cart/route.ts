import { assertMinimumLitres, quoteCart } from "../../../server/commerce";
import { authenticateCustomer } from "../../../server/auth";
import { jsonResponse, readJson, withRoute } from "../../../server/domain";
import { checkoutReward } from "../../../server/loyalty";
import { getBusinessSettings } from "../../../server/settings";

export function POST(request: Request) {
  return withRoute(async () => {
    const input = await readJson(request);
    // A loyalty reward is shown only for the signed-in owner; anyone else gets AUTH_REQUIRED / not found.
    const reward = input.loyaltyRewardId ? await checkoutReward(input.loyaltyRewardId, await authenticateCustomer(request)) : null;
    const quote = await quoteCart(input, reward);
    const minimumLitres = Number((await getBusinessSettings()).minimumLitres) || 0;
    for (const line of quote.lines) assertMinimumLitres(line.unitLabel, line.quantity, minimumLitres);
    return jsonResponse(quote);
  });
}
