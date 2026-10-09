import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import { AccountView } from "./account-view";
import { canonicalUrl } from "../lib/seo";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "Moj nalog",
  description: "Pregledaj sledeću dostavu i upravljaj pretplatama.",
  alternates: { canonical: canonicalUrl("/nalog") },
  robots: { index: false, follow: false },
}); }

export default async function AccountPage() {
  const localize = await getLocalize();
  return localize(<AccountView />);
}
