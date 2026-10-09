# Mleko i Mleko: provera svih 13 segmenata brifa

Datum: 17. septembar 2026. Predmet: lokalni sajt i kod na `main`, commit `42f277a`.

**Zaključak: svih 13 segmenata nije završeno u punom obimu.** Osnova prodavnice, obračuna pretplata, rokova i organizacije dostave postoji i ima testove. Najveći nedostaci su stvarna kartična naplata, dokaz da fiskalizacija radi sa pravim servisom, kompletna marketinška analitika i nekoliko nedovršenih kontrola u korisničkom nalogu i administraciji.

Pregledan je dokument „Brif za Mleko i Mleko sajt (1).pdf“, svih 9 strana. Crveni tekst, crvene oznake „OK“ i dopisane napomene nisu korišćeni kao zahtevi niti kao dokaz završenosti. Plavi linkovi unutar crvenih napomena takođe nisu tretirani kao zasebni zahtevi. Dokument nije menjan.

## Kako su određeni statusi

- **Urađeno u aplikaciji:** funkcionalnost postoji u dostupnom interfejsu i odgovarajućoj serverskoj logici, uz navedene granice provere.
- **Delimično:** deo zahteva radi, ali postoji konkretan nedostatak u kodu, interfejsu ili povezivanju.
- **Integracija pripremljena, rad nije potvrđen:** postoji kod za spoljni servis, ali nije potvrđen stvarni tok sa tim servisom. Ovo ne znači da je dokazano da servis nije podešen na produkciji.

Pregled obuhvata kod, javne lokalne stranice, ručni pregled prodavnice i checkouta i postojeće testove. Nisu provereni privatni nalozi banke, fiskalnog servisa, Google-a, Meta-e ili Spoke-a. Nisu slati pravi emailovi, izdavani pravi računi niti naplaćivane kartice. Ovo nije pravna ili poreska revizija.

## Pregled svih segmenata

| # | Segment iz brifa | Ocena | Šta ostaje |
|---|---|---|---|
| 1 | Online prodavnica i pretplata | Urađeno u aplikaciji | Završna provera sa kompletnim stvarnim katalogom. |
| 2 | Korisnički nalog i upravljanje dostavama | Delimično | Dodavanje novog stalnog proizvoda u postojeću pretplatu kroz UI; jednostavnije prvo pristupanje bez obavezne lozinke. |
| 3 | Rok za izmene | Urađeno za zabranu izmena | Rok se podešava i server ga sprovodi; trajno zaključavanje liste je zaseban admin korak. |
| 4 | Automatske potvrde i obaveštenja | Delimično | Rok za izmene u podsetniku, usklađivanje vremena slanja i potvrda stvarne dostave poruka. |
| 5 | Dostava i Spoke Route Planner | Urađeno u aplikaciji | Probni import generisanog fajla u stvarni Spoke nalog. |
| 6 | Zbirni pregled za pripremu robe | Urađeno u aplikaciji | Eventualno pretvaranje različitih pakovanja u ukupan broj litara/kilograma. |
| 7 | Plaćanje | Delimično | Stvarno kartično plaćanje, tokenizacija i mesečna automatska naplata. |
| 8 | Automatsko izdavanje računa | Integracija pripremljena, rad nije potvrđen | Provera naplata → stvarni fiskalni račun → stvarni email. |
| 9 | Administracija | Delimično | UI za izmenu stavki postojeće jednokratne porudžbine; potpuniji pregled budućih termina. |
| 10 | Izgled i struktura sajta | Uglavnom urađeno | Zatvaranje nalaza javnog E2E paketa i potvrda mobilnog UX-a i performansi. |
| 11 | SEO | Delimično | Search Console provera, merenje brzine, editor novih SEO stranica i završna provera naslova. |
| 12 | Analitika i tracking | Delimično | Povezani GA4/GTM/Meta/Ads tokovi, nedostajući događaji i ispravno povezivanje sesije sa kupovinom. |
| 13 | Praćenje izvora prodaje | Delimično | Očuvanje kampanje, pravilna klasifikacija kanala i kompletan izveštaj od posete do prihoda. |

