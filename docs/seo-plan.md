# SEO plan za Mleko i Mleko

Verzija: 1.0  
Datum audita: 2. septembar 2026.  
Obuhvat: tehnički SEO, ecommerce SEO, lokalni SEO, sadržaj, autoritet i merenje

## 1. Cilj

Cilj nije samo više poseta, već više porudžbina i redovnih dostava iz organskih
pretraga za Beograd i Novi Sad.

Plan treba da postigne sledeće:

1. Google može pouzdano da pronađe, renderuje i indeksira svaku javnu stranicu.
2. Svaka indeksabilna stranica ima jasnu nameru, jedinstven naslov, opis i jedan H1.
3. Stranice proizvoda u početnom HTML-u prikazuju naziv, cenu, dostupnost, opis,
   fotografiju i strukturirane podatke.
4. Privatne i transakcione rute se ne pojavljuju u rezultatima pretrage.
5. Sajt gradi lokalni autoritet stvarnim dokazima: poreklo, laboratorijska kontrola,
   zone dostave, termini, lokacije i iskustva pravih kupaca.
6. SEO se meri do potvrđene kupovine, a ne samo do pozicije ili klika.

Rangiranje na prvo mesto ne može pošteno da se garantuje. Može se garantovati kvalitet
implementacije, uklanjanje tehničkih prepreka i disciplinovan proces kojim se povećava
verovatnoća visokog rangiranja.

## 2. Trenutno stanje

### Šta već postoji i treba sačuvati

- `lang="sr-Latn"` je pravilno postavljen.
- Sve glavne javne rute postoje i imaju osnovni sadržaj.
- Statičke javne stranice imaju title, description i po jedan H1.
- Početna se serverski renderuje i ima `FAQPage` JSON-LD.
- Globalni Open Graph/Twitter podaci i deljiva 1200 × 630 slika postoje.
- `robots.txt` i `sitemap.xml` postoje.
- Admin i nalog već imaju `noindex`.
- Glavna navigacija, linkovi ka proizvodima i breadcrumb na detalju proizvoda postoje.
- Analitika poštuje consent i već ima osnovne ecommerce događaje.
- Lint, produkcioni build i svih 21 automatizovanih testova prolaze na dan audita.

### Odstupanja od `docs/acceptance.md`

| Acceptance zahtev | Stanje | Glavni nedostatak |
|---|---|---|
| Funkcionalne rute i stanja | Delimično | Postoje lokalna loading/error stanja, ali nema globalnih `not-found`, `error` i `loading` granica; nepostojeći proizvod može postati soft 404. |
| Bez mobilnog overflow-a, dostupne labele i fokus | Delimično | Responsive CSS i brojne labele postoje, ali nema ponovljivog testa na realnim širinama niti Lighthouse/accessibility praga. |
| Jedinstven title, description i jedan H1 | Delimično | Statičke strane uglavnom prolaze; jedinstvenost dinamičkih proizvoda se ne testira, canonical nije deklarisan, a sadržaj proizvoda nije u početnom HTML-u. |
| Privatne rute su `noindex` | Delimično | `/admin`, `/nalog` i potvrda prijave jesu; `/korpa`, `/checkout` i sama prijava nisu. |
| Sitemap/robots i production URL iz env-a | Delimično | Sitemap nema proizvode, `lastModified` je veštački „sada“, a `metadataBase` je hardkodovan umesto da koristi isti validirani env URL. |
| Slike imaju dimenzije, lazy loading i alt | Ne prolazi | Alt uglavnom postoji, ali obični `<img>` elementi nemaju intrinzične `width`/`height`; ključne slike su udaljeni PNG fajlovi bez responsive varijanti. |
| 404/API failure ne otkriva tajne | Delimično | API ugovor je dobar, ali ne postoji namenski 404 ekran i serverski status za nepostojeći proizvod. |

### Najveći SEO rizici u postojećem kodu

