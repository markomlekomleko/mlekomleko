import { requireAdmin } from '../../../../server/auth';
import { jsonResponse, readJson, withRoute } from '../../../../server/domain';
import { legacyOrders, legacyPreview, reconcileLegacy } from '../../../../server/legacy-reconciliation';
export function GET(request:Request){return withRoute(async()=>{await requireAdmin(request);const id=new URL(request.url).searchParams.get('orderId');return jsonResponse(id?await legacyPreview(id):{orders:await legacyOrders()});});}
export function POST(request:Request){return withRoute(async()=>{await requireAdmin(request);return jsonResponse(await reconcileLegacy(await readJson(request)));});}
