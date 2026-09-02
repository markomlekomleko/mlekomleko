import type { Metadata } from "next";
import { CityDeliveryPage } from "../city-delivery-page";
import { canonicalUrl } from "../../lib/seo";

export const metadata: Metadata = {
  title: "Dostava domaćeg mleka u Novom Sadu",
  description:
    "Domaće kravlje i kozje mleko sa dostavom u Novom Sadu petkom, u povratnim staklenim flašama.",
  alternates: { canonical: canonicalUrl("/dostava-mleka/novi-sad") },
};

export default function NoviSadDeliveryPage() {
  return (
    <CityDeliveryPage
      city="Novi Sad"
      slug="novi-sad"
      deliveryDays="Dostava petkom"
      postalCodeHint="Unesite novosadski poštanski broj."
      localDetail="Aktuelna zona obuhvata podržane poštanske brojeve sa prefiksom 21."
    />
  );
}
