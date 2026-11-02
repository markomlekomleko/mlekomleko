# Jednostavni admin panel

Aktuelne dopune od 2. novembra: [gotovina pri prvoj dostavi, grupne potvrde, uvoz i uslovi objave](marko-release-2026-11-02.md). Za gotovinski paket ne važi starije ograničenje pripreme samo posle uplate.

## Organizacija admina

- **Početna**: datirani pregledi današnjeg i sledećeg termina, priprema, naplata, potrebne provere i poslednje promene. Ako je sledeći termin danas, prikazuje se samo jednom. Greška pri učitavanju ne predstavlja prazan spisak.
- **Porudžbine**: pretraga i svi postojeći filteri, statusi u spisku; izmena naplate/statusa, stavke i CSV/Excel potvrde u detaljima. Na telefonu su redovi kartice. Filteri ostaju sačuvani pri zatvaranju detalja i prelasku u drugu celinu tokom iste prijave.
- **Dostave**: izabrani datum i zbir, „Promeni datum“ otvara kalendar. „Pakovanje“ sadrži proizvode, izvoze, podsetnike i zaključavanje. „Razvoz“ sadrži adrese, telefon, naplatu i punu/delimičnu potvrdu uručivanja. Datum ostaje izabran pri povratku.
- **Kupci**: „Spisak kupaca“ i „Preostale količine“. U detaljima kupca: Podaci, Porudžbine, Redovne dostave, Istorija. Izmena adrese, količina, preskakanje, pauza i nastavak koriste postojeća pravila.
- **Izveštaji**: sva postojeća analitika, periodi, grafikoni, marketing, vrste porudžbina i trenutno stanje pretplata. Klik na grafikon otvara odgovarajuće filtrirane porudžbine.
- **Podešavanja**: izbor devet celina umesto jedne duge stranice. Svaka otvara postojeći editor; „Sva podešavanja“ vraća na izbor. Vidljivost prati postojeću ulogu.

Na telefonu je navigacija pri dnu: Početna, Porudžbine, Dostave, Kupci, Još. Pod „Još“ su Izveštaji i Podešavanja. Na računaru sve celine su u bočnoj navigaciji. Admin nema obavezan korak-po-korak režim.

## Kontrolni spisak očuvanih informacija i akcija

| Prethodna informacija / radnja | Novo mesto |
| --- | --- |
| Današnji kupci, količine, proizvodi i vrste dostava | Početna → Danas; kupci i vrste su u imenovanom proširenju |
| Sledeći termin, proizvodi i zaključan/otvoren spisak | Početna → Sledeći termin; objedinjeno sa Danas kada je isti datum |
| Gotovinske porudžbine sa datumom sledeće dostave | Početna → Potrebne provere → filtrirane Porudžbine |
| Preostali obračuni redovne dostave | Početna uz poseban opis obuhvata; Dostave → Razvoz po kupcu |
| Problemi slanja i obrade | Početna → Potrebne provere → Tehničke operacije |
| Poslednje promene | Početna → Poslednje promene |
| Sve prodajne metrike, poređenja, grafikoni, marketing i stanje pretplata | Izveštaji |
| Status naplate, status dostave, fiskalni status/broj, CSV/XLSX potvrde, stavke | Porudžbine → Otvori porudžbinu |
| Ručni unos postojećeg ili novog kupca | Nova porudžbina; takođe Podaci kupca |
| Kalendar, datumi i projekcije | Dostave → Promeni datum |
| Zbirna priprema, pakovanje, Excel/CSV i podsetnici | Dostave → Pakovanje |
| Zaključavanje i njegova potvrda | Dostave → Pakovanje → Završi pripremu |
| Telefon, adresa, napomena, naplata, pune/delimične/neuspele isporuke | Dostave → Razvoz |
| Pauzirani/preskočeni termini | Dostave → Pauze i preskakanja |
| Kontakt i adresa, porudžbine, redovne dostave i istorija | Kupci → detalji kupca → odgovarajuća celina |
| Napredak paketa i preostale količine svih kupaca | Kupci → Preostale količine |
| Proizvodi, paketi, popusti i sadržaj sajta | Podešavanja → istoimene celine |
| Raspored, rokovi, zona, cene dostave i troškovi | Podešavanja → Dostava i naplata |
| Poslovne evidencije | Podešavanja → Poslovanje |
| Fiskalni servis, spremnost prodavnice, obračuni i poruke | Podešavanja → Fiskalizacija / Provera prodavnice / Tehničke operacije |

