"use client";

import { useLocalize } from "@/app/lib/i18n/client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AnalyticsProvider } from "./analytics-provider";
import { CartProvider } from "./cart-provider";
import { CartDrawer } from "./cart-drawer";
import { SiteHeader, SiteFooter, type HeaderSettings } from "./site-shell";
export function ApplicationShell({
  children,
  settings,
}: {
  children: ReactNode;
  settings: HeaderSettings;
}) {
  const localize = useLocalize();
  const path = usePathname();
  const skip = (
    <a className="skip-link" href="#glavni-sadrzaj">
      Preskoči na glavni sadržaj
    </a>
  );
  const content = <main id="glavni-sadrzaj">{children}</main>;
  if (path === "/admin" || path.startsWith("/admin/"))
    return localize((
      <div className="market-theme">
        {skip}
        {content}
      </div>
    ));
  return localize((
    <AnalyticsProvider>
      <CartProvider>
        {skip}
        <SiteHeader key={path} settings={settings} />
        {content}
        <SiteFooter storeName={settings.storeName} />
        <CartDrawer />
      </CartProvider>
    </AnalyticsProvider>
  ));
}
