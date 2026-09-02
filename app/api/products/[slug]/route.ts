import { jsonResponse, withRoute } from "../../../../server/domain";
import { getProduct } from "../../../../server/products";

export function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  return withRoute(async () => jsonResponse({ product: await getProduct(decodeURIComponent((await context.params).slug)) }));
}