1. `/prodavnica` isporučuje loading stanje, a katalog povlači u browseru.
2. `/proizvodi/[slug]` iz servera generiše metadata, ali vidljiv proizvod, cena i opis
   stižu tek kroz klijentski API poziv. To slabi crawl pouzdanost i ecommerce markup.
3. Sitemap navodi samo osam statičkih URL-ova i preskače aktivne proizvode.
4. Nema `Product`/`Offer`, `OnlineStore`/`Organization` ni `BreadcrumbList` strukturiranih
   podataka.
5. Nema eksplicitnih canonical URL-ova ni jednog centralnog production URL helpera.
6. `/korpa` i `/checkout` su indeksabilni po metadata pravilima.
7. CSS aspect-ratio ne zamenjuje HTML dimenzije slike za sprečavanje layout shift-a.
8. Stranice „O nama“ i „Farme“ imaju malo proverljivih podataka o firmi, proizvođačima
   i kontroli kvaliteta. Tvrdnje postoje, ali dokazi još nisu predstavljeni.

## 3. Prioritetni backlog

Procene su razvojni rad, bez čekanja na poslovne podatke, fotografije ili odobrenja.

| ID | Prioritet | Zadatak | Rezultat / kriterijum završetka | Procena |
|---|---|---|---|---:|
| SEO-01 | P0 | Jedan izvor istine za javni URL | Validirani `SITE_URL`/`NEXT_PUBLIC_SITE_URL` koristi metadata, canonical, OG, robots i sitemap; produkcija ne može tiho da padne na localhost; HTTP, www i alternativni hostovi 301 preusmeravaju na jedan HTTPS host. | 1 dan |
| SEO-02 | P0 | Serverski katalog | `/prodavnica` u početnom HTML-u sadrži sve aktivne proizvode, njihove prave linkove, naziv, kratak opis, cenu i dostupnost; filteri ostaju klijentski. | 2 dana |
| SEO-03 | P0 | Serverski detalj proizvoda | Proizvod se učita jednom na serveru i prosledi interaktivnom delu; H1, opis, cena, slika, dostupnost i interni linkovi postoje bez izvršavanja JavaScript-a. | 3 dana |
| SEO-04 | P0 | Tačni statusi i error granice | Nepostojeći/neaktivan slug vraća pravi 404 preko `notFound()`; postoje brendirani `not-found.tsx`, `error.tsx` i relevantni `loading.tsx`; nema stacka, query-ja ni tajni. | 1–2 dana |
| SEO-05 | P0 | Kontrola indeksiranja | Canonical na svim javnim stranama; `noindex` na korpi, checkout-u, prijavi, potvrdi, nalogu i adminu; samo canonical indeksabilni URL-ovi u sitemapu. | 1 dan |
| SEO-06 | P0 | Dinamički sitemap | Svi aktivni proizvodi se dodaju sa stvarnim `updatedAt`; neaktivni, privatni i query/filter URL-ovi se ne dodaju; `lastModified` se ne menja bez izmene sadržaja. | 1 dan |
| SEO-07 | P0 | Ecommerce structured data | Serverski `Product` + `Offer` na svakom proizvodu: canonical URL, naziv, slike, opis, SKU, brand, `RSD` cena i stvarna dostupnost; podaci se poklapaju sa ekranom i checkout-om. | 2 dana |
| SEO-08 | P0 | Entitet i breadcrumb schema | Jedan `OnlineStore`/`Organization` graph na početnoj ili O nama; `BreadcrumbList` na proizvodima i vodičima; validacija bez critical grešaka. | 1 dan |
| SEO-09 | P0 | Slike i Core Web Vitals | Lokalni ili kontrolisani CDN asseti, WebP/AVIF gde je moguće, `width`/`height`, responsive `srcset`, lazy samo ispod prevoja; hero/LCP slika ima visok prioritet. | 2–4 dana |
| SEO-10 | P0 | SEO regresioni testovi | Build test proverava status, canonical, robots, title, description, tačno jedan H1, SSR proizvod, sitemap proizvode i JSON-LD. | 2 dana |
| SEO-11 | P0 | Poverenje i politike | Objavljene stvarne stranice: dostava, plaćanje, reklamacije/povraćaj, privatnost, uslovi i bezbedno čuvanje/upotreba proizvoda; linkovi su u footeru i checkout-u. | 2–3 dana + odobrenje |
| SEO-12 | P1 | On-page prerada ključnih ruta | Novi H1/title/opisi, jasniji uvodi, dokazne sekcije, CTA i interni linkovi prema mapi namere iz ovog plana. | 2–3 dana |
| SEO-13 | P1 | Lokalne landing stranice | Jedinstvene stranice za Beograd i Novi Sad sa stvarnim zonama, terminima, cenom, cutoff-om, FAQ-om i linkom ka kupovini. | 2–3 dana |
| SEO-14 | P1 | Google Search Console i GA4 SEO dashboard | Verifikovan domen, poslat sitemap, segmentirani brand/non-brand izveštaji i funnel organic landing page → purchase. | 1–2 dana |
| SEO-15 | P1 | Google Business Profile | Samo za stvarno podoban/verifikovan poslovni ili service-area profil; tačan NAP, kategorija, usluge, fotografije, radno vreme i proces odgovora na recenzije. | 1 dan + verifikacija |
| SEO-16 | P1 | Prva 4 dokazna sadržaja | Dva komercijalna/lokalna i dva stručna vodiča, svaki sa originalnim fotografijama ili dokazima i stručnom proverom gde je potrebna. | 4–8 dana |
| SEO-17 | P2 | Digitalni PR i relevantni linkovi | Autentične objave i linkovi od farmi, prodajnih lokacija, lokalnih medija i relevantnih partnera; bez kupljenih paketa i direktorijumskog spama. | kontinuirano |
| SEO-18 | P2 | Iteracija CTR-a i konverzije | Na svake 4 nedelje optimizovati stranice sa mnogo impresija, slabim CTR-om ili organskim saobraćajem bez dodavanja u korpu. | kontinuirano |

