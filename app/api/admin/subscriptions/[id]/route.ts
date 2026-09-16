import { requireAdmin, assertSameOrigin } from "@/server/auth";
import { adminSubscription } from "@/server/admin-workspace";
import { jsonResponse, readJson, withRoute } from "@/server/domain";
export function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withRoute(async () => {
    await requireAdmin(request);
    assertSameOrigin(request);
    return jsonResponse(
      await adminSubscription(
        (await context.params).id,
        await readJson(request),
        request.headers.get("idempotency-key"),
      ),
    );
  });
}
