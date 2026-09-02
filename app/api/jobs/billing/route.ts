import { requireAdmin } from "../../../../server/auth";
import { generateMonthlyBilling } from "../../../../server/billing";
import { jsonResponse, readJson, withRoute } from "../../../../server/domain";
import { processOutbox } from "../../../../server/integration-jobs";

export function POST(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    const body = await readJson(request);
    const result = await generateMonthlyBilling(body.month, request.headers.get("idempotency-key"));
    await processOutbox(100);
    return jsonResponse(result);
  });
}
