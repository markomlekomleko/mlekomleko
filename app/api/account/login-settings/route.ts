import { getLoginSettings, updateLoginSettings } from "@/server/customer-login";
import { jsonResponse, readJson, withRoute } from "@/server/domain";

export function GET(request: Request) {
  return withRoute(async () => jsonResponse(await getLoginSettings(request)));
}

export function PATCH(request: Request) {
  return withRoute(async () => jsonResponse(await updateLoginSettings(request, await readJson(request))));
}
