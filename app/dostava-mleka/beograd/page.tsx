import type { Metadata } from "next";
import { CityDeliveryPage } from "../city-delivery-page";
import { canonicalUrl } from "../../lib/seo";

export const metadata: Metadata = {
  title: "Dostava domaćeg mleka u Beogradu",
  description:
    "Domaće kravlje i kozje mleko sa dostavom u Beogradu utorkom i petkom, u povratnim staklenim flašama.",
  alternates: { canonical: canonicalUrl("/dostava-mleka/beograd") },
};

export default function BelgradeDeliveryPage() {
  return (
    <CityDeliveryPage
      city="Beograd"
      slug="beograd"
      deliveryDays="Dostava utorkom i petkom"
      postalCodeHint="Unesite beogradski poštanski broj."
      localDetail="Aktuelna zona obuhvata podržane poštanske brojeve sa prefiksom 11."
    />
  );
}
