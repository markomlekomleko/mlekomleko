import { requireAdmin, assertSameOrigin } from "@/server/auth";
import { bulkCashPayment } from "@/server/bulk-actions";
import { jsonResponse, readJson, withRoute } from "@/server/domain";
export const runtime = "nodejs";
export const maxDuration = 300;

export function POST(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    assertSameOrigin(request);
    return jsonResponse(await bulkCashPayment(await readJson(request), request.headers.get("idempotency-key")));
  });
}