## 4. Plan informacione arhitekture i ključnih tema

Ovo je početna mapa namere, ne tvrdnja o obimu pretrage. Pre objave novih stranica treba
je potvrditi pomoću Search Console podataka, Google Ads Keyword Plannera i ručne SERP
analize za Srbiju. Primarna fraza ne treba da se ponavlja mehanički; ona određuje odgovor
koji stranica mora da pruži.

| URL | Primarna namera | Glavna tema | Uloga |
|---|---|---|---|
| `/` | Istraživanje + kupovina | domaće mleko sa dostavom | Glavna komercijalna ulazna strana i brend entitet. |
| `/prodavnica` | Kupovina | kravlje i kozje mleko online | Kategorija sa serverskim linkovima do svih proizvoda. |
| `/proizvodi/sveze-kravlje-mleko-1l` | Kupovina proizvoda | domaće kravlje mleko sa dostavom | Cena, dostupnost, poreklo, čuvanje, količina, termini i poručivanje. |
| `/proizvodi/sveze-kozje-mleko-1l` | Kupovina proizvoda | domaće kozje mleko sa dostavom | Ista struktura, ali potpuno specifičan sadržaj i dokazi za kozje mleko. |
| `/dostava-mleka/beograd` | Lokalna kupovina | dostava domaćeg mleka Beograd | Zone/poštanski brojevi, dani, cena, cutoff, povrat flaša i lokalni FAQ. |
| `/dostava-mleka/novi-sad` | Lokalna kupovina | dostava domaćeg mleka Novi Sad | Stvarni novosadski podaci; ne kopija beogradske strane sa zamenjenim gradom. |
| `/gde-kupiti` | Lokalna poseta | mlekomat Beograd / gde kupiti domaće mleko | Tačne lokacije, tip mleka, mapa, pristup i ažuriranost podataka. |
| `/farme` | Poverenje | domaće mleko sa farme | Stvarni proizvođači, način rada, sledljivost, fotografije i kontrole. |
| `/kako-funkcionise` | Razumevanje usluge | redovna dostava mleka | Jednokratno naspram redovnog, termini, promena, pauza i flaše. |
| `/faq` | Uklanjanje prepreka | dostava, čuvanje, flaše, plaćanje | Jedno kanonsko mesto za pune odgovore; početna koristi samo kratke izvode. |
| `/o-nama` | Brend provera | Mleko i Mleko | Pravni identitet, tim, misija, kontakt, iskustvo i zašto poslu postoji. |

