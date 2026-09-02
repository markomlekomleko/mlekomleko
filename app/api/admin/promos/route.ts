import { createPromoCode, listPromoCodes } from "../../../../server/admin";
import { requireAdmin } from "../../../../server/auth";
import { jsonResponse, readJson, withRoute } from "../../../../server/domain";

export function GET(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    return jsonResponse({ promos: await listPromoCodes() });
  });
}

export function POST(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    return jsonResponse({ promo: await createPromoCode(await readJson(request)) }, 201);
  });
}
