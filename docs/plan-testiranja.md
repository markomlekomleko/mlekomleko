# Mleko i Mleko — plan kompletnog testiranja

Datum: 5. septembar 2026. Status: plan za izvršavanje; scenariji ispod nisu označeni kao izvršeni.

Cilj je da svaki zahtev iz originalnog brifa dobije proverljiv dokaz: šta kupac ili administrator uradi, šta se promeni u bazi, kako se obračuna novac i šta završi na listi dostave, računu i u analitici. Vizuelni deo razrađen je u [planu dizajna](plan-dizajna.md).

Osnova: „Brif za Mleko i Mleko sajt.pdf“, svih devet strana, lokalni `CONTRACT.md`, `docs/acceptance.md`, postojeći kod i testovi. Brif sadrži 13 numerisanih oblasti i završni operativni tok „Dostave za petak“. Njegove crvene dopune određuju email prijavu kao početno rešenje.

## 1. Šta je utvrđeno pregledom

Ovo su nalazi iz čitanja koda i dokumentacije, bez novog pokretanja funkcionalnih testova ili ocenjivanja izgleda u browseru.

| Nalaz | Dokaz u projektu | Posledica za plan |
|---|---|---|
| Postoje 32 deklarisana unit/API/HTML/integration testa. | `tests/*.test.mjs` | Ponovo ih pokrenuti na tačnoj verziji kandidata i zabeležiti rezultat. Raniji prolaz nije dokaz trenutne ispravnosti. |
| Postoje četiri različita Playwright scenarija na tri viewporta; svi projekti koriste Chromium/Chrome. | `tests/e2e/production-readiness.spec.ts`, `playwright.config.ts` | Proširiti poslovne tokove i dodati Firefox, WebKit i proveru pravih telefona. Dvanaest izvršavanja nisu dvanaest različitih tokova. |
| Deo API testova koristi `FakeD1Statement`; pojedini testovi čitaju tekst izvornog koda. | `tests/rendered-html.test.mjs` | Kritične transakcije, konkurentnost i promene baze proveravati na pravom izolovanom D1, uz nezavisan očekivani rezultat. |
| Consent pomoćna funkcija direktno upisuje `localStorage`. | `acceptNecessary()` u E2E testu | Dodati test stvarnih klikova, tastature, fokusa i mrežnog saobraćaja pre i posle odluke. |
| Nije pronađena akcija za dodavanje novog trajnog artikla u postojeću pretplatu. Postoji `add_next_only`. | `server/commerce.ts`, `app/nalog/account-view.tsx` | Otvoriti funkcionalni nedostatak za brif §2; privremeni dodatak nije dovoljan. |
| Ručna izmena porudžbine trenutno obuhvata payment status, fulfillment status i napomenu. | `server/admin.ts:updateOrder()` | Precizirati i implementirati potrebne izmene stavki, količine i adrese, uz obračun i audit. |
| Checkout šalje `local-mock-token`; kartični adapter je lokalna simulacija. | `app/checkout/checkout-form.tsx`, `server/integrations.ts` | Pravi OTP/RaiAccept i recurring zahtevaju zaseban sandbox test. |
| Javni tekst navodi Beograd utorkom/petkom, a kalendar ima jedan globalni `deliveryWeekday`. | `app/lib/content.ts`, `server/settings.ts` | Usaglasiti operativni raspored i prikaz. Ne prihvatiti obe tvrdnje kao automatski usklađene. |
| Checkout prikazuje „Danas plaćate“ i kada je izabrana gotovina. | `app/checkout/checkout-form.tsx` | Testirati i prilagoditi tekst stvarnom trenutku naplate: pri prvoj dostavi u mesecu. |
| Postoje interni analytics događaji i GA4 purchase slanje, ali to samo po sebi ne dokazuje ceo GA4/GTM/Ads/Meta funnel. | `app/components/analytics-provider.tsx`, `server/integration-jobs.ts` | Potreban dokaz u mreži i alatima svakog stvarno povezanog servisa. |
| Analytics identifikatori i attribution pozivaju se pri montiranju providera pre odluke o saglasnosti. | `app/components/analytics-provider.tsx` | Ispitati i lokalno skladištenje, ne samo slanje događaja. Cilj plana je da neobavezno praćenje počne tek uz odgovarajuću saglasnost. |

Postojeće nekomitovane izmene zadržati. Na početku izvršavanja sačuvati identitet kandidata: commit + diff ili namenski snapshot. Migracija na Vercel/Supabase, pomenuta u dopuni brifa, nije deo ovog plana testiranja i dizajna; ako se zasebno realizuje, ponoviti platformsku regresiju.

## 2. Pravila koja moraju dobiti jednoznačan odgovor

Odluke pripremiti iz postojećeg ugovora i poslovnih podataka u prvoj fazi. Ne zaustavljaju inventar testova i dizajn drugih ekrana, ali zavisni test ne može dobiti PASS dok očekivano ponašanje nije određeno.