API ugovori, baza, serverske dozvole, obračuni i zaključani snimci nisu menjani ovom reorganizacijom.

## Ručne porudžbine

Tri koraka: kupac, proizvodi, datum i potvrda. Cenu računa postojeći `quoteCart`; upis koristi `checkout` sa eksplicitnim serverskim admin opcijama. Novi endpoint zahteva admin sesiju i isti origin, prihvata samo gotovinu, odbija sirove kartične podatke, koristi idempotency ključ i čuva admin audit trag. Ponovljen isti zahtev vraća istu porudžbinu; izmenjen zahtev sa istim ključem se odbija.

Postojeća baza zahteva jedinstveni email. Za telefonskog kupca bez emaila upisuje se nedostavljiva interna adresa na rezervisanom domenu `manual.invalid`, deterministički iz ključa porudžbine. Ona se ne prikazuje u interfejsu niti u izvozu i email adapter je nikada ne šalje. Postojeći kupac se bira po ID-u. Ručna porudžbina ne pravi login kredencijale i ne generiše ponudu sa tokenom za konverziju.

Slanje potvrde je podrazumevano isključeno i dostupno samo uz stvarni email i podešen provider. Rokovi i zaključane dostave važe i za admin unos. Datum forme nudi dozvoljene termine naredna 62 dana. Redovne porudžbine prikazuju obračun paketa od četiri nedeljne ili dve dvonedeljne isporuke, nezavisno od kraja meseca.

## Podsetnici

Pregled pokazuje primaoce, tekst i postojeći status. Slanje radi samo za sutra i uz povezan email provider; u `console` režimu javlja da slanje nije povezano. Obrada je ograničena na podsetnike za izabrani datum, bez obrade nepovezanih naplata ili računa. Stabilan ključ izvor+datum štiti od ponovnog slanja posle regenerisanja spiska. Postojeće preference određuju eventualnu dodatnu WhatsApp poruku.

## Analitika

Periodi: 7 dana, 30 dana, ovaj mesec ili ručni raspon do 366 dana. Datumi poručivanja se računaju u Europe/Belgrade. Linijski grafikon prikazuje trenutno plaćene porudžbine po datumu poručivanja, **ne** vreme kada je uplata stigla. Poređenje koristi prethodni period iste dužine; bez naplate u prethodnom periodu nema procenta.

Količine iz plaćenih porudžbina uključuju sve obračunate termine pretplate. Prikazana jedinica ostaje pakovanje iz kataloga (`broj × jedinica`); različita pakovanja se ne sabiraju kao da su sva litri. Statusi pretplata su trenutno stanje nezavisno od perioda analitike. Ne prikazuje se nepotvrđena dobit.

Razvoz prikazuje preostali nenaplaćeni iznos porudžbina koje pripadaju toj poseti: ceo paket pri prvom uručenju, zatim nulu za već plaćen paket. Dodaci imaju zaseban obračun. Gotovinu potvrđuju vlasnik ili menadžer; vozač potvrđuje uručenje plaćenog paketa.

## Tehničke granice

- Lista kupaca i pretplata učitava do 500 redova; pretraga kupaca pretražuje celu bazu i vraća do 500 rezultata. Filter statusa koristi učitanu listu pretplata.
- Admin prijava ostaje samo u memoriji stranice; refresh zahteva novu prijavu.
- Automatsko osvežavanje je na 15 sekundi samo na vidljivoj stranici, van unosa i otvorenih dijaloga.
- Pravi email/WhatsApp i fiskalni provider nisu deo lokalnih testova. Za stvarno slanje potrebna je njihova zasebna integraciona provera.