## 1. Online prodavnica i pretplata

**Urađeno:**

- Svaki proizvod može imati jednokratnu kupovinu ili redovnu dostavu, ako mu je pretplata omogućena u katalogu.
- Kod redovne dostave postoje nedeljni i dvonedeljni ritam, kao i izbor količine.
- Tip kupovine i ritam čuvaju se po stavci; nisu jedna postavka za celu korpu.
- Serverski obračun podržava mešovitu korpu i računa konkretne termine do kraja meseca.
- Jednokratna stavka u mešovitoj korpi ne ponavlja se na svakoj narednoj isporuci.
- Kupac vidi cenu proizvoda po dolasku i mesečni obračun sa dostavom u korpi/checkoutu.

**Granice:** u pregledanoj lokalnoj prodavnici objavljene su dve vrste mleka. Jogurt i sir su primeri iz brifa, ne dokaz da moraju biti objavljeni bez dostavljenog kataloga. Sama podrška za različite proizvode postoji. Završena prodavnica ne znači završeno kartično plaćanje iz segmenta 7.

**Dokazi:** [konfigurator proizvoda](</Users/luka/Documents/ChatGPT/mleko mleko v2/app/components/product-configurator.tsx:63>), [serverski obračun](</Users/luka/Documents/ChatGPT/mleko mleko v2/server/commerce.ts:45>), [test mešovite korpe](</Users/luka/Documents/ChatGPT/mleko mleko v2/tests/domain-sqlite.test.mjs:46>). U browseru potvrđeno da izbor redovne dostave za kravlje mleko otvara oba ritma bez menjanja izbora kozjeg mleka.

## 2. Korisnički nalog i upravljanje dostavama

**Urađeno:** datum sledeće redovne dostave, proizvodi, količine, rok za izmenu, izmena količine i ritma, uklanjanje proizvoda, jednokratni dodatak, preskok, pauza do datuma, nastavak i trajno otkazivanje. Postoje istorija i odvojeni prikaz već zaključane dostave. Prijava email kodom i podrška za WhatsApp kod postoje.

**Nedostaje ili odstupa:**

1. Server podržava `add_item`, ali trenutni nalog nema kontrolu koja dodaje novi proizvod kao stalnu stavku u postojeću pretplatu. Gornje „Dodaj proizvod“ vodi u prodavnicu. Kupovina odatle nije isto što i uređivanje postojeće pretplate.
2. Prvo pravljenje naloga zahteva lozinku od najmanje 12 znakova, iako se kasnije koristi kod. Kupovina sama ne kreira potrebni zapis za novu prijavu kodom. To odstupa od želje za pristupom koji je što jednostavniji i idealno bez klasične lozinke.
3. WhatsApp najpre zahteva prijavu, povezivanje i potvrdu broja. Stvarno slanje nije potvrđeno ovom proverom. SMS nije implementiran; u brifu je SMS/WhatsApp idealna opcija, pa odsustvo SMS-a nije samo po sebi razlog da ceo nalog bude označen kao neurađen.
4. Izbor dodataka samo za sledeću dostavu ograničen je na prva tri proizvoda. Sa većim katalogom korisnik ne bi mogao da izabere svaki proizvod.
5. Jednokratne porudžbine kupac vidi, ali ih za izmenu rešava preko kontakta. Širi cilj iz brifa da kupac radi bez ručne pomoći zato nije potpuno ostvaren.

**Da bi segment bio završen:** dodati izbor proizvoda za postojeću pretplatu, ukloniti ograničenje na tri dodatka, završiti jednostavan prvi pristup posle kupovine i proveriti stvarno dostavljanje kodova.

