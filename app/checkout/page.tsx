import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import { CheckoutForm } from "./checkout-form";
import { canonicalUrl } from "../lib/seo";
import { DELIVERY_CITIES } from "../lib/delivery-area";
import { deliveryCityNames, getBusinessSettings } from "../../server/settings";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "Plaćanje",
  description: "Unesi podatke za dostavu i izaberi način plaćanja.",
  alternates: { canonical: canonicalUrl("/checkout") },
  robots: { index: false, follow: true },
}); }

export default async function CheckoutPage() {
  const localize = await getLocalize();
  // City suggestions: built-in cities plus the ones added in the admin.
  const cities = await getBusinessSettings().then(deliveryCityNames, () => [...DELIVERY_CITIES]);
  return localize(<CheckoutForm cities={cities} />);
}
