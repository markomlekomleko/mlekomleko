"use client";
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
  const path = usePathname();
  const skip = (
    <a className="skip-link" href="#glavni-sadrzaj">
      Preskoči na glavni sadržaj
    </a>
  );
  const content = <main id="glavni-sadrzaj">{children}</main>;
  if (path === "/admin" || path.startsWith("/admin/"))
    return (
      <>
        {skip}
        {content}
      </>
    );
  return (
    <AnalyticsProvider>
      <CartProvider>
        {skip}
        <SiteHeader settings={settings} />
        {content}
        <SiteFooter storeName={settings.storeName} />
        <CartDrawer />
      </CartProvider>
    </AnalyticsProvider>
  );
}
