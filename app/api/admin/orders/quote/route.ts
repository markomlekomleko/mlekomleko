import { requireAdmin, assertSameOrigin } from "@/server/auth";
import { manualOptions, quoteCart } from "@/server/admin-workspace";
import { jsonResponse, readJson, withRoute } from "@/server/domain";
export function GET(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    return jsonResponse(await manualOptions());
  });
}
export function POST(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    assertSameOrigin(request);
    return jsonResponse(await quoteCart(await readJson(request)));
  });
}
