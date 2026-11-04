import { requireAdmin } from '../../../../server/auth';
import { jsonResponse, readJson, withRoute } from '../../../../server/domain';
import { listRefunds, refundPreview, requestRefund, reviewRefund } from '../../../../server/refunds';
import { processOutboxFor } from '../../../../server/integration-jobs';
export function GET(request: Request) { return withRoute(async()=>{await requireAdmin(request);const id=new URL(request.url).searchParams.get('orderId');return jsonResponse(id?await refundPreview(id):{refunds:await listRefunds()});}); }
export function POST(request: Request) { return withRoute(async()=>{await requireAdmin(request);const input=await readJson(request);const result=input.action==='request'?await requestRefund(input):await reviewRefund(input);if(input.action==='execute'&&result?.order_id)await processOutboxFor('order',String(result.order_id));return jsonResponse(result);}); }
