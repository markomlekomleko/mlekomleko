import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import { CityDeliveryPage } from "../city-delivery-page";
import { canonicalUrl } from "../../lib/seo";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "Dostava domaćeg mleka u Novom Sadu",
  description:
    "Domaće kravlje i kozje mleko sa dostavom u Novom Sadu petkom, u povratnim staklenim flašama.",
  alternates: { canonical: canonicalUrl("/dostava-mleka/novi-sad") },
}); }

export default async function NoviSadDeliveryPage() {
  const localize = await getLocalize();
  return localize((
    <CityDeliveryPage
      city="Novi Sad"
      slug="novi-sad"
      deliveryDays="Dostava petkom"
      postalCodeHint="Unesi novosadski poštanski broj."
      localDetail="Aktuelna zona obuhvata podržane poštanske brojeve sa prefiksom 21."
    />
  ));
}
