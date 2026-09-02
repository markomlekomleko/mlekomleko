import type { Metadata } from "next";
import { MagicLinkConfirmation } from "./magic-link-confirmation";
import { canonicalUrl } from "../../lib/seo";

export const metadata: Metadata = {
  title: "Potvrda prijave",
  alternates: { canonical: canonicalUrl("/prijava/potvrda") },
  robots: { index: false, follow: false },
};

export default function LoginConfirmationPage() {
  return <MagicLinkConfirmation />;
}
