import { checkout } from "../../../server/commerce";
import { jsonResponse, readJson, withRoute } from "../../../server/domain";

export function POST(request: Request) {
  return withRoute(async () => {
    const result = await checkout(await readJson(request), request.headers.get("idempotency-key"));
    return jsonResponse(result.body, result.status);
  });
}
