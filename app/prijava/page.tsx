import type { Metadata } from "next";
import { MagicLinkForm } from "./magic-link-form";

export const metadata: Metadata = {
  title: "Prijava",
  description: "Zatražite jednokratni link za pristup svom nalogu i dostavama.",
};

export default function LoginPage() {
  return <MagicLinkForm />;
}
