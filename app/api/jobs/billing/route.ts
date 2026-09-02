import { requireAdmin } from "../../../../server/auth";
import { generateMonthlyBilling } from "../../../../server/billing";
import { jsonResponse, readJson, withRoute } from "../../../../server/domain";

export function POST(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    const body = await readJson(request);
    return jsonResponse(await generateMonthlyBilling(body.month, request.headers.get("idempotency-key")));
  });
}
