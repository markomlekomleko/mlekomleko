import { requireAdmin } from '../../../../server/auth';
import { jsonResponse, readJson, withRoute } from '../../../../server/domain';
import { listPaymentAttempts, paymentAction } from '../../../../server/payment-attempts';
export function GET(request:Request){return withRoute(async()=>{await requireAdmin(request);return jsonResponse({attempts:await listPaymentAttempts()});});}
export function POST(request:Request){return withRoute(async()=>{await requireAdmin(request);return jsonResponse(await paymentAction(await readJson(request)));});}
