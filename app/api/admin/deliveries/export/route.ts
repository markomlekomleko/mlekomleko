import { requireAdmin } from "../../../../../server/auth";
import { spokeCsv } from "../../../../../server/deliveries";
import { assertDomain, withRoute } from "../../../../../server/domain";

export function GET(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    const date = new URL(request.url).searchParams.get("date");
    assertDomain(date, "VALIDATION_ERROR", "date query parameter is required.", 422);
    return new Response(await spokeCsv(date), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="spoke-${date}.csv"`, "cache-control": "no-store" } });
  });
}
