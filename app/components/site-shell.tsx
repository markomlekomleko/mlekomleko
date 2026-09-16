"use client";

import { usePathname } from "next/navigation";
import { MarketHeader, MarketFooter } from "./market-shell";

export type HeaderSettings = {
  storeName: string;
  announcementEnabled: boolean;
  announcementText: string;
  announcementLinkLabel: string;
  announcementUrl: string;
  storeDemoMode: boolean;
  serviceAreaNote: string;
};

export function SiteHeader({ settings }: { settings: HeaderSettings }) {
  const pathname = usePathname();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;
  return <MarketHeader key={pathname} storeName={settings.storeName} />;
}

export function SiteFooter({ storeName = "Mleko i Mleko" }: { storeName?: string }) {
  const pathname = usePathname();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;
  return <MarketFooter storeName={storeName} />;
}
