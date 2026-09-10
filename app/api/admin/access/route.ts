import { adminAccess } from "../../../../server/auth";
import { jsonResponse, withRoute } from "../../../../server/domain";

export function GET(request: Request) {
  return withRoute(async () => jsonResponse(await adminAccess(request)));
}
