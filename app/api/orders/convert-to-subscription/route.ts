import { convertOrderToSubscription } from "../../../../server/commerce";
import { jsonResponse, readJson, withRoute } from "../../../../server/domain";

export function POST(request: Request) {
  return withRoute(async () => jsonResponse(await convertOrderToSubscription(await readJson(request)), 201));
}
