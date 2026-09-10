import { assertSameOrigin, expiredSessionCookies, revokeSession, sessionTokenFromRequest } from "../../../../server/auth";
import { jsonResponse, withRoute } from "../../../../server/domain";

export function POST(request: Request) {
  return withRoute(async () => {
    assertSameOrigin(request);
    await revokeSession(sessionTokenFromRequest(request));
    const headers = new Headers();
    for (const cookie of expiredSessionCookies()) headers.append("set-cookie", cookie);
    return jsonResponse({ loggedOut: true }, 200, headers);
  });
}