**Dokazi:** [kontrole pretplate](</Users/luka/Documents/ChatGPT/mleko mleko v2/app/nalog/subscription-card.tsx:58>), [nalog](</Users/luka/Documents/ChatGPT/mleko mleko v2/app/nalog/account-view.tsx:43>), [registracija/prijava](</Users/luka/Documents/ChatGPT/mleko mleko v2/app/prijava/login-form.tsx:8>), [serverske izmene](</Users/luka/Documents/ChatGPT/mleko mleko v2/server/commerce.ts:442>).

## 3. Rok za izmene

**Urađeno:** admin podešava broj sati, dane i vreme dostave; nalog prikazuje rok; server odbija izmene nakon isteka i za zaključanu dostavu. Postoje provere tačne granice roka, starih verzija i nevažećih datuma.

**Važna razlika:** istekom vremena nastupa zabrana izmene na serveru. Trajno čuvanje zaključane operativne liste i pomeranje pretplate na naredni termin trenutno rade kroz admin akciju zaključavanja. Dnevni zakazani posao generiše liste i podsetnike, ali ne poziva automatski `lockDelivery`. Ako očekujete da se i taj operativni korak izvrši bez čoveka, to još treba dodati.

**Dokazi:** [provera roka](</Users/luka/Documents/ChatGPT/mleko mleko v2/server/commerce.ts:434>), [zaključavanje](</Users/luka/Documents/ChatGPT/mleko mleko v2/server/deliveries.ts:118>), [zakazani poslovi](</Users/luka/Documents/ChatGPT/mleko mleko v2/server/jobs.ts:7>), podešavanje „Rok za izmenu (sati)“ u administraciji.

## 4. Automatske potvrde i obaveštenja

**Urađeno:** događaji i email šabloni za porudžbinu, aktiviranje pretplate, promene proizvoda, preskok, pauzu, nastavak i otkazivanje. Postoje red obrade, evidencija neuspeha, zaštita od duplih podsetnika i zasebni WhatsApp poslovi sa proverom pristanka. Podržani su email adapteri i WhatsApp adapter.

**Nedostaje:**

- Šablon podsetnika kaže kada je sutrašnja dostava, ali ne ispisuje „možete izmeniti do [datum i vreme]“, što je izričito traženo.
- Raspored slanja nije vezan za rok. Zakazani posao je u 08:00 UTC, odnosno 09/10h u Srbiji; sa podrazumevanom dostavom u 08h i rokom od 24h, podsetnik stiže nakon isteka mogućnosti izmene. Potrebno je uskladiti podsetnik i cutoff.
- Testovi koriste test adaptere; prihvatanje zahteva od providera nije dokaz da je poruka stvarno stigla u inbox/WhatsApp. Potrebna je završna provera pravih poruka.

**Dokazi:** [email šabloni](</Users/luka/Documents/ChatGPT/mleko mleko v2/server/notifications.ts:21>), [podsetnici](</Users/luka/Documents/ChatGPT/mleko mleko v2/server/integration-jobs.ts:276>), [raspored](</Users/luka/Documents/ChatGPT/mleko mleko v2/vercel.json:12>), [testovi povezanih izmena](</Users/luka/Documents/ChatGPT/mleko mleko v2/tests/connected-delivery-flows.test.mjs:63>).

## 5. Dostava i Spoke Route Planner

**Urađeno:** izbor dana, CSV i XLSX, ime, adresa, telefon, email kada postoji, proizvodi sa količinama, napomena i identifikator. Otvorene liste se regenerišu nakon relevantnih izmena; zaključani spiskovi čuvaju svoje podatke. CSV ima UTF-8 podršku i zaštitu od formula. XLSX sadrži rutu i pripremu.

**Još nije potvrđeno:** stvarni import u korisnikov Spoke nalog. Testovi potvrđuju sadržaj fajla, ne ponašanje spoljnog servisa. Završni kriterijum je da se jedan reprezentativan izvoz učita bez ručnog popravljanja kolona i adresa. Brif traži import fajla, ne direktnu Spoke API integraciju, pa odsustvo takve integracije nije nedostatak.

