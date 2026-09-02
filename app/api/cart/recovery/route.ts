import { getRecoverableCart, optOutRecoverableCart, saveRecoverableCart } from "../../../../server/cart-recovery";
import { jsonResponse, readJson, withRoute } from "../../../../server/domain";

export function POST(request: Request) {
  return withRoute(async () => jsonResponse(await saveRecoverableCart(await readJson(request)), 201));
}

export function GET(request: Request) {
  return withRoute(async () => jsonResponse(await getRecoverableCart(new URL(request.url).searchParams.get("cartId"))));
}

export function DELETE(request: Request) {
  return withRoute(async () => jsonResponse(await optOutRecoverableCart(await readJson(request))));
}
