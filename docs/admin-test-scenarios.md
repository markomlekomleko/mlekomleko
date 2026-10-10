# Test porudžbine

## Live administracija

Adresa: https://mlekomleko-wyku.vercel.app/admin — koristi svoju uobičajenu admin prijavu. U Porudžbinama ili Kupcima pretraži `TEST`. Prenos sadrži 26 kupaca i 27 porudžbina, sa istim brojevima iz tabele ispod.

Podaci se nalaze u produkcionoj bazi i ulaze u administrativne zbirne prikaze i pripremu dostava. Oznaka „Plaćeno“ na ovim primerima predstavlja simulaciju. Postojeći kupci i porudžbine nisu izmenjeni.

Migracija `0020_test_scenarios.sql` registruje isključivo test kupce. Njihovi outbox događaji odloženi su trajno, uključujući ponovne pokušaje. Baza blokira kreiranje fiskalnih zapisa i pokušaja bankarske naplate za njihove porudžbine. Uvoz ne prenosi događaje, pristupne podatke, integracije, plaćanja ili fiskalne račune. Povraćaji su samo zatraženi/odobreni, nisu izvršeni.

Ponovljiv prenos: `node scripts/admin-scenarios-live.mjs` prvo proverava ceo prenos i poništava transakciju; `--apply` potvrđuje upis. Isti skup se ne uvozi dvaput. Skripta čita produkcionu vezu iz `.env.local`, proverava kontrolne zbirove migracija i sve zaštite pre potvrđivanja. Izveštaji su u ignorisanim `.data/live-scenarios-*.json` datotekama.

## Lokalno otvaranje

Adresa: http://localhost:4191/admin

Prijava: `test-admin@example.invalid` / `Test-scenariji-2026`. Ovo su isključivo lokalni test pristupni podaci.

Zasebna SQLite baza sadrži 26 test kupaca i 27 porudžbina. Lokalni prikaz koristi odvojenu bazu od objavljenog sajta. Svi kupci nose oznaku TEST i nedostavljive email adrese. Fiskalizacija, bankarska naplata, email, SMS i WhatsApp provajderi isključeni su za ovaj prikaz. Nijedan račun, uključujući testni, nije izdat. Status „Plaćeno“ predstavlja simuliranu evidenciju, ne stvarnu uplatu.

## Gde šta vidiš

1. **Porudžbine** → u pretragu unesi `TEST` ili deo imena, npr. `Izmenjena`. Otvori porudžbinu za stavke, iznos, adresu i status.
2. **Kupci** → pronađi kupca → **Redovne dostave** za trenutni ritam, pauzu, preskok i obnovu. **Pauze i promene** prikazuje izmene.
3. Pregled paketa u **Kupci** prikazuje kupljene, uručene i preostale količine paketa. Izmena pretplate ne prepravlja već plaćen paket.
4. **Dostave → Datum dostave** → izaberi **2026-10-13**. Pregled pokazuje zbir proizvoda i pojedinačne kupce; preskočeni i pauzirani kupci izostaju iz pripreme.
5. Za delimičnu i neuspelu dostavu izaberi **2026-10-06**. Završeni paket ima dostave: 2026-09-15, 2026-09-22, 2026-09-29, 2026-10-06.
6. Za zahteve za povraćaj: **Podešavanja**, odeljak poslovanja i povraćaja. Kreirani su zahtev i odobren zahtev; nijedan povraćaj nije izvršen.

## Scenariji

