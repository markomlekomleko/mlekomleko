import { requireAdmin } from '../../../../server/auth';
import { jsonResponse, readJson, withRoute } from '../../../../server/domain';
import { listRefunds, refundPreview, requestRefund, reviewRefund } from '../../../../server/refunds';
export function GET(request: Request) { return withRoute(async()=>{await requireAdmin(request);const id=new URL(request.url).searchParams.get('orderId');return jsonResponse(id?await refundPreview(id):{refunds:await listRefunds()});}); }
export function POST(request: Request) { return withRoute(async()=>{await requireAdmin(request);const input=await readJson(request);return jsonResponse(input.action==='request'?await requestRefund(input):await reviewRefund(input));}); }
