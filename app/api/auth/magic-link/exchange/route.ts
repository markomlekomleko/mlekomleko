import { exchangeMagicLink, sessionCookie } from "../../../../../server/auth";
import { jsonResponse, readJson, requiredString, withRoute } from "../../../../../server/domain";
import { enforceRateLimit } from "../../../../../server/rate-limit";

export function POST(request: Request) {
  return withRoute(async () => {
    await enforceRateLimit(request, "magic-link-exchange", 10, 15 * 60);
    const body = await readJson(request);
    const auth = await exchangeMagicLink(requiredString(body.token, "token", 200));
    return jsonResponse(
      { authenticated: true, expiresAt: auth.sessionExpiresAt },
      200,
      { "set-cookie": sessionCookie(request, auth.sessionToken, auth.sessionExpiresAt) },
    );
  });
}
