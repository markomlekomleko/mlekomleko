import type { Metadata } from "next";
import { PolicyPage } from "../components/policy-page";
import { canonicalUrl } from "../lib/seo";

export const metadata: Metadata = { title: "Uslovi kupovine", description: "Uslovi poručivanja i plaćanja u prodavnici Mleko i Mleko.", alternates: { canonical: canonicalUrl("/uslovi-kupovine") } };

export default function TermsPage() {
  return <PolicyPage eyebrow="Pravila kupovine" title="Uslovi kupovine" intro="Ovde su jasno opisani koraci od potvrde korpe do isporuke." sections={[
    { title: "Porudžbina i cena", paragraphs: ["Pre potvrde prikazujemo cenu po isporuci, broj preostalih termina u obračunskom mesecu, trošak dostave, popust i ukupan iznos. Važe podaci iz završnog obračuna na checkout-u.", "Porudžbina je primljena kada se prikaže broj porudžbine i pošalje potvrda na navedeni email."] },
    { title: "Plaćanje", paragraphs: ["Gotovinska porudžbina ostaje na čekanju do evidentiranja naplate. Kartica se tereti samo kroz izabranog procesora plaćanja; Mleko i Mleko ne prima niti čuva broj kartice ili sigurnosni kod."] },
    { title: "Izmene i otkazivanje", paragraphs: ["Jednokratnu porudžbinu ili sledeći termin redovne dostave moguće je menjati do prikazanog roka. Posle zaključavanja rute zahtev rešavamo kroz podršku, u skladu sa stanjem pripreme i važećim propisima."] },
  ]} />;
}
