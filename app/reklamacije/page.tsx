import type { Metadata } from "next";
import { PolicyPage } from "../components/policy-page";
import { canonicalUrl } from "../lib/seo";

export const metadata: Metadata = { title: "Reklamacije i povraćaj", description: "Kako prijaviti problem sa porudžbinom Mleko i Mleko.", alternates: { canonical: canonicalUrl("/reklamacije") } };

export default function ComplaintsPage() {
  return <PolicyPage eyebrow="Podrška posle dostave" title="Reklamacije i povraćaj" intro="Prijavu problema vezujemo za konkretnu porudžbinu i rešavamo bez skrivanja statusa." sections={[
    { title: "Kako prijaviti", paragraphs: ["Pošaljite broj porudžbine, datum isporuke, proizvod, količinu i kratak opis. Fotografija ambalaže ili oštećenja može ubrzati proveru, ali nemojte slati podatke kartice."] },
    { title: "Provera i rešenje", paragraphs: ["Proveravamo evidenciju naplate, zaključanu projekciju rute i prijavljeni problem. Zavisno od slučaja rešenje može biti zamena, kredit za naredni obračun ili povraćaj na originalni način plaćanja.", "Rok i pravo na konkretno rešenje određuju vrsta robe, okolnosti isporuke i važeći propisi; zakonska prava kupca ovim tekstom nisu ograničena."] },
    { title: "Povraćaj novca", paragraphs: ["Odobren kartični povraćaj šalje se preko istog procesora plaćanja i može biti vidljiv sa odlaganjem banke. Gotovinski povraćaj se dogovara sa podrškom i evidentira u porudžbini."] },
  ]} />;
}
