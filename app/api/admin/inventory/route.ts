import { requireAdmin } from '../../../../server/auth';
import { jsonResponse, readJson, withRoute } from '../../../../server/domain';
import { listInventory, receiveLot, replaceInventoryReservation } from '../../../../server/inventory';
export function GET(request: Request) { return withRoute(async()=>{await requireAdmin(request);return jsonResponse({lots:await listInventory()});}); }
export function POST(request: Request) { return withRoute(async()=>{await requireAdmin(request);const input=await readJson(request);return jsonResponse(input.action === "replace" ? await replaceInventoryReservation(input) : await receiveLot(input),201);}); }