## Provera reorganizacije 10. oktobra 2026.

- TypeScript, ESLint i `git diff --check`: prolaze.
- Završni browser/API prolaz: **39/39** scenarija na širinama **390, 768 i 1440 px**. Pokrenuti su `admin-workspace`, `admin-exports` i `account-admin-flows`, uz izostavljen nepovezani test javne mobilne kupovne trake.
- Pokriveni su ručni unos, postojeći kupci, naplata, očuvanje filtera pri povratku, kontakti, količine, preskok/pauza/nastavak, zaključavanje, CSV/XLSX, ponovno prijavljivanje i postojeći editori proizvoda/paketa/popusta/sadržaja.
- Dodatni kontrolisani mrežni scenariji proveravaju spajanje današnjeg/sledećeg termina, grešku i ponovno učitavanje bez lažnog praznog spiska, kao i slanje punih i delimično uručenih količina iz prikaza Razvoz. To su UI provere zahteva/odgovora; nisu test stvarnog vozača ili fiskalnog provajdera.
- Svih devet celina podešavanja provereno je tastaturom i bez horizontalnog prelivanja. Axe na početnoj, izveštajima, razvozu i izboru podešavanja: nema serious/critical nalaza.
- Vizuelno pregledani mobilni, tablet i desktop prikazi. Snimci poslednjeg prolaza su u `output/playwright/admin-check/`.
- Testovi su koristili zasebnu lokalnu bazu i port 4189. Privremena konfiguracija i automatske izmene putanja Next tipova uklonjene su nakon provere.

## Provera 16. septembra 2026.

- TypeScript i ESLint: prolaze. `git diff --check`: bez grešaka.
- Osnovni testovi: **134/134 prolaze**. Worker build je uspešan; posle korekcije mock baze ponovljen je kompletan skup `node --test tests/*.test.mjs`. Mock sada vraća zaključanu dostavu samo za njen stvarni datum.
- Produkcioni Next build u `.next-verify` i runtime testovi: **14 prolazi, 1 preskočen** (PostgreSQL provera bez PostgreSQL test baze).
- Admin browser testovi, širine 390/768/1440: **31 scenario prolazi, 2 uslovno preskočena** (mobilna kupovna traka na većim ekranima). Zajednički prolaz je prvo imao 28 uspešnih i 3 nalaza pristupačnosti grafikona; posle ispravke sva 3 su ponovo uspešna, uključujući stvarne naplaćene test porudžbine. Nema serious/critical axe nalaza na pregledu admina.
- Pokriveni su prava pristupa, isti origin, ponovljeni zahtevi, serverske cene, telefonski kupci, CSV/XLSX, izbor postojećeg kupca, nedeljne/dvonedeljne porudžbine, količine, zastarela verzija pretplate, preskok, pauza/nastavak, adresa, zaključavanje i lokalno onemogućeno slanje podsetnika. Sačuvani su postojeći editori i testovi njihovih izmena.
- Vizuelno su pregledani desktop i mobilni snimci u `artifacts/admin-redesign-2026-09-16/`. Lokalni `/admin` odgovara i prikazuje prijavu bez javnog headera i footera.

Širi E2E paket sajta takođe je pokrenut: tada 36 prolaza, 2 preskoka i 28 padova. Pet padova admina/izvoza otklonjeno je i provereno navedenim ciljanim testovima. Preostalih **23 nalaza na javnim stranicama** nisu otklonjena u ovom admin zahvatu: selektori prijave/navigacije i ponude koji više ne odgovaraju interfejsu, checkout test koji pokušava `fill` na select polju, kontrast javnog footera i očekivanja za hero animaciju. Ceo sajt zato nema potpuno zelen E2E paket; ova provera nije potvrda spremnosti svih javnih stranica za objavu.
