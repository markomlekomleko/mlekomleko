import { requireAdmin } from "@/server/auth";
import { deliveryCalendar } from "@/server/admin-workspace";
import { jsonResponse, withRoute } from "@/server/domain";
export function GET(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    return jsonResponse(
      await deliveryCalendar(new URL(request.url).searchParams),
    );
  });
}
