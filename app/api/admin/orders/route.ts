import { listOrders, updateOrder } from "../../../../server/admin";
import { requireAdmin } from "../../../../server/auth";
import { jsonResponse, readJson, withRoute } from "../../../../server/domain";

export function GET(request: Request) { return withRoute(async () => { await requireAdmin(request); return jsonResponse({ orders: await listOrders(new URL(request.url).searchParams.get("date")) }); }); }
export function PATCH(request: Request) { return withRoute(async () => { await requireAdmin(request); return jsonResponse({ order: await updateOrder(await readJson(request)) }); }); }
