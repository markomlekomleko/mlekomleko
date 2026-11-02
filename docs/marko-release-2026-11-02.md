# Završetak dogovora sa Markom — evidencija implementacije

**Dopuna posle izričitog zahteva za objavu:** proverena je enkriptovana rezervna kopija i na produkciji je primenjena migracija 0021. Statusi ispod opisuju stanje pre tog zahteva; postupak objave i uputstvo za Marka su u [zapisu objave](deployment-2026-11-02.md).

## Lokalno završeno

- Neplaćen gotovinski paket ulazi u prvu pripremu. Zaključana poseta blokira paralelno pakovanje istog neplaćenog paketa za drugi datum. Neplaćene kartice ostaju isključene.
- Pri prvom uručenju vlasnik ili menadžer potvrđuje stvarno primljenu gotovinu za ceo paket. Uplata, količine, audit i fiskalni događaji čuvaju se zajedno. Prvi zaključani termin se ne pomera zbog evidentiranja uplate.
- Sledeće posete tog paketa imaju nulu za naplatu; zasebni dodaci imaju sopstvene porudžbine. Neuspela poseta ne troši količine. Delimična troši samo uručeno.
- Grupna potvrda gotovine: do 100 porudžbina na stranici, izuzimanje pojedinih, pregled ukupnog iznosa, potvrda stvarnog prijema, verzije i rezultat svake stavke. Grupna potvrda isporuka radi za jedan datum. Ključ ponavljanja čuva rezultat, a poslovne zaštite sprečavaju duplikate posle prekinute veze.
- Fiskalni model iz `fiscal-per-delivery-2026-10-11.md` ostaje: avans paketa i račun po uručenju. Potpuna jednokratna kupovina plaćena baš pri uručenju dobija običan račun. Trening ostaje odvojen od stvarnog rada.
- Kompaktnije kartice; prikaz količine po poseti, ukupne količine, dostave po poseti i zbira pre korpe. Zajednička dostava i popusti konačno se računaju u korpi.
- Galerija kravljeg i kozjeg, jednostavniji tekstovi, povezani linkovi i EN/RU prevodi. Dok Marko ne pošalje fotografije, prazna galerija i postojeće slike pakovanja jasno su označene kao ilustracije. Fotografije se postavljaju kroz postojeći editor proizvoda; galerija dobija potvrđene URL-ove u Sadržaju sajta.
- Inđija postoji u normalizaciji grada, poštanskim proverama i rasporedu. Podrazumevano je isključena. Samo vlasnik menja dane i aktivaciju; aktivacija bez dana se odbija. Novi Sad ostaje petkom.
- Aktiviran raspored Inđije može imati dan izvan beogradskih ruta: izbor kupca, ručni unos, kalendar i zakazani poslovi koriste iste dane. Ponovna jednokratna poseta Novom Sadu posle neuspeha ostaje petkom. Pregled gotovine prati stvarne posete, uključujući ponovljenu posetu i mešovitu korpu bez dupliranja paketa.
- `EMAIL_REPLY_TO` prolazi kroz Resend slanje, uključujući prijavu. Postojeća prijava ostaje jednokratni email kod.
- Jednokratni probni/odobreni uvoz CSV/XLSX, provera kontakata, paketa, starih avansa i preostale vrednosti; bez slanja poruka, naplate i ponovnog izdavanja starog avansa. Ponovljena grupa ne pravi duplikate.
- Izveštaj uređaja procenjuje telefon/tablet/računar prema širini prozora na početku sesije. Microsoft Clarity je pripremljen i ostaje neaktivan bez javnog ID-a projekta i pristanka. Admin, prijava, nalog, checkout i kontakt isključeni su iz snimanja; tekst je maskiran na korenom HTML elementu.

## Šta još zahteva stvarne podatke ili spoljašnju potvrdu

