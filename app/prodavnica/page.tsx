import type { Metadata } from "next";
import { StoreView } from "./store-view";

export const metadata: Metadata = {
  title: "Prodavnica",
  description:
    "Domaće kravlje i kozje mleko po litru, sa izborom količine i ritma dostave.",
};

export default function StorePage() {
  return <StoreView />;
}
