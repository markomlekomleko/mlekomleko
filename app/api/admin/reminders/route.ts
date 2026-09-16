import { requireAdmin, assertSameOrigin } from "@/server/auth";
import { reminderPreview, sendAdminReminders } from "@/server/admin-workspace";
import {
  jsonResponse,
  readJson,
  requiredString,
  withRoute,
} from "@/server/domain";
export function GET(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    return jsonResponse(
      await reminderPreview(
        requiredString(
          new URL(request.url).searchParams.get("date"),
          "date",
          10,
        ),
      ),
    );
  });
}
export function POST(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    assertSameOrigin(request);
    return jsonResponse(
      await sendAdminReminders(
        requiredString((await readJson(request)).date, "date", 10),
      ),
    );
  });
}