Ne treba unapred praviti strane za svaku opštinu. Nova lokalna strana se objavljuje samo
ako postoji stvarna usluga i dovoljno jedinstvenih informacija: područje, raspored,
ograničenja, iskustva kupaca, fotografije ili partneri. U suprotnom bi to bile doorway
stranice bez dodatne vrednosti.

## 5. Predlog on-page mape za postojeće rute

Title vrednosti ispod su bez globalnog dodatka `| Mleko i Mleko`. Konačan prikaz se
proverava u build-u i Search Console-u; broj karaktera je smernica, ne Google pravilo.

| Ruta | Predlog title-a | Predlog H1 |
|---|---|---|
| `/` | Domaće mleko — dostava Beograd i Novi Sad | Domaće mleko na vašoj adresi. |
| `/prodavnica` | Kravlje i kozje mleko — online prodavnica | Izaberite domaće mleko i količinu. |
| kravlje mleko | Domaće kravlje mleko sa dostavom | Domaće kravlje mleko, 1 L. |
| kozje mleko | Domaće kozje mleko sa dostavom | Domaće kozje mleko, 1 L. |
| `/gde-kupiti` | Mlekomati u Beogradu i online dostava | Gde kupiti Mleko i Mleko. |
| `/farme` | Domaće mleko sa farme — poreklo i kontrola | Od domaće farme do vaše adrese. |
| `/kako-funkcionise` | Kako radi redovna dostava mleka | Kako funkcioniše dostava mleka. |
| `/faq` | Česta pitanja o mleku i dostavi | Pitanja o mleku, dostavi i flašama. |
| `/kontakt` | Kontakt | Kontaktirajte Mleko i Mleko. |

Svaka indeksabilna stranica treba da ima:

- jedinstven, opisni title i prirodan meta description sa konkretnom koristi;
- jedan vidljiv H1 koji jasno opisuje sadržaj;
- kratak odgovor na nameru pre prve veće interakcije;
- stvarne činjenice o ceni, dostupnosti, području i rokovima;
- najmanje dva kontekstualna interna linka prema sledećem logičnom koraku;
- relevantnu originalnu fotografiju sa opisnim nazivom fajla, dimenzijama i alt tekstom;
- canonical ka sopstvenom čistom URL-u;
- ažuriranje datuma samo kada je sadržaj stvarno izmenjen;
- odgovarajući JSON-LD koji se u potpunosti poklapa sa vidljivim sadržajem.

## 6. Tehnička specifikacija

### Renderovanje i statusi

- Serverski dohvatiti katalog i proizvod; client komponente koristiti samo za filtere,
  količinu, ritam, korpu i analytics.
- Ne duplirati poziv proizvoda između `generateMetadata` i stranice: koristiti deduplikovan
  server helper/cache u okviru requesta.
- Za nepostojeći ili neaktivan proizvod pozvati `notFound()` pre renderovanja client dela.
- Vratiti stvarni HTTP 404, ne 200 sa porukom „proizvod nije dostupan“.
- Na 5xx prikazati kratku javnu poruku i correlation ID; detalj ostaje samo u server logu.

### URL, canonical i robots

- Jedan canonical host, HTTPS i dosledna pravila za trailing slash.
- Ukloniti ili 301 preusmeriti svaki stari slug samo kada se slug zaista promeni.
- Tracking query parametri (`utm_*`, `gclid`, `fbclid`) ne menjaju canonical.
- Filteri prodavnice ostaju client state ili canonicalizuju na `/prodavnica` dok ne dobiju
  dovoljno zasebne vrednosti za pretragu.
