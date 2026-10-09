import { requireAdmin } from "@/server/auth";
import { jsonResponse, withRoute } from "@/server/domain";
import { orderDetail } from "@/server/order-detail";
export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withRoute(async () => {
    await requireAdmin(request);
    return jsonResponse(await orderDetail((await context.params).id));
  });
}
