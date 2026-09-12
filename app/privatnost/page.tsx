import type { Metadata } from "next";
import { PolicyPage } from "../components/policy-page";
import { canonicalUrl } from "../lib/seo";

export const metadata: Metadata = { title: "Privatnost i kolačići", description: "Kako Mleko i Mleko obrađuje podatke i upravlja saglasnostima.", alternates: { canonical: canonicalUrl("/privatnost") } };

export default function PrivacyPage() {
  return <PolicyPage eyebrow="Vaši podaci" title="Privatnost i kolačići" intro="Prikupljamo samo podatke potrebne za kupovinu, dostavu, podršku i opcionalno merenje korišćenja sajta." sections={[
    { title: "Podaci potrebni za uslugu", paragraphs: ["Za porudžbinu obrađujemo ime, kontakt, adresu, sadržaj porudžbine, način i status plaćanja i napomenu za dostavu. Podaci se koriste za ispunjenje porudžbine, podršku, računovodstvo i zakonske obaveze.", "Nalog otvarate email adresom i lozinkom, uz potvrdu emaila. Lozinka se ne čuva u čitljivom obliku. Kasnije se prijavljujete jednokratnim kodom putem emaila ili potvrđenog WhatsApp broja. Prijava koristi bezbedan HttpOnly session kolačić. Sirovi podaci kartice se ne čuvaju."] },
    { title: "Email i WhatsApp poruke", paragraphs: ["Servisu za slanje prosleđujemo email adresu ili broj telefona i sadržaj poruke potreban za isporuku. WhatsApp broj povezujete i potvrđujete iz svog naloga, uz saglasnost za tražene kodove za prijavu.", "WhatsApp obaveštenja o porudžbinama i dostavama uključujete zasebno. U nalogu ih možete isključiti ili ukloniti WhatsApp broj; email ostaje dostupan za prijavu."] },
    { title: "Analitika i marketing", paragraphs: ["Analitička i marketinška saglasnost su odvojene. Bez analitičke saglasnosti browser ne šalje događaje korišćenja; bez marketinške saglasnosti ne uključuju se oglasni tagovi.", "Atribucija čuva samo dozvoljene UTM parametre, putanju i domen referrera, bez emaila, telefona, adrese ili napomena."] },
    { title: "Vaš izbor", paragraphs: ["Saglasnost možete promeniti ili povući u svakom trenutku preko dugmeta „Podešavanja kolačića” u podnožju sajta. Povlačenje ne utiče na neophodne kolačiće korpe, bezbednosti i prijave.", "Za zahtev za pristup, ispravku ili brisanje podataka javite se putem kontakt stranice; odgovor zavisi od obaveznih rokova čuvanja."] },
  ]} />;
}
