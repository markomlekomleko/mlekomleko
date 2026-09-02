import type { Metadata } from "next";
import { StoreView } from "./store-view";

export const metadata: Metadata = {
  title: "Prodavnica",
  description:
    "Sveže mleko, jogurt, sirevi i drugi domaći proizvodi za jednokratnu ili redovnu dostavu.",
};

export default function StorePage() {
  return <StoreView />;
}