| Zadatak | Potreban ulaz / završni dokaz |
| --- | --- |
| Prave fotografije flaša, krava i koza | Markove datoteke i potvrda da odgovaraju proizvodima; crni poklopac za kozje, beli za kravlje. |
| Konačan tekst | Markova potvrda predloga i činjeničnih tvrdnji. Hero animacija i „Ozbiljna veza ili avantura“ su sačuvani. |
| Inđija | Potvrđeni dani i poštanski brojevi/područje, zatim aktivacija vlasnika. Nije dovoljno promeniti naslov zone. |
| Postojeći kupci | Markov stvarni Excel i usaglašen ostatak količina, novca i fiskalnih referenci. Uvoz još nije primenjen na poslovne podatke. |
| Stari test podaci | Pregled tačno registrovane grupe `test_scenario_customers`, rezervna kopija i plan arhiviranja. Ne birati kupce samo po imenu, domenu emaila ili prefiksu „TEST“. Audit i outbox su trajne evidencije i ne brišu se. Čišćenje stvarne baze nije izvršeno. |
| Resend | DNS pristup, verifikovan pošiljalac, potvrđeno Markovo sanduče za odgovore, stvarni test koda/potvrde/podsetnika/odgovora. Prisustvo ključa nije dokaz prijema. |
| Produkciona baza | Rezervna kopija, poređenje primenjenih migracija sa izvornim checksum-ovima, migracija 0021 i provera referenci. Udaljena baza nije menjana. |
| Fiskalizacija | Potvrda knjigovođe i stvarnog avansnog toka sa Fiscomm-om. Trening dokument ne dokazuje ovo. |
| Domen | Prihvaćen pregled, pristup DNS/Vercel projektu, očuvani email zapisi, proverene HTTPS adrese i stare putanje. Javni domen nije prebačen ovim izmenama. |
| Banka | Markov završen upitnik/ugovor, konkretna API dokumentacija i sandbox pristupi. Posebna potvrda recurring naplate, nezavisno od plaćanja na rate. Kartice i oznake ostaju isključene dok adapter ne prođe testove. |
| Obaveštenje kupcima | Potvrđena lista primalaca i tekst tek kada novi tok stvarno radi. Nacrti ispod nisu poslati. |

## API i zaštita ponavljanja

- `POST /api/admin/orders/bulk-payment`: telo `{confirmed:true,orders:[{id,expectedUpdatedAt}]}` i zaglavlje `Idempotency-Key`. Samo gotovina koja čeka potvrdu, do 100 jedinstvenih porudžbina.
- `POST /api/admin/deliveries/bulk-complete`: `{confirmed:true,date,deliveryOrderIds:[...],cashCollected:boolean}` i isto zaglavlje. Potpune isporuke samo jednog datuma; delimične ostaju na pojedinačnoj potvrdi.
- Rezultat sadrži `results` sa stanjem i razlogom svake stavke, `succeeded` i `failed`. Greška jedne stavke ne poništava uspešne. Neoznačene stavke se ne menjaju.
- Jedan zahtev poseduje obradu istog ključa pet minuta. Istovremeni drugi zahtev dobija `BULK_IN_PROGRESS`; završen zahtev vraća sačuvani rezultat. Posle isteka prekinuta obrada može da se nastavi, a već plaćene/potvrđene stavke se prepoznaju kao ponavljanje.
- Ovlašćenja i naplata proveravaju se na serveru. Pojedinačne izmene, audit i outbox koriste postojeće transakcije i fiskalnu logiku. Runtime za grupne rute traži do 300 sekundi; taj limit treba potvrditi u hosting planu.

## Izvršene provere

- `npm test`: **392/392** prolazi. Pokriveni su prvi gotovinski paket, neuspeh i delimično uručenje, četiri posete, selekcija 47/50, konkurentni/ponovljeni zahtevi, nastavak posle isteka obrade, uvoz, fiskalni offset starih količina i rasporedi gradova.
- Next produkcioni build i HTTP runtime: **18 prolaza, 1 uslovno preskočen** PostgreSQL RLS test u SQLite prolazu.
- Zasebna PostgreSQL test šema: **23/23** prolazi, uključujući RLS, sve migracije i novi tok pripreme/naplate/uvoza. Posle dopune zaštite grupne obrade isti tok dodatno prolazi samostalno. Test šeme su uklonjene; poslovna šema nije migrirana ovim testovima.
- Browser: **25 prolaza na 390/768/1440 px**; dve provere mobilne trake očekivano su preskočene na većim ekranima. Provereni su kupovina, email kod, korpa/checkout, ručni unos, gotovinska grupna selekcija sa izuzetkom, puni/delimični razvoz i podešavanja. Ovo je ciljani skup ključnih tokova, ne tvrdnja da je pokrenut svaki istorijski E2E test projekta.
- Stvarni XLSX u izdvojenoj lokalnoj bazi: probni izveštaj, odobren upis, ponavljanje bez duplikata, nula outbox događaja i odbijanje formula.
- ESLint, TypeScript, `git diff --check` i pregled renderovanih stranica PDF vodiča.
- Ove provere ne potvrđuju stvarni email prijem, javni DNS, produkcioni fiskalni tok ili bankarsko odobrenje.

