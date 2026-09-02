import { removePromoCode, updatePromoCode } from "../../../../../server/admin";
import { requireAdmin } from "../../../../../server/auth";
import { jsonResponse, readJson, withRoute } from "../../../../../server/domain";

export function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return withRoute(async () => {
    await requireAdmin(request);
    return jsonResponse({ promo: await updatePromoCode((await context.params).id, await readJson(request)) });
  });
}

export function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return withRoute(async () => {
    await requireAdmin(request);
    return jsonResponse(await removePromoCode((await context.params).id));
  });
}
