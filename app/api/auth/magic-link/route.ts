import { issueMagicLink } from "../../../../server/auth";
import { jsonResponse, readJson, withRoute } from "../../../../server/domain";

export function POST(request: Request) {
  return withRoute(async () => {
    const body = await readJson(request);
    return jsonResponse(await issueMagicLink(body.email, request), 202);
  });
}
