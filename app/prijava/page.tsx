import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { canonicalUrl } from "../lib/seo";

export const metadata: Metadata = {
  title: "Prijava",
  description: "Napravite nalog email adresom i lozinkom, a zatim se prijavljujte kodom putem emaila ili WhatsApp-a.",
  alternates: { canonical: canonicalUrl("/prijava") },
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return <LoginForm />;
}
