import { requireAdmin } from "../../../../../server/auth";
import { jsonResponse, readJson, withRoute } from "../../../../../server/domain";
import { removeProduct, updateProduct } from "../../../../../server/products";

export function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return withRoute(async () => { await requireAdmin(request); return jsonResponse({ product: await updateProduct((await context.params).id, await readJson(request)) }); }); }

export function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return withRoute(async () => {
    await requireAdmin(request);
    return jsonResponse(await removeProduct((await context.params).id));
  });
}
