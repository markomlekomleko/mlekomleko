# Jednostavni admin panel

## Svakodnevni rad

- **Pregled**: sledeći kalendarski dan dostave, zbir proizvoda za pripremu, nenaplaćene gotovinske porudžbine sa tim datumom, problemi obrade i poslednje promene. Otvorene dostave su svež pregled bez upisa u bazu; zaključani spiskovi ostaju sačuvani snimci.
- **Porudžbine**: pretraga, dodatni filteri, detalji porudžbine, naplata, status dostave i potvrde CSV/Excel. Grafikoni otvaraju filtrirane porudžbine.
- **Dostave**: pogled za pakovanje ili vozača. Izvoz najpre ažurira otvoreni spisak. „Završi pripremu“ traži jasnu potvrdu zaključavanja, uključujući mogućnost zaključavanja pre redovnog roka. Posle zaključavanja nema tihih izmena spiska.
- **Kupci**: pretraga, filter redovnih dostava, kontakt, istorija, izmena adrese, količine, preskakanje, pauza i nastavak. Pre pauze prikazuje se sledeći datum prema nedeljnom/dvonedeljnom rasporedu.
- **Podešavanja**: sačuvani editori proizvoda, paketa, popusta, sajta i poslovnih pravila. Tehničke operacije su pod „Napredno“.

## Ručne porudžbine

Tri koraka: kupac, proizvodi, datum i potvrda. Cenu računa postojeći `quoteCart`; upis koristi `checkout` sa eksplicitnim serverskim admin opcijama. Novi endpoint zahteva admin sesiju i isti origin, prihvata samo gotovinu, odbija sirove kartične podatke, koristi idempotency ključ i čuva admin audit trag. Ponovljen isti zahtev vraća istu porudžbinu; izmenjen zahtev sa istim ključem se odbija.

Postojeća baza zahteva jedinstveni email. Za telefonskog kupca bez emaila upisuje se nedostavljiva interna adresa na rezervisanom domenu `manual.invalid`, deterministički iz ključa porudžbine. Ona se ne prikazuje u interfejsu niti u izvozu i email adapter je nikada ne šalje. Postojeći kupac se bira po ID-u. Ručna porudžbina ne pravi login kredencijale i ne generiše ponudu sa tokenom za konverziju.

Slanje potvrde je podrazumevano isključeno i dostupno samo uz stvarni email i podešen provider. Rokovi i zaključane dostave važe i za admin unos. Datum forme nudi dozvoljene termine naredna 62 dana. Redovne porudžbine prikazuju obračun svih ugovorenih termina do kraja meseca, ne predstavljaju ga kao cenu jedne dostave.

## Podsetnici

Pregled pokazuje primaoce, tekst i postojeći status. Slanje radi samo za sutra i uz povezan email provider; u `console` režimu javlja da slanje nije povezano. Obrada je ograničena na podsetnike za izabrani datum, bez obrade nepovezanih naplata ili računa. Stabilan ključ izvor+datum štiti od ponovnog slanja posle regenerisanja spiska. Postojeće preference određuju eventualnu dodatnu WhatsApp poruku.

## Analitika

Periodi: 7 dana, 30 dana, ovaj mesec ili ručni raspon do 366 dana. Datumi poručivanja se računaju u Europe/Belgrade. Linijski grafikon prikazuje trenutno plaćene porudžbine po datumu poručivanja, **ne** vreme kada je uplata stigla. Poređenje koristi prethodni period iste dužine; bez naplate u prethodnom periodu nema procenta.

Količine iz plaćenih porudžbina uključuju sve obračunate termine pretplate. Prikazana jedinica ostaje pakovanje iz kataloga (`broj × jedinica`); različita pakovanja se ne sabiraju kao da su sva litri. Statusi pretplata su trenutno stanje nezavisno od perioda analitike. Ne prikazuje se nepotvrđena dobit.

Vozač vidi nenaplaćen iznos jednokratne porudžbine ili, za pretplatu, jasno označen zbir preostalih obračuna. Iznos pretplate nije predstavljen kao cena jedne isporuke.

## Tehničke granice

- Lista kupaca i pretplata učitava do 500 redova; pretraga kupaca pretražuje celu bazu i vraća do 500 rezultata. Filter statusa koristi učitanu listu pretplata.
- Admin prijava ostaje samo u memoriji stranice; refresh zahteva novu prijavu.
- Automatsko osvežavanje je na 15 sekundi samo na vidljivoj stranici, van unosa i otvorenih dijaloga.
- Pravi email/WhatsApp i fiskalni provider nisu deo lokalnih testova. Za stvarno slanje potrebna je njihova zasebna integraciona provera.

## Provera 16. septembra 2026.

- TypeScript i ESLint: prolaze. `git diff --check`: bez grešaka.
- Osnovni testovi: **134/134 prolaze**. Worker build je uspešan; posle korekcije mock baze ponovljen je kompletan skup `node --test tests/*.test.mjs`. Mock sada vraća zaključanu dostavu samo za njen stvarni datum.
- Produkcioni Next build u `.next-verify` i runtime testovi: **14 prolazi, 1 preskočen** (PostgreSQL provera bez PostgreSQL test baze).
- Admin browser testovi, širine 390/768/1440: **31 scenario prolazi, 2 uslovno preskočena** (mobilna kupovna traka na većim ekranima). Zajednički prolaz je prvo imao 28 uspešnih i 3 nalaza pristupačnosti grafikona; posle ispravke sva 3 su ponovo uspešna, uključujući stvarne naplaćene test porudžbine. Nema serious/critical axe nalaza na pregledu admina.
- Pokriveni su prava pristupa, isti origin, ponovljeni zahtevi, serverske cene, telefonski kupci, CSV/XLSX, izbor postojećeg kupca, nedeljne/dvonedeljne porudžbine, količine, zastarela verzija pretplate, preskok, pauza/nastavak, adresa, zaključavanje i lokalno onemogućeno slanje podsetnika. Sačuvani su postojeći editori i testovi njihovih izmena.
- Vizuelno su pregledani desktop i mobilni snimci u `artifacts/admin-redesign-2026-09-16/`. Lokalni `/admin` odgovara i prikazuje prijavu bez javnog headera i footera.

Širi E2E paket sajta takođe je pokrenut: tada 36 prolaza, 2 preskoka i 28 padova. Pet padova admina/izvoza otklonjeno je i provereno navedenim ciljanim testovima. Preostalih **23 nalaza na javnim stranicama** nisu otklonjena u ovom admin zahvatu: selektori prijave/navigacije i ponude koji više ne odgovaraju interfejsu, checkout test koji pokušava `fill` na select polju, kontrast javnog footera i očekivanja za hero animaciju. Ceo sajt zato nema potpuno zelen E2E paket; ova provera nije potvrda spremnosti svih javnih stranica za objavu.
