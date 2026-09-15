import { convertOrderToSubscription } from "../../../../server/commerce";
import { jsonResponse, readJson, withRoute } from "../../../../server/domain";

import { processOutboxFor } from "../../../../server/integration-jobs";

export function POST(request: Request) {
  return withRoute(async () => {
    const result = await convertOrderToSubscription(await readJson(request));
    await processOutboxFor("subscription", result.subscription.id);
    return jsonResponse(result, 201);
  });
}
