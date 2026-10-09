import { requireAdmin, assertSameOrigin } from "../../../../server/auth";
import { jsonResponse, readJson, withRoute } from "../../../../server/domain";
import { listContentPages, saveContentPage } from "../../../../server/content-pages";
export function GET(request: Request) {
  return withRoute(async () => { await requireAdmin(request); return jsonResponse({ pages: await listContentPages() }); });
}
export function POST(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request); assertSameOrigin(request);
    return jsonResponse({ page: await saveContentPage(await readJson(request)) });
  });
}
