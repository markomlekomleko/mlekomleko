import { issueMagicLink } from "../../../../server/auth";
import { jsonResponse, readJson, withRoute } from "../../../../server/domain";
import { enforceRateLimit } from "../../../../server/rate-limit";

export function POST(request: Request) {
  return withRoute(async () => {
    const body = await readJson(request);
    await enforceRateLimit(request, "magic-link-ip", 5, 15 * 60);
    await enforceRateLimit(request, "magic-link-email", 3, 15 * 60, String(body.email ?? ""));
    return jsonResponse(await issueMagicLink(body.email, request), 202);
  });
}
