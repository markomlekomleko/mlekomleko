import { requireAdmin } from "@/server/auth";
import { jsonResponse, withRoute } from "@/server/domain";
import { fiscommRead } from "@/server/fiscomm";
export function GET(request: Request) { return withRoute(async () => {
  await requireAdmin(request);
  const [account, taxes] = await Promise.all([fiscommRead("/auth/api-key/me"), fiscommRead("/receipt/tax-rates")]);
  return jsonResponse({companyName: account.companyName, shopName: account.shopName, currentTaxRates: taxes.currentTaxRates});
}); }
