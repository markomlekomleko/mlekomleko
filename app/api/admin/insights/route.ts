import { requireAdmin } from "@/server/auth";
import { insights } from "@/server/admin-workspace";
import { jsonResponse, withRoute } from "@/server/domain";
export function GET(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    return jsonResponse(await insights(new URL(request.url).searchParams));
  });
}
