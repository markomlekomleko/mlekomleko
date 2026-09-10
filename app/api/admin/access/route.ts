import { adminAccess, loginAdmin, logoutAdmin } from "@/server/auth";
import { jsonResponse, readJson, withRoute } from "@/server/domain";

export function GET(request: Request) {
  return withRoute(async () => jsonResponse(await adminAccess(request)));
}
export function POST(request: Request) {
  return withRoute(async () => jsonResponse(await loginAdmin(request, await readJson(request))));
}
export function DELETE(request: Request) {
  return withRoute(async () => jsonResponse(await logoutAdmin(request)));
}
