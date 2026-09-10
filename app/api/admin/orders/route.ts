import { listOrders, updateOrder } from "../../../../server/admin";
import { requireAdmin } from "../../../../server/auth";
import { jsonResponse, readJson, withRoute } from "../../../../server/domain";
import { processOutboxFor } from "../../../../server/integration-jobs";

export function GET(request: Request) { return withRoute(async () => { await requireAdmin(request); return jsonResponse(await listOrders(new URL(request.url).searchParams)); }); }
export function PATCH(request: Request) { return withRoute(async () => { await requireAdmin(request); const order = await updateOrder(await readJson(request)); await processOutboxFor("order", String(order?.id)); return jsonResponse({ order }); }); }
