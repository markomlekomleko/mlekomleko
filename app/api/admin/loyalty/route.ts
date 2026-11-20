import { requireAdmin } from "../../../../server/auth";
import { jsonResponse, withRoute } from "../../../../server/domain";
import { adminLoyaltyOverview } from "../../../../server/loyalty";

/** Loyalty program overview: realized deliveries toward 12 and rewards per customer (read-only). */
export function GET(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    return jsonResponse(await adminLoyaltyOverview());
  });
}