## Uvoz — postupak

Polazna zaglavlja su u `customer-import-template.csv`. Jedan red predstavlja jednu stavku starog paketa; kupac i zbirni podaci paketa ponavljaju se identično na svim njegovim redovima. Za kupca bez aktivnog paketa popuniti kontakt, a `external_order_id` ostaviti prazno. Email može nedostajati za telefonskog kupca; takav kupac ne može pristupiti nalogu dok mu se ne poveže potvrđena email adresa.

`quantity` je broj pakovanja **po poseti**; `delivered_quantity` je ukupan broj ranije uručenih pakovanja. Ritam `weekly` kupuje 4 posete, `biweekly` 2, `one_time` jednu. Svi iznosi u CSV-u su RSD, sa najviše dve decimale. `net_product_rsd` je ukupna stvarno plaćena vrednost te stavke posle popusta, a ne iznos bez PDV-a. `allocated_delivery_rsd` je njen potvrđeni deo originalne dostave. Zbir svih stavki i dostave mora dati `total_rsd`. `remaining_rsd` mora odgovarati neuručenim jedinicama i njihovom delu dostave.

Za aktivne plaćene pakete obavezni su potvrđeni stari avans, vreme avansa, poreske oznake i originalne vrednosti. `advance_provider=fiscomm` i `advance_mode=live` izričito potvrđuju kompatibilan stvarni avans. Trening i dokumenti drugog servisa traže zasebno fiskalno usaglašavanje; ne prepisuju se automatski kao Fiscomm računi. Ne izmišljati fiskalnu referencu ako Markov izvoz to nema: zaustaviti uvoz paketa i usaglasiti ga sa knjigovođom. Datumi su ISO tekst, ne Excel serijski brojevi. XLSX mora imati jedan list i potvrđene vrednosti bez formula. Čitalac koristi standardni Python 3 bez dodatnih paketa.

```sh
node --experimental-strip-types --env-file=.env.local scripts/import-customers.mjs --file /apsolutno/kupci.xlsx --batch marko-001 --report /apsolutno/probni-uvoz.json
```

Pregledati greške, broj kupaca, paketa, kupljene/uručene/preostale jedinice, punu uplatu i preostalu vrednost. Usaglasiti sa Markovim odobrenim zbirom, sačuvati rezervnu kopiju i isti izvorni fajl. Zatim istu komandu dopuniti sa `--apply --approved-hash HASH_IZ_IZVESTAJA`. Promena izvora ili stanja kupaca zahteva novi pregled; ponovljen isti batch je bez promene. Isti broj stare porudžbine/avansa u drugoj grupi se odbija. Izveštaj se čuva sa lokalnim dozvolama 0600.

## Objava i povratak

Read-only provera povezane PostgreSQL baze 2. novembra: migracije do 0020 imaju odgovarajuće checksum-ove, a **0021_fiscal_deliveries.sql još nije primenjena**. Registrovana je tačno jedna test grupa `admin-scenarios:2026-10-10T10:43:55.036Z`: **26 kupaca, 27 porudžbina, nula fiskalnih računa i nula pokušaja naplate**. Provera nije menjala bazu, čitala sadržaj poruka niti potvrđivala rezervnu kopiju. Ponovljiv alat: `node --env-file=.env.local scripts/database-release-check.mjs`.

