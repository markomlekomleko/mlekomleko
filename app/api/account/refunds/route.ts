import { authenticateCustomer, assertSameOrigin } from '../../../../server/auth';
import { jsonResponse, readJson, withRoute } from '../../../../server/domain';
import { refundPreview, requestRefund } from '../../../../server/refunds';
export function POST(request: Request) { return withRoute(async()=>{assertSameOrigin(request);const auth=await authenticateCustomer(request);return jsonResponse(await requestRefund(await readJson(request),auth.customerId),201);}); }

export function GET(request:Request){return withRoute(async()=>{const auth=await authenticateCustomer(request);const preview=await refundPreview(new URL(request.url).searchParams.get("orderId")??"",auth.customerId);return jsonResponse({order:{id:preview.order.id},amountMinor:preview.amountMinor,lines:preview.lines});});}