**Dokazi:** [CSV kolone](</Users/luka/Documents/ChatGPT/mleko mleko v2/integrations/spoke-csv.mjs:1>), [izvoz dostava](</Users/luka/Documents/ChatGPT/mleko mleko v2/server/deliveries.ts:153>), [browser test izvoza](</Users/luka/Documents/ChatGPT/mleko mleko v2/tests/e2e/admin-exports.spec.ts:21>).

## 6. Zbirni pregled za pripremu robe

**Urađeno:** admin „Dostave“ ima pregled za pakovanje i za vozača; zbir proizvoda za dan i detalje svakog kupca. Preskoci, pauze i jednokratni dodaci ulaze u odgovarajuću projekciju. Postoji i Excel list za pripremu.

**Granica prikaza:** zbir je po proizvodu i jedinici pakovanja, npr. `12 × 1 L`. Ne postoji opšti preračun različitih pakovanja istog artikla u jedan zbir litara/kilograma. Za sadašnji katalog od 1 L rezultat je jasan; za buduće kombinacije 0,5 L / 1 L / 2 L treba odlučiti da li je potreban i taj zbir.

**Dokazi:** [zbir robe](</Users/luka/Documents/ChatGPT/mleko mleko v2/server/deliveries.ts:40>), [prikaz za pripremu](</Users/luka/Documents/ChatGPT/mleko mleko v2/app/admin/deliveries-panel.tsx:250>).

## 7. Plaćanje

**Urađeno:** gotovina, obračun planiranih termina po mesečnoj pretplati, nedeljna/dvonedeljna dinamika, zasebne jednokratne stavke, mesečni obračuni, knjiženje kredita i prenos viška u sledeći obračun. Postoje testovi promena već plaćene pretplate. Vozač vidi preostali dug.

**Nije urađeno:**

- Checkout ima samo gotovinu; u kodu je `paymentMethod = "cash"`.
- Adapter za kartice prihvata samo lokalni simulacioni režim. Stvarni bankarski tok plaćanja nije implementiran u aktivnom checkoutu.
- Nema kompletnog korisničkog toka za tokenizaciju kartice, njeno ponovno korišćenje i automatsku mesečnu naplatu preko stvarnog providera.

Postojanje promenljivih za banku, webhooka ili test tokena nije isto što i završena naplata. Potrebno je dokazati uspešnu i neuspešnu uplatu, povratni odgovor banke, zaštitu od dvostruke naplate i naredni mesečni obračun.

**Dokazi:** [gotovinski checkout](</Users/luka/Documents/ChatGPT/mleko mleko v2/app/checkout/checkout-form.tsx:29>), [lokalni payment adapter](</Users/luka/Documents/ChatGPT/mleko mleko v2/server/integrations.ts:14>), [mesečni obračun i krediti](</Users/luka/Documents/ChatGPT/mleko mleko v2/server/billing.ts:42>). Gotovina kao jedina opcija potvrđena je i u browseru.

## 8. Automatsko izdavanje računa

**Urađeno u kodu:** nakon evidentirane uplate nastaje zahtev za fiskalizaciju. Postoji adapter za Badi, mapiranje artikala na SKU, obrada dostave i korekcija, čuvanje statusa/broja/PDF adrese i zahtev da servis pošalje račun emailom. Greške se evidentiraju u administraciji. Mock je označen kao mock i nije dozvoljen kao produkciona fiskalizacija.

**Nije potvrđeno:** aktivna produkciona veza, ispravni stvarni SKU podaci i kompletan prolaz sa pravim računom i njegovim prijemom. Zato segment ne može dobiti ocenu „završeno za poslovanje“. Potvrda porudžbine i Excel potvrda nisu dokaz izdatog fiskalnog računa.

**Da bi segment bio zatvoren:** uz podešen fiskalni servis proveriti konkretan poslovni scenario i potvrditi broj računa, iznos, stavke, status i email. Ova provera to nije izvršavala.

