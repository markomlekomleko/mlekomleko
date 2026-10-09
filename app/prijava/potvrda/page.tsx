import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import { MagicLinkConfirmation } from "./magic-link-confirmation";
import { canonicalUrl } from "../../lib/seo";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "Potvrda prijave",
  alternates: { canonical: canonicalUrl("/prijava/potvrda") },
  robots: { index: false, follow: false },
}); }

export default async function LoginConfirmationPage() {
  const localize = await getLocalize();
  return localize(<MagicLinkConfirmation />);
}
