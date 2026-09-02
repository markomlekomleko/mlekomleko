import type { Metadata } from "next";
import { MagicLinkConfirmation } from "./magic-link-confirmation";

export const metadata: Metadata = {
  title: "Potvrda prijave",
  robots: { index: false, follow: false },
};

export default function LoginConfirmationPage() {
  return <MagicLinkConfirmation />;
}
