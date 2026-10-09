import { requireAdmin } from '../../../../server/auth';
import { jsonResponse, readJson, withRoute } from '../../../../server/domain';
import { listStaff, saveStaff } from '../../../../server/staff';
export function GET(request: Request) { return withRoute(async()=>{await requireAdmin(request);return jsonResponse({staff:await listStaff()});}); }
export function POST(request: Request) { return withRoute(async()=>{await requireAdmin(request);return jsonResponse({staff:await saveStaff(await readJson(request))});}); }
