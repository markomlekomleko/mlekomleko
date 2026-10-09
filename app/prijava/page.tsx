import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { canonicalUrl } from "../lib/seo";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "Prijava",
  description: "Napravite nalog i prijavite se jednokratnim kodom putem emaila ili potvrđenog WhatsApp broja. Lozinka nije potrebna.",
  alternates: { canonical: canonicalUrl("/prijava") },
  robots: { index: false, follow: true },
}); }

export default async function LoginPage() {
  const localize = await getLocalize();
  return localize(<LoginForm />);
}
