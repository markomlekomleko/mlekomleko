import { readSettings, updateSettings } from "../../../../server/admin";
import { requireAdmin } from "../../../../server/auth";
import { jsonResponse, readJson, withRoute } from "../../../../server/domain";

export function GET(request: Request) { return withRoute(async () => { await requireAdmin(request); return jsonResponse({ settings: await readSettings() }); }); }
export function PATCH(request: Request) { return withRoute(async () => { await requireAdmin(request); return jsonResponse({ settings: await updateSettings(await readJson(request)) }); }); }