- `noindex, nofollow` postaviti za admin/nalog; `noindex, follow` je dovoljno za javno
  dostupne transakcione stranice poput prijave, korpe i checkout-a.
- `robots.txt` nije zamena za `noindex`: bot mora moći da vidi meta pravilo kada je
  potrebno uklanjanje već poznatog URL-a. API/admin tehničke putanje mogu ostati blokirane.

### Sitemap

- Uključiti početnu, indeksabilne statičke strane, aktivne proizvode i odobrene vodiče.
- Ne uključivati korpu, checkout, prijavu, nalog, admin, API, 404, preusmerenja ni query URL-ove.
- Za proizvod koristiti njegov stvarni `updatedAt`; za statički sadržaj održavati poznat
  datum izmene, a ne vreme svakog requesta.
- Sitemap submitovati u Search Console i pratiti odnos `submitted`, `indexed` i razloga
  isključenja po tipu stranice.

### Structured data

1. Početna/O nama: `OnlineStore` ili `Organization` sa stvarnim nazivom, URL-om, logom,
   telefonom, emailom, `sameAs` profilima i pravnim/adresnim podacima koji se smeju objaviti.
2. Proizvod: `Product` sa `Offer` objektom, RSD cenom, URL-om, stanjem dostupnosti, brand-om,
   slikom i internim SKU-om. Dodati shipping/return podatke tek kada su javno objavljeni i
   potpuno isti kao poslovna pravila.
3. Proizvod i vodiči: `BreadcrumbList` koji odgovara vidljivoj putanji.
4. Recenzije: `AggregateRating` samo iz pravih, prikazanih i proverljivih recenzija. Nikada
   ne generisati ocene ili broj recenzija.
5. FAQ: ne širiti markup samo radi rich rezultata. Postojeći FAQ može ostati validan, ali
   Google prikaz FAQ rich rezultata nije osnov poslovnog plana; važniji su korisni odgovori.
6. Sve proveriti kroz Rich Results Test i Schema Markup Validator pre puštanja.

### Slike i performanse

- Preuzeti zvanične slike u kontrolisano skladište ako prava i ugovor to dozvoljavaju;
  udaljeni Google Storage URL ne treba da bude jedina kopija ključnog asseta.
- Izvesti najmanje 480, 768 i 1200 px varijante; koristiti WebP/AVIF uz fallback.
- Hero i glavna slika proizvoda: eager/high priority samo kada su iznad prevoja.
- Kartice, preporuke i sadržaj ispod prevoja: `loading="lazy"`.
- Svaka slika ima `width` i `height` ili drugi stabilan intrinzični odnos.
- Cilj na 75. percentilu stvarnih mobilnih poseta: LCP ≤ 2,5 s, INP ≤ 200 ms,
  CLS ≤ 0,1.
- Font, CSS, third-party analytics i slike kontrolisati po route budgetu; marketing tagovi
  ne smeju da pogoršaju consent ni LCP.

### Automatizovana kontrola

Za svaku indeksabilnu rutu testirati:

- HTTP 200;
- apsolutni canonical na produkcionom hostu;
- jedinstven nenulti title i description;
- tačno jedan H1;
- odsustvo `noindex`;
- javni sadržaj u server HTML-u;
- validan JSON-LD bez neusaglašenih cena i dostupnosti;
- slike sa alt-om i dimenzijama.

Za privatne rute testirati `noindex`. Za nepostojeći proizvod testirati HTTP 404. Za sitemap
testirati aktivan i neaktivan proizvod, ispravan `lastmod` i odsustvo privatnih URL-ova.

## 7. Sadržaj koji može da izgradi autoritet

Google preporučuje originalan, koristan sadržaj sa jasnim „ko, kako i zašto“. Za ovaj brend
prednost nisu generički SEO tekstovi, već podaci koje konkurent ne može lako da kopira:
stvarne farme, laboratorijski nalazi, put mleka, raspored ruta, povrat ambalaže, iskustvo
isporuke i sopstvene fotografije.