| ID | Odluka | Polazni predlog / razlog |
|---|---|---|
| O-01 | Stvarni termini i zone po gradu; praznici i pomerene isporuke. | Jedan izvor rasporeda za prodavnicu, checkout, nalog, podsetnike i admin. Petak u brifu je primer operativnog toka. |
| O-02 | Povećanje iznosa u već plaćenom mesecu. | Prikazati doplatu pre potvrde; trenutna doplata ili dug u sledećem obračunu mora biti poslovno definisan. Pozitivan kredit prenositi bez prepisivanja starog računa. |
| O-03 | Šta biva sa dostavom i dodatkom pri skip/pause/cancel. | Bez naplate neizvršene dostave; za već naplaćenu dostavu definisati kredit. Dodatak pomeriti ili otkazati po jednom vidljivom pravilu. |
| O-04 | Neuspešna mesečna naplata i prestanak raspoloživosti artikla. | Definisati retry, obaveštenje, dozvolu isporuke i alternativu; ne isporučivati niti teretiti kupca po prećutnoj pretpostavci. |
| O-05 | Granice administratorske izmene, naročito posle zaključavanja. | Otvorena porudžbina menja projekciju i zbir; zaključana zahteva eksplicitno pravilo, trag razloga i kontrolisanu korekciju. |
| O-06 | Uklanjanje poslednjeg artikla i otkazivanje posle roka. | Bez prazne naplative pretplate. Razdvojiti zaključanu narednu isporuku od prekida budućih ciklusa. |
| O-07 | Cena/dostava/popust pri objedinjavanju više pretplata i jednokratne kupovine istog kupca. | Jedinstven obračun za istu adresu i termin; kriterijum objedinjavanja unapred zapisati. |
| O-08 | Rate iz završne dopune brifa. | Proveriti sa izabranom bankom da li su deo ugovorenog obuhvata; ne poistovetiti rate sa mesečnom recurring naplatom. |

## 3. Metod rada i evidencija

**P0**: pogrešna ili dupla naplata, gubitak/otkrivanje podataka, neisporučiva lista, blokirana kupovina, neispravno zaključavanje. **P1**: obavezna funkcija brifa ne radi, pogrešan email/tracking, ozbiljan mobilni ili accessibility problem. **P2**: manji vizuelni ili sadržajni problem koji ne menja odluku i podatke.

Status svakog slučaja: NOT RUN, PASS, FAIL, BLOCKED ili obrazloženo N/A. „Postoji u kodu“, mock rezultat i screenshot nisu zamena za funkcionalni dokaz. Ponovljen prolaz posle automatskog retry-a evidentirati kao nestabilan test dok se uzrok ne razjasni.

Za svaki ID iz matrice napraviti zapis: zahtev i strana brifa, preduslovi, fixture, tačni koraci, očekivano stanje, prioritet, okruženje/verzija, stvarni rezultat, requestId, screenshot/trace kada je smislen, SQL provera bez ličnih podataka, provider sandbox ID i veza ka defektu. Svaku varijantu unutar reda izvršiti i evidentirati posebno, npr. T-17a/T-17b.