**Dokaz:** [izdavanje fiskalnog računa](</Users/luka/Documents/ChatGPT/mleko mleko v2/server/integration-jobs.ts:107>). Badi se ovde navodi zato što je implementiran u kodu, ne zato što je pomenut u crvenoj dopisanoj napomeni PDF-a.

## 9. Administracija

**Urađeno:** pet glavnih sekcija, proizvodi/cene/dostupnost, kupci, statusi pretplata, izbor datuma dostave, zbir robe, CSV/XLSX, detalji porudžbine, naplata/status isporuke, ručni unos nove porudžbine, izmena kontakta/adrese, količine pretplate, preskok i pauza/nastavak.

**Nedostaje:**

- Detalji postojeće jednokratne porudžbine su samo za čitanje. Nema forme za promenu njenih proizvoda i količina. Server to podržava za nenaplaćene i nezaključane porudžbine, ali admin nema odgovarajuću kontrolu. „Nova porudžbina“ ne ispunjava zahtev „izmeni porudžbinu“.
- Postoji pregled izabranog dana i najbližeg termina, ali nema potpunog kalendara ili objedinjene liste svih projektovanih budućih isporuka.
- Lista kupaca/pretplata ima ograničenje od 500 učitanih redova, pa filteri statusa nisu potpuno rešenje za rast baze.

**Dokazi:** [admin interfejs](</Users/luka/Documents/ChatGPT/mleko mleko v2/app/admin/admin-dashboard.tsx:31>), [detalji porudžbine](</Users/luka/Documents/ChatGPT/mleko mleko v2/app/admin/orders-panel.tsx:46>), [postojeća serverska podrška za izmenu](</Users/luka/Documents/ChatGPT/mleko mleko v2/server/admin.ts:123>).

## 10. Izgled i struktura sajta

**Urađeno:** Početna, Prodavnica, Kako funkcioniše, Gde kupiti, O nama, Naše farme, FAQ, Kontakt i nalog postoje. Proverene javne rute vraćaju HTTP 200. Postoje izbor količine, tipa kupovine, ritma, datuma i obračuna. Mobilne varijante i pojednostavljeni admin su implementirani.

**Za završetak:** javni E2E paket nije potpuno zelen. U prethodnoj proveri ostala su 23 pada van admina, uključujući zastarele selektore i očekivanja, kontrast footera i hero ponašanje. To nije dokaz 23 različita programska baga: deo su testovi koje treba uskladiti sa sadašnjim UI-em. Ipak, bez razrešenja tih nalaza ne treba tvrditi da je kompletan mobile-first tok završen i potvrđen.

Brzina i jednostavnost nisu dokazane samim izgledom. Potrebna je završna provera na stvarnom telefonu, sa sporijom vezom i punom korpom. Nije rađeno novo Lighthouse/Core Web Vitals merenje u ovoj reviziji.

**Dokazi:** aktuelna HTTP provera svih navedenih stranica i [prethodni QA rezultati](</Users/luka/Documents/ChatGPT/mleko mleko v2/docs/admin-workspace.md:37>).

## 11. SEO

**Urađeno:** opisni URL-ovi, title/description/canonical, metapodaci proizvoda iz kataloga, sitemap sa proizvodima, robots.txt, noindex za privatne tokove, strukturirani podaci, alt tekstovi i delimična optimizacija slika. Postoje i posebne stranice za dostavu po gradu. U HTTP proveri tražene javne stranice imaju naslov, opis, canonical i jedan H1.

**Nedostaje / nije potvrđeno:**

- Vlasništvo i povezivanje sa Google Search Console nisu provereni. Odsustvo HTML verifikacionog taga samo po sebi nije dokaz da nema DNS verifikacije.
- Admin ne omogućava pravljenje novih SEO stranica i proizvoljnog sadržaja. Može menjati SEO proizvoda i deo sadržaja početne; nove stranice zahtevaju kod.
- Hijerarhija naslova nije svuda dosledna: kartice prodavnice koriste H3 neposredno ispod glavnog H1, bez odgovarajućeg H2 u toj sekciji.
- Nisu potvrđeni produkciona indeksacija, sitemap na finalnom domenu i performanse. Optimizacija slika nije jednaka kroz sve komponente; hero video dodatno zahteva merenje.

