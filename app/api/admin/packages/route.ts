import { requireAdmin } from "@/server/auth";
import { jsonResponse, withRoute } from "@/server/domain";
import { packageProgress } from "@/server/packages";
export function GET(request: Request) { return withRoute(async () => { await requireAdmin(request); return jsonResponse({lines: await packageProgress()}); }); }
