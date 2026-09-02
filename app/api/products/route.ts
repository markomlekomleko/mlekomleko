import { jsonResponse, withRoute } from "../../../server/domain";
import { listProducts } from "../../../server/products";

export function GET() {
  return withRoute(async () => jsonResponse({ products: await listProducts() }));
}