Lokalni canonical pokazuje localhost, što je očekivano za lokalni server i nije samo po sebi produkcioni SEO problem.

**Dokazi:** [SEO helperi](</Users/luka/Documents/ChatGPT/mleko mleko v2/app/lib/seo.ts:1>), [sitemap](</Users/luka/Documents/ChatGPT/mleko mleko v2/app/sitemap.ts:1>), [robots](</Users/luka/Documents/ChatGPT/mleko mleko v2/app/robots.ts:1>), [editor proizvoda i sadržaja](</Users/luka/Documents/ChatGPT/mleko mleko v2/app/admin/admin-dashboard.tsx:280>).

## 12. Analitika i tracking

**Urađeno:** lokalno beleženje događaja, cookie dijalog sa odvojenim izborom analitike/marketinga, deo ecommerce događaja i serverski `purchase` posle potvrđene uplate. Postoji uslovno slanje tog događaja u GA4 Measurement Protocol. Admin grafikoni koriste stvarne poslovne podatke.

**Nedostaje:**

1. Aktivna klijentska integracija za GA4/GTM, Meta Pixel i Google Ads. U aplikaciji nema kompletnih `gtag`/`dataLayer`/`fbq` tokova; polja u konfiguraciji nisu dovoljan dokaz integracije.
2. `promo_applied` i događaji pauze/otkazivanja postoje u dozvoljenim imenima, ali u aktuelnom korisničkom toku nema odgovarajućih poziva za njih. Aktiviranje pretplate nije kompletno povezano sa traženim marketinškim događajima.
3. `page_view` se šalje pri promeni consent stanja, ne pri svakoj promeni rute u aplikaciji. Klijentska navigacija zato može ostati bez novog pregleda stranice.
4. Serverski purchase koristi svoj identifikator kupca/sesije, bez veze sa browser session ID-em, i GA4 payload ne šalje niz kupljenih proizvoda `items`. To ne ispunjava kompletan ecommerce put od pregleda do proizvoda koji je kupljen.
5. Identifikatori analitike i attribution u browser storage-u nastaju pre izbora pristanka. Samo slanje lokalnih analytics događaja jeste uslovljeno dozvolom. Treba uskladiti ponašanje sa porukom koju cookie dijalog prikazuje, bez proglašavanja pravne usklađenosti na osnovu ovog tehničkog pregleda.
6. Nije potvrđen prijem događaja u stvarnim GA4/Meta/Ads nalozima niti Search Console povezivanje.

**Dokazi:** [browser analytics](</Users/luka/Documents/ChatGPT/mleko mleko v2/app/components/analytics-provider.tsx:20>), [dozvoljeni događaji](</Users/luka/Documents/ChatGPT/mleko mleko v2/server/analytics.ts:5>), [GA4 purchase](</Users/luka/Documents/ChatGPT/mleko mleko v2/server/integration-jobs.ts:172>), [nalog i tracking izmena](</Users/luka/Documents/ChatGPT/mleko mleko v2/app/nalog/account-view.tsx:43>).

## 13. Praćenje izvora prodaje

**Urađeno:** hvatanje dozvoljenih UTM parametara, gclid/fbclid, landing putanje i referrera; first/last touch zapis u sessionStorage-u; čuvanje sanitizovanog izvora uz kupca i porudžbinu. Server ima osnovni zbir prodaje po `utm_source`.

**Nedostaje / rizici:**

