import { requireAdmin } from "../../../../server/auth";
import { jsonResponse, withRoute } from "../../../../server/domain";
import { env } from "../../../../server/runtime";
import { commerceReadiness } from "../../../../integrations/commerce-readiness.mjs";

export function GET(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    return jsonResponse(commerceReadiness(env));
  });
}
