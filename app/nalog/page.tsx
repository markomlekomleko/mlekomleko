import type { Metadata } from "next";
import { AccountView } from "./account-view";
import { canonicalUrl } from "../lib/seo";

export const metadata: Metadata = {
  title: "Moj nalog",
  description: "Pregledajte sledeću dostavu i upravljajte pretplatama.",
  alternates: { canonical: canonicalUrl("/nalog") },
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return <AccountView />;
}
