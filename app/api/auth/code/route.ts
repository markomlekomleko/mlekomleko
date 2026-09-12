import { loginOptions, requestLoginCode } from "@/server/customer-login";
import { jsonResponse, readJson, withRoute } from "@/server/domain";

export function GET(request: Request) {
  return jsonResponse(loginOptions(request));
}

export function POST(request: Request) {
  return withRoute(async () => jsonResponse(await requestLoginCode(request, await readJson(request)), 202));
}