### Prvih osam sadržaja

| Redosled | Sadržaj | Namera i obavezni dokaz |
|---:|---|---|
| 1 | Dostava domaćeg mleka u Beogradu | Stvarne opštine/poštanski brojevi, utorak/petak, cutoff, cena i provera adrese. |
| 2 | Dostava domaćeg mleka u Novom Sadu | Stvarne zone, petak, cutoff, cena i lokalno specifična pitanja. |
| 3 | Kako čuvati i koristiti sirovo mleko | Uputstvo mora pregledati kvalifikovan tehnolog/veterinar; navesti izvore i datum provere, bez improvizovanih zdravstvenih saveta. |
| 4 | Kako izgleda laboratorijska kontrola našeg mleka | Ko testira, šta se testira, koliko često i kako kupac može da proveri dokaz; objaviti samo podatke za koje postoji dokumentacija. |
| 5 | Povratne staklene flaše: ceo krug | Pranje, povrat, sledeća dostava i merljiv broj ponovo upotrebljenih flaša kada podatak postoji. |
| 6 | Kravlje i kozje mleko: praktične razlike | Ukus, upotreba, pakovanje i cena iz sopstvene ponude; nutricione/zdravstvene tvrdnje samo uz stručnu proveru. |
| 7 | Od farme do kućnog praga | Foto-priča stvarne isporuke sa vremenom, temperaturom i odgovornim licima gde se podaci mogu objaviti. |
| 8 | Recept iz naše kuhinje | Originalni recept i fotografije sa tačnom količinom proizvoda i jasnim pravilima bezbedne pripreme. |

Ritam: dva vrhunska sadržaja mesečno su bolja od deset generičkih. Svaki tekst prolazi
činjeničnu proveru, ima autora/revizora, originalne vizuale, datum stvarne izmene, interni
link ka proizvodu i jasan sledeći korak.

### Šta ne raditi

- masovno objavljivanje AI tekstova bez iskustva i provere;
- keyword stuffing i neprirodno ponavljanje grada/proizvoda;
- kopirane ili skoro identične stranice za svaku opštinu;
- izmišljena imena farmi, sertifikati, analize, iskustva, ocene ili recenzije;
- nedokazane tvrdnje kao „leči“, „sprečava“, „najzdravije“ ili „bezbedno za svakoga“;
- kupovina link paketa, privatnih blog mreža i nasumičnih direktorijuma;
- promena datuma bez stvarne sadržajne izmene.

## 8. Lokalni SEO i autoritet van sajta

1. Proveriti da li poslovanje ispunjava Google Business Profile uslove kao lokacija ili
   service-area business. Ne koristiti virtuelnu ili tuđu adresu.
2. Uneti identičan naziv, telefon, sajt, radno vreme i područje usluge na sajtu i profilu.
3. Za svaki stvarni mlekomat potvrditi tačnu adresu, radno vreme objekta, vrstu mleka,
   fotografiju, pristup/parking i datum poslednje provere.
4. Uvesti neutralan post-purchase zahtev za recenziju svim stvarnim kupcima, bez nagrade
   za pozitivnu ocenu i bez filtriranja nezadovoljnih.
5. Odgovoriti na svaku recenziju konkretno i bez objavljivanja podataka porudžbine.
6. Tražiti kvalitetne linkove i pominjanja od stvarnih farmi, lokacija mlekomata, partnera,
   lokalnih medija i relevantnih udruženja.
7. Napraviti malu press stranicu sa logom, odobrenim fotografijama, činjenicama, kontaktom
   i jasnim pričama: povratne flaše, lokalne rute, domaći proizvođači.

Google Business Profile je podržan u Srbiji. Google Merchant Center/Shopping ne treba
stavljati u prvu fazu: aktuelna zvanična lista ciljnih zemalja ne navodi Srbiju. `Product`
structured data ipak treba implementirati zbog boljeg razumevanja proizvoda u Search-u.
Merchant Center ponovo proveriti kvartalno i aktivirati tek kada Srbija i RSD postanu
podržani za ciljno tržište ili se poslovanje zaista proširi na podržanu zemlju.

