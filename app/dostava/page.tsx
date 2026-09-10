import type { Metadata } from "next";
import { PolicyPage } from "../components/policy-page";
import { canonicalUrl } from "../lib/seo";

export const metadata: Metadata = { title: "Pravila dostave", description: "Termini, zona i priprema dostave Mleko i Mleko.", alternates: { canonical: canonicalUrl("/dostava") } };

export default function DeliveryPolicyPage() {
  return <PolicyPage eyebrow="Od farme do vrata" title="Pravila dostave" intro="Tačan termin, cena i rok za izmenu prikazuju se pre potvrde svake porudžbine." sections={[
    { title: "Zona i termin", paragraphs: ["Dostupnost proveravamo prema poštanskom broju. Prvi sledeći termin i lokalno vreme računaju se u vremenskoj zoni Europe/Belgrade.", "Rutu zaključavamo po isteku roka prikazanog u korpi i nalogu. Promena operativnog dana uvek se prikazuje pre potvrde."] },
    { title: "Preuzimanje", paragraphs: ["Kupac treba da obezbedi tačnu adresu i dostupan kontakt. Napomenu za ulaz, sprat ili bezbedno mesto za primopredaju unesite u checkout-u.", "Povratne flaše predaju se čiste pri narednoj isporuci kada je to primenljivo na izabrani proizvod."] },
    { title: "Problem sa isporukom", paragraphs: ["Ako isporuka kasni, nedostaje ili je proizvod oštećen, pošaljite broj porudžbine i opis problema preko kontakt stranice. Tim proverava zaključanu listu dostave i predlaže zamenu, kredit ili drugo odgovarajuće rešenje."] },
  ]} />;
}
