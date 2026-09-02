import { requireAdmin } from "../../../../../server/auth";
import { removeBundle, updateBundle } from "../../../../../server/bundles";
import { jsonResponse, readJson, withRoute } from "../../../../../server/domain";

export function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return withRoute(async () => {
    await requireAdmin(request);
    return jsonResponse({ bundle: await updateBundle((await context.params).id, await readJson(request)) });
  });
}

export function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return withRoute(async () => {
    await requireAdmin(request);
    return jsonResponse(await removeBundle((await context.params).id));
  });
}
