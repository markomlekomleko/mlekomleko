import { dashboard } from "../../../../server/admin";
import { requireAdmin } from "../../../../server/auth";
import { jsonResponse, withRoute } from "../../../../server/domain";

export function GET(request: Request) { return withRoute(async () => { await requireAdmin(request); return jsonResponse(await dashboard()); }); }
