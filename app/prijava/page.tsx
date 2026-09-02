import type { Metadata } from "next";
import { MagicLinkForm } from "./magic-link-form";
import { canonicalUrl } from "../lib/seo";

export const metadata: Metadata = {
  title: "Prijava",
  description: "Zatražite jednokratni link za pristup svom nalogu i dostavama.",
  alternates: { canonical: canonicalUrl("/prijava") },
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return <MagicLinkForm />;
}