Slojevi: **U** — čista poslovna logika; **I** — API i prava izolovana baza; **E** — ceo tok u browseru; **R** — ručna UX/accessibility/operativna provera; **S** — sandbox spoljnog servisa. Izolacija, provere vidljivog ponašanja i stabilni role/label lokatori prate [Playwright preporuke](https://playwright.dev/docs/best-practices).

Svaka poslovna izmena proverava lanac: **ekran → API → sačuvani podaci → obračun → naredna dostava → zbir → izvoz → odgovarajuće obaveštenje/analitika**. Dokazati i odsustvo neželjenih efekata pri odbijenom zahtevu.

## 4. Testno okruženje i nezavisna računica

- Poseban lokalni/staging D1 i fiktivni kupci; migracije od prazne baze i sa prethodne šeme. Ne koristiti produkcione kupce i ne slati poruke stvarnim ljudima tokom izvršavanja ovog plana.
- Zamrznuti vreme na serveru i u browseru; samo promena browser sata nije dovoljna. Poslovna zona je `Europe/Belgrade`; proveriti i browser u drugoj zoni.
- Seed: aktivni/neaktivni artikli, proizvod bez pretplate, mleko u L i sir/jogurt u komadima, različite cene, kupci A/B, plaćene/neplaćene pretplate, dva različita biweekly početka, krediti oba znaka, duge srpske adrese.
- Mock fault režimi: timeout pre/posle provider uspeha, 429/500, prekid mreže, dupli događaj, neusaglašen redosled i restart workera.
- Browseri: Chromium, Firefox i WebKit; glavni tokovi dodatno na pravom iPhone/Safari i Android/Chrome. Emulacija WebKit-a nije dokaz da je proverena cela iOS kombinacija.
- Širine: 320, 360, 390, 430, 768, 1024, 1440 i 1920 px; portret/landscape, 200% tekst i reflow na 320 CSS px. Glavne tokove na sva tri browser engine-a, potpunu vizuelnu matricu na dogovorenom osnovnom browseru, rizične razlike dodatno ručno.

**Kontrolni obračun — izmišljene cene samo za test:** kravlje mleko 250 RSD/L, jogurt 150 RSD/kom, sir 400 RSD/kom; dostava 350 RSD po stvarnom terminu; bez popusta, depozita i posebne pretplatničke cene.

| Fixture | Nezavisno očekivanje |
|---|---|
| Januar 2027, petkom: 1, 8, 15, 22, 29. Mleko 3 L weekly, jogurt 1 biweekly od 1. januara, sir 1 samo 1. januara. | Mleko 3.750 + jogurt 450 + sir 400 + dostava 1.750 = **6.350 RSD**. Pet termina; sir se pojavljuje tačno jednom. |
| Ista korpa sa prvom dostavom 8. januara; biweekly tada počinje. | Mleko 3.000 + jogurt 300 + sir 400 + dostava 1.400 = **5.100 RSD**. Četiri termina; jogurt 8. i 22. januara. |
| Prvi fixture je plaćen; 13. januara mleko se smanji sa 3 na 2 L. | Za tri preostala petka kredit samo za mleko je **750 RSD**. Isporuke i naplaćeni istorijski dokument ostaju sa prvobitnim vrednostima. |
| Isporuka 15. januara 2027. u 08:00, rok 24 h. | 14. januara u 07:59:59 CET izmena prolazi; u 08:00:00 i 08:00:01 ne menja zaključivu isporuku. UTC granični trenutak: 07:00:00Z. |

Očekivanja računati nezavisnim fixture podacima, ne pozivanjem iste funkcije koju testiramo. Kod novca porediti celobrojne pare, ne približne decimalne vrednosti.

## 5. Matrica svih funkcija

### Katalog, izbor i korpa — brif §1, strane 1–2

| ID | P | Scenario | Očekivani rezultat | Sloj |
|---|---|---|---|---|
| T-01 | P1 | Katalog, filteri i svaki aktivan proizvod; neaktivan i nepostojeći slug. | Naziv, jedinica, cena i dostupnost se slažu; javno se ne nudi neaktivan artikal; nepoznat slug daje 404. | I/E |
| T-02 | P0 | Jednokratno → mesečna pretplata → weekly/biweekly → količina, zasebno za svaki artikal. | Ritam se bira samo kod pretplate; promena jednog reda ne menja druge. | U/I/E |
| T-03 | P1 | 2/4/8 L, proizvoljna količina, 0, negativna, decimalna, maksimum i maksimum+1; proizvod u komadima. | Jasne granice iste na UI/API; nema tihog drugačijeg broja ili pogrešne jedinice. | U/I/E |
| T-04 | P0 | Primer iz brifa: 3 L weekly + jogurt biweekly + sir jednokratno. | Tačne stavke, datumi i zbir iz kontrolnog obračuna. | I/E |
| T-05 | P0 | Isti SKU dodati u različitim ritmovima i jednokratno. | Identitet reda čuva režim/ritam; spajaju se samo semantički iste stavke. | U/I/E |
| T-06 | P1 | Izmena/brisanje reda, prazna korpa, refresh, Back, zatvaranje i povratak, oštećen storage. | Korpa ostaje tačna ili se bezbedno oporavi sa jasnom porukom; nema blokiranog ekrana. | E |
| T-07 | P0 | Promeniti cenu/dostupnost u adminu dok je proizvod u korpi; falsifikovati klijentski total. | Server ponovo obračunava; promena je vidljiva pre potvrde; nedostupan artikal se ne naplaćuje. | I/E |

### Checkout i način plaćanja — brif §7, strane 4–5

| ID | P | Scenario | Očekivani rezultat | Sloj |
|---|---|---|---|---|
| T-08 | P1 | Obavezna polja, ćirilica/latinica, dijakritika, duga adresa, sprat/interfon, autofill, neispravan email/telefon. | Upotrebljivi podaci stižu do admina i izvoza; greška je uz polje, unos ostaje sačuvan. | I/E/R |
| T-09 | P0 | Podržan/nepodržan poštanski broj, promena broja posle quote-a, nepodudaran grad, nedostupan servis. | Potvrda poštuje serversku zonu; nedovršen ili zastareo quote ne odobrava pogrešnu kupovinu. | I/E |
| T-10 | P0 | Jednokratna gotovina i mesečna gotovina sa više termina. | Status ostaje pending do potvrde prijema; mesečni iznos naplaćuje se jednom pri prvoj dostavi. | I/E/R |
| T-11 | P0 | Dupli klik, isti ključ/isto telo, isti ključ/drugo telo, istovremeni zahtevi. | Jedna porudžbina i jedna naplata; konflikt vraća 409 bez dodatnog efekta. | I/E |
| T-12 | P0 | Prekid mreže posle uspešnog upisa; refresh potvrde; retry posle validacione greške i promene podataka. | Kupac saznaje ishod bez duplikata; novi legitimni pokušaj ne ostaje zarobljen starim ključem. | I/E |
| T-13 | P0 | PAN/CVV/expiry u payload-u, neispravan token, prevelik i nevažeći JSON. | Zahtev se odbija pre naplate/upisa; osetljivi podaci se ne pojavljuju u bazi, logu ili analitici. | I |
| T-14 | P0 | Kartica: success, decline, 3DS success/fail, abandon, timeout, povratak Back. | Ishod potvrđuje verifikovan provider događaj/lookup; return URL ne glumi uplatu. | S/E |
| T-15 | P0 | Dupli/out-of-order webhook, pogrešan potpis, iznos/valuta/order, stari replay. | Dozvoljene promene stanja samo jednom, uz vezu na pravu transakciju; nema dvostrukog računa ili purchase-a. | I/S |
| T-16 | P0 | Refund i delimični refund ako ga ugovor podržava; admin menja već plaćen/refundiran status. | Dozvoljena tranzicija i usaglašeni order/payment/fiscal/ledger podaci; ne prepisivati istoriju bez korekcije. | I/S/R |

### Prijava i korisnički nalog — brif §2, strana 2

| ID | P | Scenario | Očekivani rezultat | Sloj |
|---|---|---|---|---|
| T-17 | P1 | Poznat/nepoznat email, neispravan unos, mnogo zahteva. | Generična potvrda ne otkriva postojanje kupca; validacija/rate limit daju razumljivu poruku. | I/E |
| T-18 | P0 | Važeći/istekao/iskorišćen magic link, dva istovremena exchange-a. | Najviše jedno uspešno korišćenje; nova prijava moguća bez poziva podršci. | I/E |
| T-19 | P0 | Sesija, isteklost, odjava, dva uređaja, povratak Back posle odjave. | Sesija se čuva u zaštićenom cookie-ju; odjavljena sesija više nema pristup privatnim podacima. | I/E |
| T-20 | P0 | Kupac A pokušava da čita/menja pretplatu i artikal kupca B; nedostajući/tuđ Origin. | Nema pristupa ni curenja podataka; nijedna promena kod B. | I |
| T-21 | P1 | Novi kupac, više pretplata, pauzirana/otkazana pretplata, nema naredne dostave. | Nalog odmah pokazuje stvarni sledeći datum, samo dospele artikle, količine i relevantno prazno stanje. | I/E |

### Svaka izmena pretplate — brif §2–3 i §7, strane 2 i 5

Za svaki T-22–T-31 koristiti novu pretplatu i varijante neplaćen/plaćen mesec, pre/na/posle roka, dupli zahtev i dva prozora. Proveriti i email iz odgovarajuće promene.

| ID | P | Scenario | Očekivani rezultat | Sloj |
|---|---|---|---|---|
| T-22 | P0 | Povećati/smanjiti količinu. | Otvorena projekcija i finansijska razlika odgovaraju tačno preostalim terminima. | U/I/E |
| T-23 | P1 | Dodati novi proizvod u postojeću redovnu pretplatu. | Može se izabrati ritam i količina; proizvod se ponavlja od dogovorenog prvog termina. Trenutno funkcionalni nedostatak. | I/E |
| T-24 | P1 | Ukloniti jedan pa poslednji proizvod. | Nema uklonjenog artikla u budućoj projekciji; poslednji artikal ne ostavlja naplativu praznu pretplatu. | I/E |
| T-25 | P0 | Dodatak samo narednoj dostavi. | Posebna jednokratna stavka i obračun; ista fizička dostava; dodatak nestaje posle potrošnje, ne ponavlja se. | I/E |
| T-26 | P0 | Weekly → biweekly i obrnuto; različit početni datum artikala. | Menjaju se samo budući stvarni termini tog artikla; anchor ne pomera pogrešno druge stavke. | U/I/E |
| T-27 | P0 | Preskočiti sledeću isporuku u mešovitoj pretplati. | Preskače se tačan termin; ritmovi i jednokratni dodatak slede O-03; nema pogrešne naplate dostave. | I/E |
| T-28 | P0 | Pauza do budućeg datuma, do datuma dostave, preko meseca, nevažeći/prošli datum. | Nijedan termin u pauzi nije naplaćen/isporučen; nastavak na prvom važećem terminu prema dogovorenom pravilu. | U/I/E |
| T-29 | P0 | Ručni nastavak i automatsko isticanje pauze, uključujući već zaključan datum. | Jedna aktivacija i jedan budući plan; nema nenamernog menjanja zaključanog snapshot-a. | I/E |
| T-30 | P0 | Trajno otkazivanje aktivne i pauzirane pretplate. | Nema budućih ciklusa; već zaključana dostava po O-06; terminalno otkazana pretplata se ne oživljava. | I/E |
| T-31 | P0 | Dve stvarno istovremene promene sa istom verzijom i različitim ključevima. | Jedna promena prolazi, druga konflikt; nema duplog kredita, emaila ili gubitka tuđe izmene. | I/E |
| T-32 | P1 | Greška API-ja dok se menja količina/ritam; brzo menjanje više polja. | Sačuvano stanje je jasno, neuspeh nije prikazan kao uspeh; fokus i unos ostaju upotrebljivi. | E |

### Kalendar, obračun i kredit — brif §3 i §7, strane 2, 4–5

| ID | P | Scenario | Očekivani rezultat | Sloj |
|---|---|---|---|---|
| T-33 | P0 | Meseci sa 4/5 termina, početak usred/na kraju meseca, februar/prestupna godina, prelaz godine. | Broj stvarnih termina i račun odgovaraju nezavisnom kalendaru. | U/I |
| T-34 | P0 | Promene sata mart/oktobar, ponoć, druga browser zona i cutoff ±1 s. | Rok važi u Beogradu i isti je u svakom prikazu i server proveri. | U/I/E |
| T-35 | P0 | Dva pokretanja monthly billing-a, dva workera, restart posle naplate. | Jedan račun/naplata po pretplati i mesecu; nastavak pronalazi prethodni ishod. | I/S |
| T-36 | P0 | Tokenizovana recurring naplata: success, decline, istek/revokacija tokena, retry. | Bez ponovnog unosa kartice kada je podržano; neuspeh i buduća dostava slede O-04. | S/E |
| T-37 | P0 | Kredit za smanjenje, uklanjanje, skip, pause, cancel plaćene pretplate. | Potpisana razlika za tačan ostatak; kredit nije dupliran; uključiti odluku o trošku dostave. | U/I |
| T-38 | P0 | Kredit manji/jednak/veći od sledećeg računa; negativno usklađenje. | Tačno prebijanje, višak prelazi dalje, nema negativne kartične naplate; doplata po O-02. | U/I |
| T-39 | P0 | Promena cenovnika, pretplatničke cene i popusta tokom plaćenog meseca. | Istorijski obračun ostaje stabilan; buduća cena i eventualna korekcija eksplicitno određene. | I |
| T-40 | P0 | Jedna adresa/termin sa više pretplata, jednokratnom stavkom i dodatkom. | Trošak dostave odgovara O-07; nijedan termin nije preskočen ili naplaćen dvaput. | U/I |

### Priprema, zaključavanje i Spoke — brif §5–6 i završetak, strane 3–4 i 9

| ID | P | Scenario | Očekivani rezultat | Sloj |
|---|---|---|---|---|
| T-41 | P1 | Izabrati dan bez podataka; generisati praznu i popunjenu listu. | Normalno prazno stanje; jedan jasan korak do zbira, kupaca i izvoza. | I/E |
| T-42 | P0 | Promeniti kupčevu količinu/dodatak/ritam pre roka, pa otvoriti listu i izvoz. | Ista nova vrednost u korisničkom nalogu, projekciji, zbiru, CSV i XLSX; bez ručnog sređivanja. | I/E |
| T-43 | P0 | Regenerisati istim i novim ključem, dva paralelna joba. | Bez duplikata; otvorena projekcija se osvežava kontrolisano. | I |
| T-44 | P0 | Zaključavanje pre/na/posle roka, force override i izmena u istom trenutku. | Dozvoljena jedna konzistentna finalna verzija; override beleži identitet i razlog; nema polovičnih podataka. | I/E |
| T-45 | P0 | Pokušati regenerisanje/izmenu zaključane dostave; ponoviti lock. | Snapshot ostaje isti; dodatak se troši i naredni datum pomera tačno jednom. | I |
| T-46 | P0 | Uporediti sve kupce sa zbirom robe, litrama/komadima, otkazanim i nedospelim stavkama. | Zbir po SKU i jedinici jednak zbiru redova finalne dostave. | I/R |
| T-47 | P1 | CSV/XLSX: sva polja iz brifa, 0/1/mnogo kupaca, čćžšđ, ćirilica, vodeća nula, zarez/navodnik/novi red. | Potpune kolone, ispravne jedinice, telefon ostaje tekst, dva XLSX lista; formula-like unos se ne izvršava. | I/R |
| T-48 | P0 | Stvarni import CSV/XLSX formata koji Spoke nalog podržava. | Adrese, napomene, proizvodi, količine i ID-ovi pravilno mapirani bez ručnog prepisivanja; sačuvan import dokaz. | S/R |

### Administracija — brif §9, strane 5–6

| ID | P | Scenario | Očekivani rezultat | Sloj |
|---|---|---|---|---|
| T-49 | P1 | Dodati/izmeniti proizvod, slug, fotografiju, jedinicu, SEO, cenu i dostupnost; dupli slug i nevažeće vrednosti. | Katalog i novi quote ažurni; istorijske porudžbine netaknute; validacija i audit postoje. | I/E |
| T-50 | P1 | Kupci, aktivne/pauzirane/otkazane pretplate, porudžbine za datum, naredne dostave. | Filteri i brojevi imaju jasno značenje i odgovaraju bazi; prazna/velika lista ostaje upotrebljiva. | I/E |
| T-51 | P0 | Ručno promeniti kupčevu porudžbinu: stavka/količina/adresa/napomena i otkazivanje. | Kontrolisana korekcija obračuna, projekcije, izvoza i obaveštenja; ograničenja zaključanog termina jasna. | I/E |
| T-52 | P0 | Promeniti cutoff, dan/vreme, zone, cenu/prag dostave i kapacitet; nevažeće vrednosti. | Samo dozvoljene vrednosti; svi ekrani/jobovi koriste isto pravilo, postojeći snapshot-i ostaju stabilni. | U/I/E |
| T-53 | P0 | Admin prijava/odjava, uloge, MFA, pogrešan ključ i direktan API poziv običnog kupca. | Neovlašćeni zahtev nema efekat; produkcioni identitet zamenjuje lokalni shared-secret pristup. | I/E/S |
| T-54 | P1 | Dashboard prihod, broj porudžbina, pretplate, LTV i marža ako su prikazani. | Formula svakog pokazatelja dokumentovana; paid/pending/refund i troškovi se ne mešaju. | U/I/R |

### Obaveštenja, fiskalizacija i automatizacija — brif §4 i §8, strane 3 i 5

| ID | P | Scenario | Očekivani rezultat | Sloj |
|---|---|---|---|---|
| T-55 | P1 | Kreiranje porudžbine i aktivacija pretplate. | Oba zahtevana događaja pokrivena jasnim emailom/emailovima; tačni iznos, režim, datum, rok i link. | I/S |
| T-56 | P1 | Svaka izmena, skip, pause, resume, cancel i neuspešna izmena. | Po jedan odgovarajući email po uspešnoj promeni; za neuspeh nema lažne potvrde. | I/S |
| T-57 | P1 | Podsetnik pre dostave, promena termina/roka, dupli cron, pauzirana/otkazana pretplata. | Podsetnik stiže pre roka i sa važećim datumom; nema zastarelih/duplih poruka. | U/I/S |
| T-58 | P1 | Email domen, inbox/spam, bounce/suppression, scan linka i mobilni prikaz. | Email je čitljiv, link radi za kupca i ne troši ga automatski prefetch ako to mail klijent radi. | S/R |
| T-59 | P0 | Badi tok za jednokratnu i mesečnu kupovinu, karticu/gotovinu, dodatak i korekciju. | Tačan fiskalni događaj prema odobrenom modelu; račun i iznos povezani sa naplatom i porudžbinom. | I/S/R |
| T-60 | P0 | Badi timeout posle izdavanja, dupli zahtev, neuspešan email, refund i ponovno slanje PDF-a. | Jedan fiskalni dokument po događaju; resend ne izdaje novi račun; korekcija ima trag. | I/S |
| T-61 | P0 | Dva outbox workera, provider 429/500, restart između koraka i ručni retry. | Claim sprečava paralelnu obradu; kontrolisani backoff; trajna greška je vidljiva; nema duplih spoljnih efekata. | I/S |
| T-62 | P0 | Scheduler na staging-u: dan dostave, prvi dan meseca, propušten run i ponovno pokretanje. | Okidač je stvarno registrovan i poziva posao; nadoknada propuštenog rada je dokumentovana i proverena. | I/S/R |

### SEO, stranice, analitika i izvori — brif §10–13, strane 6–8

| ID | P | Scenario | Očekivani rezultat | Sloj |
|---|---|---|---|---|
| T-63 | P1 | Sve postojeće javne rute, footer, FAQ, Kontakt i Gde kupiti. | Linkovi i telefon rade; tekstovi o terminima/ceni/ambalaži usaglašeni; lokacije i tvrdnje imaju stvarne izvore. | E/R |
| T-64 | P1 | Title/description/H1–H3/canonical, SSR katalog/proizvod, JSON-LD, 404. | Sadržaj i cena u početnom HTML-u; tačna schema; jedinstveni javni metadata i stvarni 404. | I |
| T-65 | P1 | Sitemap/robots/noindex, novi i neaktivan artikal, UTM URL i produkcioni domen. | Samo dozvoljeni canonical URL-ovi; privatne/transakcione strane nisu indeksabilne. | I/S |
| T-66 | P1 | Search Console povezivanje i dodavanje novog SEO sadržaja. | Verifikovan pravi domen, sitemap prihvaćen, urednik ima definisan održiv postupak objave. | S/R |
| T-67 | P1 | Nov posetilac: bez odluke, neophodno, analytics, sve, povlačenje, oštećen storage. | Izbori se izvršavaju stvarnim UI-jem; storage i mreža poštuju kategorije; povlačenje važi i za buduće queued slanje. | I/E/S |
| T-68 | P1 | view_item/list, add_to_cart, begin_checkout, payment info, subscription izbor i ritam. | Jedan događaj po radnji; pravi item ID, količina, valuta, vrednost i režim; GA4/GTM/Meta/Ads gde su uključeni. | E/S |
| T-69 | P0 | Purchase za cash pending, card paid, ručnu potvrdu cash-a, webhook replay i refresh. | Prihod tek po potvrđenoj uplati; stabilan transaction/event ID; tačne stavke i vrednost; deduplikacija između kanala slanja. | I/S |
| T-70 | P1 | Aktivacija/pauza/nastavak/otkaz pretplate i korišćenje promo koda. | Događaj samo za stvarno prihvaćenu radnju; odbijena promena ne pravi uspešnu konverziju. | I/E/S |
| T-71 | P1 | Svaki izvor iz brifa: oglasi/organski IG, Google Ads/organic, direct, email, WhatsApp, influenser, QR i kampanja. | Kontrolni UTM linkovi daju očekivani first/last touch; payment povratak ne preuzima izvor prodaje. | U/E/S |
| T-72 | P1 | Put poseta → proizvod → korpa → checkout → plaćanje; različit consent i blokiran tracker. | Izveštaj po kanalu sadrži dozvoljene merljive korake i prihod; nema PII; nemerene posete nisu prikazane kao potpuna atribucija. | I/S/R |

### Već postojeće dodatne funkcije — regresija postojećeg obuhvata

Ove funkcije postoje u projektu i treba ih proveriti; nisu novi zahtevi koji se dodaju dizajnu.

| ID | P | Scenario | Očekivani rezultat | Sloj |
|---|---|---|---|---|
| T-73 | P0 | Promo: procentualni/fiksni, minimum, neaktivan, istekao, limit, poslednja upotreba paralelno, replay. | Popust i broj korišćenja tačni; ne prelaze dozvoljeni iznos/limit; stari račun se ne menja. | U/I/E |
| T-74 | P1 | Paket: dodavanje, promena/brisanje paketa, nedostupna stavka i različiti ritmovi. | Stvarne stavke i cene se prenose u korpu; nema tihog nepotpunog paketa. | I/E |
| T-75 | P1 | Sačuvana korpa, recovery link, promenjena cena, opt-out, kupovina pre podsetnika. | Vraća se dozvoljena korpa sa aktuelnim quote-om; nema podsetnika posle završetka/odjave; bez izlaganja kontakta. | I/E |
| T-76 | P0 | Konverzija jednokratne porudžbine u pretplatu; istekao/upotrebljen token i konkurentni klik. | Jedna eksplicitna nova pretplata, jasan ritam/prvi termin; istorijska porudžbina se ne naplaćuje opet. | I/E |
| T-77 | P0 | `slow_down` i ostale retention akcije u već plaćenom mesecu. | Obračun i termini konzistentni kao pri pojedinačnoj promeni ritma; otkazivanje je i dalje jednostavno dostupno. | I/E |
| T-78 | P1 | WhatsApp priprema/queue uz isključen stvarni kanal. | Nema obećanja da je poruka poslata; UI prikazuje samo raspoloživu funkciju; buduća integracija ima odvojene testove. | I/E |

### Kvalitet celog sistema

| ID | P | Scenario | Očekivani rezultat | Sloj |
|---|---|---|---|---|
| T-79 | P1 | Svi ključni ekrani i stanja na matrici širina/browsera, mobilna tastatura, safe-area i 200% tekst. | Bez odsečenih cena, preklapanja i horizontalnog scroll-a sadržaja; kontrole rade na dodir. | E/R |
| T-80 | P1 | Tastatura, fokus, modali, validacija, status poruke, VoiceOver/NVDA, kontrast. | Kupovina i upravljanje pretplatom mogu se završiti bez miša; jasni nazivi i čitljiv redosled. | E/R |
| T-81 | P1 | Vizuelne regresije: idle/loading/empty/error/success/disabled/locked/conflict. | Kontrolisane referentne slike; svaka značajna razlika pregledana, ne automatski prihvaćena. | E/R |
| T-82 | P1 | Početna, prodavnica, proizvod, korpa, checkout i nalog na mobilnoj mreži/CPU profilu. | Ispunjeni performance kriterijumi ispod; greška mreže ne gubi porudžbinu/unos. | E/R |
| T-83 | P0 | IDOR, XSS, SQL unos, CSRF, rate limit, validacija upload/URL polja, HTTP headeri i tajne. | Bez pristupa tuđim podacima/izvršavanja unosa; nalaz sa jasnim dokazom i popravkom. | I/E/R |
| T-84 | P0 | Migracija/rollback, backup/restore i finansijsko usaglašavanje. | Obnovljena baza čuva porudžbine, kredite i idempotency; ponovljen posao ne naplaćuje ponovo. | I/S/R |
| T-85 | P1 | Kontrolisan staging load i istovremena priprema/checkout. | Zbir i novac ostaju tačni; izmereni p95/greške/ograničenja i opravdan kapacitet. | I/R |
| T-86 | P0 | Potpuna proba „Dostave za petak“. | Od naručivanja preko izmene i naplate do zbira, finalne liste, Spoke importa i računa: svi podaci se slažu. | I/E/S/R |

## 6. Konkretno proširenje automatizacije

Zadržati postojeće korisne testove. Dodati ponašanje koje nedostaje, bez prepisivanja istih provera u više testova.

| Predloženi paket | Pokriće |
|---|---|
| `tests/commerce-d1.test.mjs` | Prave transakcije checkout-a, idempotency, promene cene, promocije i konkurentnost. |
| `tests/subscriptions-d1.test.mjs` | Sve mutacije, dve sesije, kredit, anchor, dodatak, završna stanja. |
| `tests/billing-deliveries-d1.test.mjs` | Obračun, zaključavanje, scheduler, zbir, izvoz i oporavak. |
| `tests/providers-sandbox/` | Ugovori izabranog payment-a, Badi-ja, emaila i Spoke-a; zaseban kontrolisan run. |
| `tests/e2e/purchase.spec.ts` | Jednokratno, monthly weekly/biweekly, mešovita korpa i mrežni neuspeh. |
| `tests/e2e/account.spec.ts` | Prijava, odjava i svaka korisnička izmena kroz UI. |
| `tests/e2e/admin-deliveries.spec.ts` | Proizvod/cenovnik/porudžbina, dan dostave, zbir i izvoz. |
| `tests/e2e/consent-analytics.spec.ts` | Stvarne consent radnje, storage/network i funnel payload-i. |
| `tests/e2e/visual-accessibility.spec.ts` | Dogovoreni referentni ekrani/stanja, axe i fokus. |

Na svakom PR-u: lint, postojeći build/test, novi deterministički P0/P1 testovi i osnovni E2E. Pre kandidata za objavu: puna browser matrica, ručni accessibility i operativni UAT. Sandbox testovi sa tajnama pokreću se u odvojenom kontrolisanom poslu. CI prilaže HTML izveštaj, trace/screenshot greške i identitet build-a; neuspeh ne prolazi kroz ignorisanje ili beskonačan retry.

## 7. Merljivi uslovi prihvatanja

- Svih 13 oblasti brifa i svi redovi T-01–T-86 imaju rezultat ili konkretno obrazložen BLOCKED/N/A; svaka varijanta P0/P1 ima trag izvršavanja. Za objavu nema otvorenog P0/P1.
- Tačan obračun u svim kontrolnim primerima i nula duplih porudžbina, naplata, fiskalnih dokumenata ili knjiženja kredita.
- Finalni zbir robe = zbir po kupcima = sadržaj CSV/XLSX = prihvaćen Spoke import.
- Accessibility cilj: WCAG 2.2 AA uz ručnu proveru; kontrast najmanje 4,5:1 za običan i 3:1 za veliki tekst, uz proveru fokusa i kompletnih tokova. Nula ozbiljnih/kritičnih axe nalaza nije sama po sebi dokaz celog standarda. [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- Performance cilj na 75. percentilu realnih poseta: LCP ≤2,5 s, INP ≤200 ms, CLS ≤0,1. Pre objave koristiti najmanje tri merena mobilna laboratorijska prolaza po ključnoj ruti sa zabeleženim uslovima; TBT je dijagnostički lab pokazatelj, ne zamena za INP. RUM kriterijum potvrđuje se kada postoji dovoljan uzorak. [Web Vitals](https://web.dev/articles/vitals)
- Bez otvorenih kritičnih/visokih security nalaza; napraviti svež online dependency i secret scan. Offline audit nije potpun dokaz. Bezbednosne provere organizovati prema [OWASP WSTG](https://owasp.org/www-project-web-security-testing-guide/).
- Load profil dogovoriti iz očekivanog obima; ako ga nema, početna simulacija je 20 paralelnih sesija tokom 15 minuta i nalet 50. To je početno merenje, ne garancija kapaciteta. Predloženi cilj za interni API bez čekanja eksternog servisa: p95 <1 s i <1% neočekivanih 5xx, uz nula narušenih poslovnih invarijanti.

## 8. Redosled izvršavanja zajedno sa dizajnom

Procena za jednog iskusnog izvođača koji pokriva razvoj i dizajn: približno **20–30 radnih dana** za audit, proširenje provera, dizajn, implementaciju i završni UAT, uz ažuran postojeći projekat. To je početna procena; novi bankarski adapter, veće promene rasporeda i čekanje poslovnih materijala/naloga računaju se zasebno. Reprocena posle faze 2.

| Faza | Rad | Uslov za nastavak |
|---|---|---|
| 1. Zahtevi i baseline, 1–2 dana | Snapshot, popis 13 oblasti, postojeći testovi, odluke O-01–O-08 i nezavisni fixture-i. | Jasna mapa dokazanog, nedostajućeg i spoljnog obuhvata. |
| 2. Kritični domen, 3–4 dana | Stvarni D1 testovi novca, svih mutacija, konkurentnosti i delivery projekcije; popis defekata. | Poznat rizik i redosled popravki; nema skrivanja nedostajućih funkcija kroz mock. |
| 3. UX i vizuelni sistem, 3–4 dana | Plan dizajna, ključni mobilni ekrani, prva kratka proba upotrebljivosti. | Jasan izbor/iznos/termin; sistem komponenata i vizuelni pravac spremni. |
| 4. Implementacija i popravke, 7–11 dana | Zatvaranje funkcionalnih nedostataka i primena dizajna po tokovima. | Svaki dovršen tok ima prolaz svog regresionog seta. |
| 5. Integracije i operativni UAT, 3–5 dana | Sandbox, računi, email, tracking i Spoke, sa dostupnim pristupima. | Usaglašen novac, priprema, lista, dokumenti i izveštaji. |
| 6. Završna regresija, 3–4 dana | Browseri/telefoni, accessibility, performanse, restore/rollback i završni izveštaj. | T-86 prolazi i ispunjeni uslovi prihvatanja. |

Završna isporuka izvršavanja: matrica rezultata, lista defekata i popravki, automatizovani izveštaji, vizuelni dokaz glavnih ekrana, sandbox dokaz integracija, operativno uputstvo i jasan zaključak spremnosti. Postojeće spoljne uslove iz `docs/acceptance.md` povezati sa novim dokazima, bez ponovnog proglašavanja nezavršenih integracija završenim.
