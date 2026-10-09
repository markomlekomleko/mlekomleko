import { requireAdmin } from '../../../../server/auth';
import { jsonResponse, withRoute } from '../../../../server/domain';
import { all } from '../../../../server/sql';
export function GET(request:Request){return withRoute(async()=>{await requireAdmin(request);return jsonResponse({messages:await all('SELECT id,channel,recipient,subject,provider,status,last_error,created_at,updated_at FROM message_deliveries ORDER BY created_at DESC LIMIT 100')});});}
