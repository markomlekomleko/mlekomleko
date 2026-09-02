import { requireAdmin } from "../../../../../server/auth";
import { deliveryXlsx, spokeCsv } from "../../../../../server/deliveries";
import { assertDomain, withRoute } from "../../../../../server/domain";

export function GET(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    const date = new URL(request.url).searchParams.get("date");
    assertDomain(date, "VALIDATION_ERROR", "date query parameter is required.", 422);
    if (new URL(request.url).searchParams.get("format") === "xlsx") {
      const workbook = await deliveryXlsx(date);
      const body = workbook.buffer.slice(workbook.byteOffset, workbook.byteOffset + workbook.byteLength) as ArrayBuffer;
      return new Response(body, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="dostave-${date}.xlsx"`, "cache-control": "no-store" } });
    }
    return new Response(await spokeCsv(date), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="spoke-${date}.csv"`, "cache-control": "no-store" } });
  });
}
