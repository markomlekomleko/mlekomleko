# Mleko i Mleko — izmene po svih 13 segmenata

17. septembar 2026. Izvedeno iz brifa i prethodnog audita; crveni tekst nije korišćen kao zahtev. Rad je podeljen na tri subagenta (nalog/admin, analitika, fiskalizacija/SEO), uz zajedničku implementaciju rokova i proveru integracije.

## Najvažnija promena: rok za izmenu i otkazivanje

Podrazumevano **24 sata pre isporuke**. Admin menja rok u **Podešavanja → Dostava i naplata → Rok za izmene i otkazivanje (sati)**, od 0 do 168 sati. Vreme se prikazuje za Beograd i računanje uzima u obzir letnje/zimsko vreme.

- Tačno na granici roka server odbija izmenu, dodatak, preskok i otkazivanje te isporuke. Otvoren prozor ne zaobilazi proveru.
- Generisanje konačnog spiska i zaključavanje čuvaju se u istoj transakciji. Provera verzije sprečava prepisivanje istovremenih izmena.
- Zaključana isporuka čuva proizvode, količine i podatke za dostavu. Pretplata prelazi na sledeći termin, koji korisnik i dalje može da uređuje.
- Promena administrativnog pravila preračunava samo otvorene termine. Pre promene se zaključavaju termini kojima je prethodni rok već istekao: skraćivanje roka ne otključava stare porudžbine.
- Potvrda primljene uplate i označavanje izvršene dostave ostaju dozvoljeni posle roka, jer ne menjaju robu u zaključanoj isporuci.
- Zakazani posao obrađuje dospele rokove, a zahtevi naloga, dostava i izmena proveravaju rok nezavisno od cron-a. Sa postojećim dnevnim cron-om trajni zapis zaključavanja nastaje pri prvom narednom izvršavanju ili relevantnom zahtevu; zabrana izmene važi od samog isteka roka.

## Stanje po segmentima

| # | Segment | Završeno u kodu | Šta zahteva spoljni pristup ili potvrdu |
|---|---|---|---|
| 1 | Prodavnica i pretplate | Nezavisan izbor jednokratno/nedeljno/dvonedeljno, mešovita korpa, server računa cene i termine. Uklonjena trka pri izboru pre učitavanja interfejsa. | Kompletan stvarni katalog i komercijalni podaci. |
| 2 | Korisnički nalog | Registracija bez lozinke, pristup kodom posle gostujuće kupovine, stalno dodavanje proizvoda, ceo katalog dodataka, izmena i otkazivanje nenaplaćenih jednokratnih porudžbina. Provera vlasništva i verzije na serveru. | Prijem pravog email/WhatsApp koda. Plaćene porudžbine zahtevaju stvarni tok korekcije/povraćaja. |
| 3 | Rokovi | Podesiv rok i automatsko zaključavanje opisani iznad; konkretna isporuka ostaje nepromenljiva. | Aktivan zakazani posao na produkcionom hostingu. |
| 4 | Obaveštenja | Poseban podsetnik pre isteka roka, datum i vreme do kada su izmene moguće; sutrašnji podsetnik jasno kaže kada je rok istekao. Deduplikacija i odvojena obrada email/WhatsApp poruka. | Test stvarnog dostavljanja poruka kroz podešene naloge. |
| 5 | Dostava / Spoke | CSV/XLSX sa adresom, kontaktom, proizvodima i napomenom; očuvani zaključani spiskovi. | Probni import u pravi Spoke nalog. |
| 6 | Priprema robe | Zbir količina po proizvodu i pakovanju, projekcije koje poštuju ritam, pauzu i preskok; izvoz pripreme. | Nema dodatnog softverskog blokatora za sadašnji katalog. Nije izmišljeno pretvaranje nepoznatih pakovanja u litre/kg. |
| 7 | Plaćanje | Gotovina, pregled spremnosti integracije, zabrana produkcionog korišćenja lažne potvrde uplate. | **Nezavršeno: prava kartična i ponavljajuća naplata. Potrebni su izabrani provajder, ugovor/API i sandbox.** |
| 8 | Fiskalizacija | Trajni dnevnik slanja, nepromenljiv zahtev, zaštita od duplog POST-a posle prekida, oporavak iz potvrđenog odgovora, tačan zbir stavki/popusta/dostave, jasne greške. | **Nije potvrđen rad sa stvarnim fiskalnim servisom, avansima, konačnim računima i refundacijama.** |
| 9 | Administracija | Uređivanje postojeće porudžbine, kalendar budućih dostava, paginacija i pretraga cele baze kupaca/pretplata. Postojeći ručni unos, grafikoni i izvozi ostaju dostupni. | Nema novog softverskog blokatora za ove tokove. |
| 10 | Izgled i struktura | Provera na 390/768/1440 px, korekcije kontrasta i pristupačnosti, stabilniji izbor proizvoda pri učitavanju. | Terenska merenja brzine na produkciji i stvarnim uređajima nisu zamenjena lokalnim testovima. |
| 11 | SEO | Editor dodatnih stranica: nacrt, pregled, objava/povlačenje, stabilan URL, naslov/opis, podnaslovi, canonical, sitemap. Nacrti nisu javno dostupni. Opcioni verification tag. | Verifikacija vlasništva i indeksiranja u Search Console-u. |
| 12 | Analitika | Skripte se učitavaju tek posle odgovarajućeg pristanka; SPA prikazi, e-commerce događaji, potvrđena server-side kupovina, identitet sesije i deduplikacija. CSP dozvoljava potrebne konfigurirane servise. | GA4/GTM/Meta identifikatori i tajne, DebugView/probna kupovina; Google Ads uvoz potvrđene GA4 kupovine. |
| 13 | Izvori prodaje | Sačuvan prvi i poslednji nedirektan izvor, 90-dnevni period uz pristanak, klasifikacija kanala, izveštaj kampanja od sesije do plaćenog prihoda; obnove pretplate čuvaju originalni izvor. | Poređenje sa pravim marketinškim nalozima i kampanjama. |

