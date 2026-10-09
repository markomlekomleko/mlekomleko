import { NextResponse, type NextRequest } from "next/server";
import { splitLocale, defaultLocale } from "./app/lib/i18n/routing";

export function proxy(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const { locale, path, prefixed } = splitLocale(requestUrl.pathname);
  const privatePath = /^\/(?:admin|api|_next)(?:\/|$)/.test(path);
  const asset = /\.[a-z0-9]+$/i.test(path) || /^\/(?:images|media|fonts)(?:\/|$)/.test(path);
  if (prefixed && (locale === defaultLocale || privatePath || asset)) {
    const url = new URL(requestUrl); url.pathname = path;
    return NextResponse.redirect(url, 308);
  }
  const headers = new Headers(request.headers);
  // Overwrite, rather than trust, any locale headers supplied by the caller.
  headers.set("x-store-locale", privatePath || asset ? defaultLocale : locale);
  headers.set("x-store-path", path);
  if (prefixed) {
    const url = new URL(requestUrl); url.pathname = path;
    return NextResponse.rewrite(url, { request: { headers } });
  }
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
