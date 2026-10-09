import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import { CityDeliveryPage } from "../city-delivery-page";
import { canonicalUrl } from "../../lib/seo";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "Dostava domaćeg mleka u Beogradu",
  description:
    "Domaće kravlje i kozje mleko sa dostavom u Beogradu utorkom i petkom, u povratnim staklenim flašama.",
  alternates: { canonical: canonicalUrl("/dostava-mleka/beograd") },
}); }

export default async function BelgradeDeliveryPage() {
  const localize = await getLocalize();
  return localize((
    <CityDeliveryPage
      city="Beograd"
      slug="beograd"
      deliveryDays="Dostava utorkom i petkom"
      postalCodeHint="Unesi beogradski poštanski broj."
      localDetail="Aktuelna zona obuhvata podržane poštanske brojeve sa prefiksom 11."
    />
  ));
}