| Kupac | Šta je urađeno | Porudžbina |
| --- | --- | --- |
| TEST 01 — Završen paket | Sve četiri nedeljne dostave uručene. | MM-20260912-VE0HGBZT |
| TEST 02 — Delimično uručeno | Od 3 flaše uručene 2; neuručena količina ostaje u paketu. | MM-20260912-PBMKLIU3 |
| TEST 03 — Neuspela dostava | Kupac nije bio na adresi; ništa nije potrošeno iz paketa. | MM-20260912-NXRSWN_S |
| TEST 04 — Jednokratno uručeno | Plaćena i potpuno uručena jednokratna porudžbina. | MM-20260912-KFQ1RBEX |
| TEST 05 — Čeka gotovinu | Jednokratna porudžbina, naplata pri dostavi. | MM-20261010-LNJQ7DYI |
| TEST 06 — Plaćena jednokratna | Uplata evidentirana, čeka dostavu. | MM-20261010-C1DHVVV7 |
| TEST 07 — Nedeljni paket | Plaćen paket: 2 flaše × 4 dostave. | MM-20261010-B8TCLGQK |
| TEST 08 — Dvonedeljni paket | Plaćen paket: 3 flaše × 2 dostave. | MM-20261010-BNYARLST |
| TEST 09 — Paket čeka uplatu | Neplaćen paket; ne ulazi u pripremu. | MM-20261010-0CH54IS3 |
| TEST 10 — Preskočena dostava | Preskočen prvi termin; plaćene količine ostaju. | MM-20261010-XBBT59D1 |
| TEST 11 — Promenjena količina | Kupljeno 2 po dostavi; za sledeći paket izabrano 4. | MM-20261010-G6NTK1EP |
| TEST 12 — Promenjen ritam | Kupljen nedeljni paket; naredni paket na dve nedelje. | MM-20261010-LMIO-TN9 |
| TEST 13 — Pauzirana pretplata | Pauza dve nedelje; kupljene količine sačuvane. | MM-20261010-BSF-IDGS |
| TEST 14 — Nastavljena pretplata | Kupac pauzirao pa nastavio; obe izmene u istoriji. | MM-20261010-8YCPOPPF |
| TEST 15 — Obnova otkazana | Plaćeni paket se isporučuje do kraja, bez obnove. | MM-20261010-CO4IEKWE |
| TEST 16 — Otkazan neplaćen paket | Kupac otkazao pre uplate. | MM-20261010-82A-1I3Q |
| TEST 17 — Dodatak za sledeću dostavu | Uz paket dodat 1 jogurt samo za sledeći termin. | MM-20261010-PVS6PKNQ |
| TEST 18 — Mešovita korpa | Mleko nedeljno, jogurt dvonedeljno, sir jednokratno. | MM-20261010-HUHOE2OQ |
| TEST 19 — Izmenjena porudžbina | Jednokratna porudžbina: količina 2 → 4 i nova adresa. | MM-20261010-ROTK5PEL |
| TEST 20 — Otkazana jednokratna | Porudžbina otkazana pre naplate. | MM-20261010-4FDFFVMF |
| TEST 21 — Neuspela naplata | Simuliran status neuspešne naplate; nema bankarske transakcije. | MM-20261010-QJ4SNQXK |
| TEST 22 — Račun na firmu | Porudžbina sa podacima pravnog lica; bez izdatog računa. | MM-20261010-OBPMXZLW |
| TEST 23 — Dodat proizvod u pretplatu | Jogurt dodat u sastav narednog paketa. | MM-20261010-5JXZDEBT |
| TEST 24 — Uklonjen proizvod | Kupljeni paket ostaje isti; jogurt uklonjen iz sledećeg. | MM-20261010-OFB0VBSZ |
| TEST 25 — Tražen povraćaj | Zahtev za povraćaj neisporučenog paketa; nije izvršen. | MM-20261010-YHP9SYBG |
| TEST 26 — Odobren povraćaj | Povraćaj odobren, čeka izvršenje; nema bankarske ni fiskalne radnje. | MM-20261010-LT4KDVLG |

## Ponovno pokretanje

- `npm run demo:admin` otvara poslednju kreiranu test bazu na portu 4191.
- `npm run demo:seed` pravi NOVU test bazu i manifest `.data/admin-scenarios-latest.json`; stare test baze ostaju sačuvane. Za prikaz nove baze zaustavi i ponovo pokreni `npm run demo:admin`.
- Skripta koristi domenske funkcije za kreiranje, promene, preskoke, pauze, otkazivanja, povraćaje i potvrde uručenja. Istorijski scenariji imaju kontrolisan datum tokom kreiranja.
- Red događaja je sačuvan, ali su sva slanja u ovoj test bazi odložena do 9999. godine i označena `scenario:deferred`. Nisu označena kao poslata. Poseban trigger u test bazi odlaže i nove događaje koje napraviš dok isprobavaš admin. Režimi i ključevi spoljnih servisa uklanjaju se iz zasebnog procesa.
- Skup pokriva glavne poslovne varijante. Stvarni bankarski odgovor, fiskalni dokument i isporuka poruke namerno nisu simulirani kao uspešni.