## Operativne napomene

Dodate su migracije `0014_fiscal_dispatch.sql` i `0015_mutation_guards.sql`, uz PostgreSQL verzije. Primenjene su na lokalnu SQLite bazu; produkcija nije menjana. Pre objavljivanja promena migracije moraju biti primenjene i na odabranu produkcionu bazu.

Generičko „ponovi neuspele poslove” ne ponavlja fiskalne zahteve sa nepoznatim ishodom. Takav događaj mora prvo biti proveren kod provajdera. Lokalni testovi nisu slali prave poruke, teretili kartice niti izdavali stvarne fiskalne račune.

Detalji spoljnih zavisnosti: [naplata i fiskalizacija](payments-fiscal-readiness-2026-09-17.md). Prethodni audit je sačuvan zasebno; ovaj dokument opisuje naknadnu implementaciju i ne pretvara nepotvrđene integracije u završene stavke.

## Završna provera

- **165/165** testova serverske logike i integracija prolazi na ponovo izgrađenom worker-u.
- **85 browser scenarija prolazi** na širinama 390, 768 i 1440 px: 68 u prvom kompletnom prolazu i svih 17 nakon otklanjanja nalaza. Dva scenarija za mobilnu traku kupovine namerno se preskaču na većim ekranima.
- **15/15 izvršenih testova produkcione Next aplikacije prolazi**. Jedna PostgreSQL provera je preskočena jer `TEST_POSTGRES_URL` nije podešen; to nije potvrda rada na udaljenoj produkcionoj bazi.
- Produkcioni build (`.next-verify`), TypeScript, ESLint i `git diff --check` prolaze.
- Lokalni `/admin` na portu 3001 vraća HTTP 200. Lokalne nove migracije su primenjene.

Prvi browser prolaz otkrio je stvarnu trku pri ranom izboru proizvoda i konflikt ključa kada se pretplata menja uz više već pripremljenih termina. Oba uzroka su ispravljena; dodat je regresioni test za dve buduće dostave. Ostala ispravljena očekivanja odnosila su se na novu prijavu bez lozinke, mobilnu navigaciju, namernu animaciju i dokumentovano Next streaming ponašanje nepostojećih stranica. Nacrti SEO stranica provereni su i za odsustvo sadržaja u javnom odgovoru.

**Nije rađen push niti produkcioni deploy ovog paketa izmena.** Za potpuno zatvaranje svih 13 segmenata ostaju eksplicitno navedene provere i pristupi spoljnim servisima, naročito kartična naplata i fiskalni tokovi.
