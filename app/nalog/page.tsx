import type { Metadata } from "next";
import { AccountView } from "./account-view";

export const metadata: Metadata = {
  title: "Moj nalog",
  description: "Pregledajte sledeću dostavu i upravljajte pretplatama.",
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return <AccountView />;
}
