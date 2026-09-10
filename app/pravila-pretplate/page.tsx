import type { Metadata } from "next";
import { PolicyPage } from "../components/policy-page";
import { canonicalUrl } from "../lib/seo";

export const metadata: Metadata = { title: "Pravila redovne dostave", description: "Obračun, pauza, preskakanje i otkazivanje redovne dostave.", alternates: { canonical: canonicalUrl("/pravila-pretplate") } };

export default function SubscriptionRulesPage() {
  return <PolicyPage eyebrow="Redovna dostava" title="Pravila pretplate" intro="Redovna dostava nema ugovorni minimalni period, a svaku promenu potvrđujemo u nalogu." sections={[
    { title: "Obračun", paragraphs: ["Cena se računa iz stvarnih preostalih termina u konkretnom obračunskom mesecu, zasebno za nedeljni i dvonedeljni ritam. Korpa prikazuje datume obuhvaćenih isporuka.", "Dostava i popusti se obračunavaju po pravilima prikazanim pre potvrde."] },
    { title: "Izmena ritma", paragraphs: ["Količinu ili ritam možete promeniti, preskočiti sledeću isporuku ili pauzirati do izabranog datuma dok rok za izmenu nije istekao. Zaključana dostava ostaje nepromenjena."] },
    { title: "Otkazivanje", paragraphs: ["Pretplatu možete trajno otkazati iz naloga. Ako je tekući mesec već plaćen, sistem evidentira odgovarajući kredit ili obavezu na osnovu preostalih termina; podrška rešava eventualni povraćaj."] },
  ]} />;
}
