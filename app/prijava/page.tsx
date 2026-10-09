import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { canonicalUrl } from "../lib/seo";

export const metadata: Metadata = {
  title: "Prijava",
  description: "Napravite nalog i prijavite se jednokratnim kodom putem emaila ili potvrđenog WhatsApp broja. Lozinka nije potrebna.",
  alternates: { canonical: canonicalUrl("/prijava") },
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return <LoginForm />;
}
