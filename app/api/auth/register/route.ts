import { registerCustomer } from "@/server/customer-login";
import { jsonResponse, readJson, withRoute } from "@/server/domain";

export function POST(request: Request) {
  return withRoute(async () => jsonResponse(await registerCustomer(request, await readJson(request)), 202));
}
