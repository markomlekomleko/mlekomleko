import { requireAdmin } from "../../../../server/auth";
import { createBundle, listBundles } from "../../../../server/bundles";
import { jsonResponse, readJson, withRoute } from "../../../../server/domain";

export function GET(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    return jsonResponse({ bundles: await listBundles(true) });
  });
}

export function POST(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    return jsonResponse({ bundle: await createBundle(await readJson(request)) }, 201);
  });
}