## 9. Merenje i KPI

### Obavezna merenja

- Search Console: impresije, klikovi, CTR, prosečna pozicija, upiti, stranice, grad/uređaj,
  indeksiranje, rich results i Core Web Vitals.
- GA4 uz postojeći consent: organic landing page → `view_item` → `add_to_cart` →
  `begin_checkout` → server-confirmed `purchase`.
- Poslovni KPI: organski prihod, broj prvih porudžbina, broj aktiviranih redovnih dostava,
  stopa konverzije i prihod po landing stranici.
- Lokalni KPI: pozivi, klikovi ka sajtu, zahtevi za smernice i broj/stopa odgovora na
  recenzije u Business Profile-u.
- Segmenti: brand/non-brand, Beograd/Novi Sad, mobile/desktop, proizvod/lokacija/vodič.

### Ciljevi po fazama

| Rok | Cilj |
|---|---|
| 14 dana | SEO-01 do SEO-08 su na stagingu; svaki aktivan proizvod je serverski vidljiv, canonicalizovan, u sitemapu i ima validan `Product/Offer`. |
| 30 dana | Svi P0 zadaci SEO-01 do SEO-11 su završeni; Search Console je verifikovan, sitemap obrađen, nema indeksabilnih privatnih ruta, soft 404 ni kritičnih structured-data grešaka; CWV laboratorijski budžet prolazi na ključnim mobilnim šablonima. |
| 60 dana | Objavljene dve stvarne lokalne strane i najmanje četiri dokazna sadržaja; Business Profile je kompletan ako je podoban; prvi brand/non-brand izveštaj donosi prioritete. |
| 90 dana | Svi tehnički acceptance kriterijumi su dokazano zeleni; optimizovane su stranice sa prvim realnim impresijama; postoje najmanje tri relevantna, autentična nova pominjanja/linka. |
| 6–12 meseci | Organski kanal stabilno donosi potvrđene porudžbine i redovne dostave. Numerički growth cilj se postavlja posle 28 dana pouzdane baze, ne izmišlja se pre podataka. |

Zdrav operativni cilj je da 100% planiranih indeksabilnih URL-ova bude tehnički podobno,
a da se istraži svaki važan URL koji posle razumnog crawl perioda ostane neindeksiran.
Google, ne vlasnik sajta, donosi konačnu odluku o indeksiranju.

### Nedeljni ritam

- Ponedeljak: Search Console anomalije, indeksiranje, CWV i structured-data greške.
- Sreda: upiti/stranice sa novim impresijama i content gap analiza.
- Petak: organic funnel, prihod i lokalni profil; zapisati jednu hipotezu za sledeći test.
- Mesečno: zadržati, poboljšati, spojiti ili ukloniti sadržaj na osnovu korisnosti i ishoda,
  ne samo na osnovu poseta.

## 10. Roadmap od 90 dana

### Nedelja 1 — crawl i indeksiranje

- SEO-01, SEO-04, SEO-05 i SEO-06.
- Potvrditi production domen, redirect matricu i sve javne/private rute.
- Napraviti pre-release crawl i sačuvati početni benchmark.

### Nedelja 2 — proizvod kao SEO stranica

- SEO-02 i SEO-03.
- Dodati SEO-07 i SEO-08.
- Testirati sa isključenim JavaScript-om i u Rich Results Test-u.

### Nedelja 3 — iskustvo i poverenje

- SEO-09, SEO-10 i SEO-11.
- Lighthouse/mobile QA na 320, 360, 390, 768 i 1440 px.
- Potvrditi da analytics i marketing tagovi ostaju iza consent-a.

### Nedelja 4 — merenje i on-page

- SEO-12 i SEO-14.
- Verifikovati Search Console, poslati sitemap i povezati KPI dashboard.
- Zaključati početnu keyword/intent mapu na osnovu prvih podataka i Keyword Plannera.