- Svako novo hvatanje prepisuje `lastTouch`, čak i kada nova interna stranica nema UTM. Pošto se glavni `utm_source` uzima iz poslednjeg dodira, ulazna kampanja može izgubiti mesto glavnog izvora na putu do checkouta. First touch ostaje sačuvan unutar te browser sesije, ali trenutni jednostavni izveštaj ga ne koristi kao zamenu.
- Praćenje živi u sessionStorage-u; ne predstavlja pouzdanu višednevnu ili međuuređajsku atribuciju.
- Upit za kanal bez `utm_source` svrstava porudžbinu u `direct`, bez pune obrade organske pretrage i referrera. Zato direct može sadržati i druge izvore.
- Novi admin nema dostupan kompletan izveštaj kampanja i prodajnog toka. Postoji starija komponenta sa kanalom u kodu, ali nije uključena u trenutnu navigaciju.
- Događaji pregleda/korpe i serverske kupovine nemaju zajednički session ID koji bi omogućio traženi precizan funnel. Ne postoji završen prikaz „kanal → posete → proizvodi → korpa → checkout → kupovina → prihod“.

**Da bi segment bio završen:** očuvati poslednji relevantan kampanjski izvor, povezati posetu i porudžbinu dozvoljenim identifikatorom, uvesti pravila za kanale i dostupni izveštaj, pa proveriti nekoliko kontrolisanih UTM scenarija. Za QR/influenser/WhatsApp potrebne su dosledno označene ulazne veze; sam naziv kanala se ne može pouzdano pogoditi.

**Dokazi:** [hvatanje attribution podataka](</Users/luka/Documents/ChatGPT/mleko mleko v2/app/lib/attribution.ts:13>), [sanitizacija i izbor izvora](</Users/luka/Documents/ChatGPT/mleko mleko v2/server/commerce.ts:67>), [upit po kanalu](</Users/luka/Documents/ChatGPT/mleko mleko v2/server/admin.ts:63>), [trenutni pregled analitike](</Users/luka/Documents/ChatGPT/mleko mleko v2/app/admin/overview.tsx:1>).

## Predloženi redosled završavanja

1. **Plaćanje i računi:** završiti bankarski tok i potvrditi stvarnu fiskalizaciju. To su uslovi za obećanje kompletno automatizovane online prodaje.
2. **Samostalno upravljanje:** dodavanje stalnog proizvoda postojećoj pretplati, jednostavan prvi pristup i admin izmena postojeće porudžbine.
3. **Pouzdana operativa:** podsetnik sa rokom, slanje pre roka i jasno definisano automatsko naspram ručnog zaključavanja.
4. **Merenje prodaje:** rešiti tracking i attribution pre oslanjanja na plaćene kampanje. Grafikon prihoda u adminu nije zamena za marketing funnel.
5. **Završna provera:** Spoke import, stvarni email/WhatsApp, Search Console, javni E2E nalazi i mobilne performanse.

## Šta je provereno u ovoj reviziji

- Svih 9 strana PDF-a, uključujući vizuelnu proveru crvenih dopisanih delova.
- Kod svih 13 oblasti na navedenom commitu, bez izmena funkcionalnosti.
- HTTP odgovor 200 za 12 lokalnih HTML ruta, uključujući sve tražene osnovne stranice, i za robots.txt/sitemap.xml; provera metapodataka i H1.
- U browseru: nezavisan izbor redovne dostave po proizvodu i checkout sa gotovinom kao jedinom opcijom. Nije kreirana nova porudžbina.
- Ponovo pokrenuto **67 ciljanih testova: 67 prolazi** (`domain-sqlite`, `account-dashboard`, `connected-delivery-flows`, `customer-login`, `integrations`), nad prethodno izgrađenim workerom za isti funkcionalni kod. Testovi koriste izdvojene/test podatke i simulirane spoljne servise.
- Rezultati prethodne šire provere navedeni su kao prethodni: 134 osnovna testa, 31 browser scenario u admin paketu i 14 produkcionih runtime testova prolazili su; javni E2E nalazi nisu ovde ponovo svi izvršavani ili popravljani.

Izveštaj ne proglašava konfiguracionu promenljivu, simulirani rezultat, screenshot ili uspešan unit test dokazom da je spoljna produkciona integracija završena.
