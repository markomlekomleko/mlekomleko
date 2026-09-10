import { requireAdmin } from "@/server/auth";
import { enumValue, withRoute } from "@/server/domain";
import { orderConfirmation } from "@/server/order-export";

export function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return withRoute(async () => {
    await requireAdmin(request);
    const { id } = await context.params;
    const format = enumValue(new URL(request.url).searchParams.get("format") ?? "xlsx", "format", ["csv", "xlsx"] as const);
    const content = await orderConfirmation(id, format);
    const body = typeof content === "string" ? content : content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer;
    return new Response(body, { headers: {
      "content-type": format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="potvrda-${encodeURIComponent(id)}.${format}"`,
      "cache-control": "no-store",
    } });
  });
}
