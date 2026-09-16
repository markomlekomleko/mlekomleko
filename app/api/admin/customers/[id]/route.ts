import { requireAdmin, assertSameOrigin } from "@/server/auth";
import { adminCustomer, updateAdminCustomer } from "@/server/admin-workspace";
import { jsonResponse, readJson, withRoute } from "@/server/domain";
type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) {
  return withRoute(async () => {
    await requireAdmin(request);
    return jsonResponse(await adminCustomer((await context.params).id));
  });
}
export function PATCH(request: Request, context: Context) {
  return withRoute(async () => {
    await requireAdmin(request);
    assertSameOrigin(request);
    return jsonResponse(
      await updateAdminCustomer(
        (await context.params).id,
        await readJson(request),
      ),
    );
  });
}
