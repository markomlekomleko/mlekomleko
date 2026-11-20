import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import { PolicyPage } from "../components/policy-page";
import { canonicalUrl } from "../lib/seo";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({ title: "Pravila redovne dostave", description: "Obračun, pauza, preskakanje i otkazivanje redovne dostave.", alternates: { canonical: canonicalUrl("/pravila-pretplate") } }); }

export default async function SubscriptionRulesPage() {
  const localize = await getLocalize();
  return localize(<PolicyPage eyebrow="Redovna dostava" title="Pravila pretplate" intro="Redovna dostava nema ugovorni minimalni period, a svaku promenu potvrđujemo u nalogu." sections={[
    { title: "Obračun", paragraphs: ["Pretplata je paket od četiri nedeljne dostave koji se plaća unapred — gotovinom pri prvoj dostavi ili uplatom na račun — bez obzira na kraj kalendarskog meseca. Paket se obnavlja tek kada su sve četiri dostave stvarno realizovane. Korpa prikazuje početni raspored. Avansni račun izdaje se po potvrdi uplate, a račun za promet za svaku pojedinačnu isporuku, uz razduženje pripadajućeg dela avansa.", "Dostava i popusti se obračunavaju po pravilima prikazanim pre potvrde."] },
    { title: "Izmene, preskakanje i pauza", paragraphs: ["Preskočena dostava ne troši plaćeni termin, a pauza do izabranog datuma čuva sve neisporučene dostave plaćenog paketa. Već plaćenu količinu nije moguće smanjiti; litre i proizvode možeš da dodaš samo za sledeću dostavu ili redovno, uz doplatu koju vidiš pre potvrde. Izmene važe do 36 sati pre početka dostavne ture; zaključana dostava ostaje nepromenjena."] },
    { title: "Otkazivanje", paragraphs: ["Otkazivanje zaustavlja obnovu. Plaćeni paket se isporučuje do kraja; neplaćeni paket se otkazuje. Za prekid već plaćenog paketa i povraćaj novca kontaktirajte podršku radi obračuna i odgovarajućih fiskalnih dokumenata."] },
  ]} />);
}
