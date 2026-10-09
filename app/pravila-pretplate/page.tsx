import type { Metadata } from "next";
import { PolicyPage } from "../components/policy-page";
import { canonicalUrl } from "../lib/seo";

export const metadata: Metadata = { title: "Pravila redovne dostave", description: "Obračun, pauza, preskakanje i otkazivanje redovne dostave.", alternates: { canonical: canonicalUrl("/pravila-pretplate") } };

export default function SubscriptionRulesPage() {
  return <PolicyPage eyebrow="Redovna dostava" title="Pravila pretplate" intro="Redovna dostava nema ugovorni minimalni period, a svaku promenu potvrđujemo u nalogu." sections={[
    { title: "Obračun", paragraphs: ["Paket se plaća unapred i sadrži četiri dostave za nedeljni ili dve za dvonedeljni ritam, bez obzira na kraj kalendarskog meseca. Korpa prikazuje početni raspored. Avansni račun izdaje se po potvrdi uplate, a konačni nakon svih izvršenih dostava.", "Dostava i popusti se obračunavaju po pravilima prikazanim pre potvrde."] },
    { title: "Izmena ritma", paragraphs: ["Preskakanje i pauza do tri kalendarska meseca čuvaju sve neisporučene količine plaćenog paketa. Izmene količine i ritma važe od narednog paketa. Posebno plaćen dodatak može se dodati sledećoj dostavi pre roka. Zaključana dostava ostaje nepromenjena."] },
    { title: "Otkazivanje", paragraphs: ["Otkazivanje zaustavlja obnovu. Plaćeni paket se isporučuje do kraja; neplaćeni paket se otkazuje. Za prekid već plaćenog paketa i povraćaj novca kontaktirajte podršku radi obračuna i odgovarajućih fiskalnih dokumenata."] },
  ]} />;
}
