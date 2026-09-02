import { jsonResponse, withRoute } from "../../../server/domain";
import { getStorefront } from "../../../server/storefront";

export function GET(request: Request) {
  return withRoute(async () => {
    const postalCode = new URL(request.url).searchParams.get("postalCode");
    return jsonResponse(await getStorefront(postalCode));
  });
}
