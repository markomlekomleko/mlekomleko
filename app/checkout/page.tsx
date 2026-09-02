import type { Metadata } from "next";
import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = {
  title: "Plaćanje",
  description: "Unesite podatke za dostavu i izaberite način plaćanja.",
};

export default function CheckoutPage() {
  return <CheckoutForm />;
}
