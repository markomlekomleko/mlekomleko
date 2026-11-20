import { assertSameOrigin, authenticateCustomer } from "@/server/auth";
import { DEMO_CUSTOMER_ID } from "@/server/demo-identity";
import { getDemoAccount } from "@/server/demo-account";
import { enumValue, jsonResponse, readJson, withRoute } from "@/server/domain";
import { applyReward, claimReward, getLoyalty } from "@/server/loyalty";

export function GET(request: Request) {
  return withRoute(async () => {
    const auth = await authenticateCustomer(request);
    if (auth.customerId === DEMO_CUSTOMER_ID) return jsonResponse(getDemoAccount().loyalty);
    return jsonResponse(await getLoyalty(auth.customerId));
  });
}

/** { action: "claim" | "apply", rewardId, subscriptionId? } — always for the signed-in account only. */
export function POST(request: Request) {
  return withRoute(async () => {
    assertSameOrigin(request);
    const auth = await authenticateCustomer(request);
    const input = await readJson(request);
    const action = enumValue(input.action, "action", ["claim", "apply"] as const);
    const result = action === "claim" ? await claimReward(auth.customerId, input.rewardId) : await applyReward(auth.customerId, input.rewardId, input.subscriptionId);
    return jsonResponse({ ...result, loyalty: await getLoyalty(auth.customerId) });
  });
}
