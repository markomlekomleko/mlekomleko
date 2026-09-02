import { requireAdmin } from "../../../../server/auth";
import { jsonResponse, readJson, withRoute } from "../../../../server/domain";
import { createProduct, listProducts } from "../../../../server/products";

export function GET(request: Request) { return withRoute(async () => { await requireAdmin(request); return jsonResponse({ products: await listProducts(true) }); }); }
export function POST(request: Request) { return withRoute(async () => { await requireAdmin(request); return jsonResponse({ product: await createProduct(await readJson(request)) }, 201); }); }