### Mesec 2 — lokalna relevantnost i dokazi

- SEO-13, SEO-15 i prva četiri sadržaja.
- Prikupiti originalne fotografije, podatke o farmama i laboratorijske dokaze.
- Uvesti pošten proces traženja i odgovora na recenzije.

### Mesec 3 — autoritet i iteracija

- Preostala četiri sadržaja.
- Partner/farma/lokalni PR outreach.
- SEO-18: optimizacija naslova, intro sekcija, internih linkova i CTA-a prema stvarnim
  upitima i ponašanju korisnika.

## 11. Ulazi koji su potrebni od vlasnika poslovanja

Bez ovih podataka deo vrhunskog SEO-a ne može biti završen bez izmišljanja činjenica:

- konačan production domen i pristup DNS-u;
- pravni naziv firme, javna adresa ili potvrđeno service area poslovanje, email i radno vreme;
- tačne lokacije i status svakog mlekomata;
- imena farmi/proizvođača koja se smeju objaviti;
- laboratorijski izveštaji, učestalost kontrole i naziv odgovorne ustanove;
- odobrena pravila čuvanja, upotrebe i bezbednosti sirovog mleka;
- pravila dostave, reklamacije, povraćaja, zamene i povratne ambalaže;
- fotografije proizvoda/farmi/rute sa pravom korišćenja;
- pristup Search Console, GA4 i Google Business Profile nalozima;
- stvarne recenzije ili proces njihovog prikupljanja.

## 12. Definition of done prema acceptance dokumentu

- [ ] Svaka javna ruta ima ponovljiv 200/loading/error/empty scenario.
- [ ] Nepostojeća javna ruta i proizvod vraćaju 404 bez tajni.
- [ ] Na 320 px nema horizontalnog overflow-a; svi controls imaju labelu i vidljiv fokus.
- [ ] Svaka indeksabilna strana ima jedinstven title, description, canonical i jedan H1.
- [ ] Katalog i detalj proizvoda imaju smislen sadržaj u početnom HTML-u.
- [ ] Admin, nalog, korpa, checkout, prijava i potvrda se ne indeksiraju.
- [ ] Sitemap koristi production env URL i sadrži sve i samo canonical javne URL-ove.
- [ ] Aktivni proizvodi ulaze u sitemap sa stvarnim datumom izmene; neaktivni ne ulaze.
- [ ] Sve slike imaju stabilne dimenzije, smislen alt i odgovarajuću loading strategiju.
- [ ] Product, Offer, Organization/OnlineStore i Breadcrumb JSON-LD prolaze validaciju.
- [ ] Cena i dostupnost u HTML-u, JSON-LD-u, API-ju i checkout-u su identične.
- [ ] LCP, INP i CLS ciljevi prolaze na 75. percentilu kada terenski podaci postanu dostupni.
- [ ] Search Console i GA4 mere organski ulaz do server-confirmed kupovine.
- [ ] Svaka tvrdnja o poreklu, kontroli i svojstvu proizvoda ima dokaz i vlasnika odobrenja.

## 13. Autoritativni izvori

- [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [People-first content i Who/How/Why](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Ecommerce struktura i interni linkovi](https://developers.google.com/search/docs/specialty/ecommerce/help-google-understand-your-ecommerce-site-structure)
- [Product structured data](https://developers.google.com/search/docs/appearance/structured-data/product)
- [Merchant listing Product/Offer specifikacija](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing)
- [Organization structured data](https://developers.google.com/search/docs/appearance/structured-data/organization)
- [Breadcrumb structured data](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)
- [Canonical smernice](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Sitemap smernice](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Robots meta pravila](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- [Image SEO](https://developers.google.com/search/docs/appearance/google-images)
- [Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals)
- [Lokalno rangiranje i Business Profile](https://support.google.com/business/answer/7091)
- [Business Profile dostupnost po zemljama](https://support.google.com/business/answer/6270107)
- [Merchant Center podržane zemlje i valute](https://support.google.com/merchants/answer/160637)
