import type { Metadata } from "next";
import { CartView } from "./cart-view";

export const metadata: Metadata = {
  title: "Korpa",
  description: "Pregledajte proizvode, količine i ritam svake dostave.",
};

export default function CartPage() {
  return <CartView />;
}