1. Završiti Markov pregled i jedan probni radni dan. Potvrditi prvi gotovinski paket 3.400 RSD, neuspešnu/ponovljenu posetu, delimičnu, grupnu naplatu i isporuke, pauzu, preskok i izvoz.
2. U Vercel produkciji postaviti cash-only profil, kanonski `APP_ORIGIN`/`NEXT_PUBLIC_SITE_URL`, Resend konfiguraciju i `EMAIL_REPLY_TO` na **potvrđeno** Markovo sanduče. Ne tretirati primer iz `.env.example` kao dokaz vlasništva ili aktivnog emaila. `node scripts/launch-check.mjs` radi samo lokalnu proveru konfiguracije i ne šalje ništa.
3. Pre migracije napraviti proverenu enkriptovanu rezervnu kopiju baze sa metapodacima migracija. Za PostgreSQL koristiti snapshot provajdera i/ili `pg_dump` u custom formatu; proveriti vraćanje u zasebnu bazu. Tajna konekcija ide kroz zaštićeno okruženje, ne u dokument ili ispis komandne linije. Zabeležiti ID prethodnog Vercel deploy-a i izvesti postojeći DNS.
4. Uporediti migracije, primeniti ih postojećom projektnom skriptom, pa proveriti ključeve i poslednji migration checksum. Migracija 0021 dodaje fiskalne snimke/raspodele; ne pretvara stare račune automatski.
5. Verifikovati Resend DNS dok stari javni sajt još radi. Sačuvati postojeće MX, SPF/DKIM/DMARC; ako SPF već postoji, dopuniti jedan zapis prema stvarnim uputstvima provajdera. Ne praviti drugi SPF zapis.
6. Testirati kod, potvrdu, podsetnik i odgovor u stvarnom test sandučetu. Nema slanja kupcima tokom provere. Proveriti fiskalni tok nezavisno od emaila i banke.
7. Posle prihvaćenog pregleda povezati domen prema tačnim vrednostima iz Vercel projekta, proveriti apex/www, TLS, prijavu i cookie origin. Popisati stvarne stare WordPress putanje i dodati preusmerenja na odgovarajući sadržaj; ne preusmeravati sve slepo na početnu.
8. Nakon provere obavestiti odobrene primaoce i objaviti Instagram poruku. Novu prodaju pratiti u adminu.

Ako provera objave ne prođe: vratiti prethodni Vercel deployment/DNS, zaustaviti nove prijave porudžbina i obrade integracija dok se stanje ne usaglasi. Additive migraciju ne uklanjati naslepo. Rezervna kopija ne sme preko novih stvarnih uplata/porudžbina; prvo izvesti i usaglasiti promene nastale posle kopije. Spoljna naplata ili izdat fiskalni dokument ne nestaju vraćanjem baze.

## Nacrt emaila za postojeće kupce

**Predmet:** Mleko i Mleko — poručivanje na novom sajtu

Zdravo,

Naš novi sajt je spreman: https://mlekoimleko.rs. Na njemu možeš da poručiš mleko i pregledaš naredne dostave. Za ulazak u nalog unesi email na koji stiže ova poruka, pa šestocifreni kod koji pošaljemo.

Ako imaš postojeći plaćeni paket, njegove preostale količine videćeš na nalogu nakon potvrđenog prenosa podataka. Novi paket redovne dostave plaća se gotovinom pri prvom uručenju, za ceo paket; ostale isporuke tog paketa već su plaćene. Dostavu i ukupan iznos vidiš pre potvrde kupovine.

Za pitanje ili ispravku podataka odgovori na ovaj email.

Marko, Mleko i Mleko

*Pre slanja ukloniti uslovnu rečenicu o prenosu tek po završenom usaglašavanju; proveriti stvarni Reply-To, primaoce i kanal za podršku.*

## Nacrt za Instagram

Mleko sada poručuješ i na mlekoimleko.rs. Biraš kravlje, kozje ili oba, količinu i ritam. Jednokratna dostava ili paket od četiri nedeljne / dve dvonedeljne isporuke — ceo paket plaćaš gotovinom pri prvoj dostavi. Dostavu i ukupnu cenu vidiš pre potvrde. Postojeći kupci ulaze email kodom; za pomoć nam pišite kroz kontakt na sajtu.

## Clarity posle pokretanja

Otvoriti projekat, potvrditi strogo maskiranje i zahtev za pristanak, pa tek zatim postaviti `NEXT_PUBLIC_CLARITY_PROJECT_ID` i ponovo izgraditi aplikaciju. Bez pristanka skripta se uopšte ne učitava. URL-ovi sa query/hash parametrima se preskaču. Privatna navigacija zaustavlja recorder i otvara svež dokument; koreni `data-clarity-mask` maskira tekst i tokom prelaza. Proveriti u stvarnom projektu da privatne putanje ne daju snimke. Session replay nije obećanje snimka svakog posetioca. Osnova: [Microsoft ConsentV2](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-consent-api-v2) i [Clarity API / maskiranje](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-api).
