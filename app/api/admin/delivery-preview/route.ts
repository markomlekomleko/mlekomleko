import { requireAdmin } from "@/server/auth";
import { adminDelivery } from "@/server/admin-workspace";
import { jsonResponse, requiredString, withRoute } from "@/server/domain";
export function GET(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    return jsonResponse(
      await adminDelivery(
        requiredString(
          new URL(request.url).searchParams.get("date"),
          "date",
          10,
        ),
      ),
    );
  });
}
