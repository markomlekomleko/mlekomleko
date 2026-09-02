import { requireAdmin } from "../../../../server/auth";
import { generateDelivery, lockDelivery } from "../../../../server/deliveries";
import { enumValue, jsonResponse, readJson, withRoute } from "../../../../server/domain";

// Local cron/job entrypoint. Uses the same local admin secret until a dedicated job secret is configured.
export function POST(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    const body = await readJson(request);
    const action = enumValue(body.action, "action", ["generate", "lock"] as const);
    const key = request.headers.get("idempotency-key");
    return jsonResponse(action === "generate" ? await generateDelivery(body.date, key) : await lockDelivery(body.date, key, false));
  });
}
