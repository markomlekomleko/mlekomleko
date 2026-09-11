# Mleko i Mleko — izveštaj o implementaciji redizajna

Datum: 11. septembar 2026. Izvršilac: Claude Opus 5.
Sprovedeni paket: `OPUS-REDIZAJN-PLAN.md`, `OPUS-DETALJNA-SPECIFIKACIJA.md`,
`AOV-LTV-SPECIFIKACIJA.md`, `HIGGSFIELD-PRODUKCIJSKI-BRIEF.md`.

Sve provere u ovom dokumentu izvedene su na lokalnom dev serveru
(`http://localhost:3000`, Next.js 16.3.4, Turbopack) i u Chrome 1440×1000,
768×1024, 390×844 i 375×667 kroz Playwright. **Nijedan test nije izvršen na
fizičkom telefonu** — sve što je označeno kao mobilno je emulacija.

---

## 1. Radni registar po D01

| Zahtev | Status | Izvor / dokaz |
| --- | --- | --- |
| Aktivni katalog: 2 proizvoda, oba 1 L | PROVERENO | `.data/mleko.sqlite`, tabela `products`: `prod_kravlje_1l` 250 RSD, `prod_kozje_1l` 300 RSD, `unit_label = "1 L"`, oba `is_active = 1` |
| Cena pretplate jednaka jednokratnoj | PROVERENO | `subscription_price_minor = price_minor` za oba aktivna proizvoda |
| Jogurt i mladi sir neaktivni | PROVERENO | `is_active = 0`; ne prikazuju se nigde |
| Cena dostave 350 RSD po terminu | PROVERENO | `settings.deliveryFeeMinor = 35000` |
| Prag besplatne dostave isključen | PROVERENO | `settings.freeDeliveryThresholdMinor = 0` |
| Dan dostave petak, rok 24 h pre 08:00 | PROVERENO | `deliveryWeekday = 5`, `deliveryLocalTime = "08:00"`, `cutoffHours = 24` |
| Zona dostave: poštanski brojevi 11* i 21* | PROVERENO | `settings.servicePostalCodes = ["11","21"]` |
| Svi paketi neaktivni | PROVERENO | Sva tri reda u `bundles` imaju `is_active = 0`; blok paketa se ne prikazuje |
| `listBundles` već odbacuje paket sa neaktivnom komponentom | PROVERENO | `server/bundles.ts:91-94`; pretpostavka iz G02 da to ne radi nije tačna za trenutni kod |
| Paleta (mlečnobela, kobalt, tamna, puter) | ODLUKA DIZAJNA | Implementirano; kontrast izmeren, vidi odeljak 6 |
| Obraćanje u jednini | ODLUKA DIZAJNA | Primenjeno na sav novi prodajni tekst |
| Zvanična ambalaža na fotografiji | NEDOSTAJE | Vidi odeljak 7 |
| Recenzije kupaca | NEDOSTAJE | Blok recenzija nije napravljen; nema autentičnog sadržaja |
| Troškovi i marža | NEDOSTAJE | Nije prikazano nigde; `recommendedAddons` rang ostaje serverski i privatan |

---

## 2. Šta je stvarno implementirano

### Novi fajlovi

| Fajl | Uloga |
| --- | --- |
| `app/components/hero-scene.tsx` | Uvod vezan za skrol |
| `app/components/product-configurator.tsx` | Kontrola kupovine po D07, koristi je i početna i prodavnica i stranica proizvoda |
| `app/components/cart-drawer.tsx` | Bočna korpa po D09 |
| `app/lib/hero-media.ts` | Manifest hero medija |
| `app/redesign.css` | Ceo novi dizajn sistem |
| `public/media/hero/*` | Izvezeni hero materijal i `manifest.json` |
| `tests/hero-media.test.mjs` | Čuva manifest od praznih referenci i probijenih budžeta |
| `docs/higgsfield-generation-log.md` | Evidencija generisanja |

### Izmenjeni fajlovi

`app/page.tsx` (nova početna), `app/layout.tsx` (bočna korpa, novi stylesheet),
`app/globals.css` i `app/redesign.css` (paleta), `app/components/site-shell.tsx`
(zaglavlje po D04), `app/components/bundle-offers.tsx` (G04),
`app/components/cart-provider.tsx` (atomsko dodavanje paketa, stanje bočne korpe),
`app/korpa/cart-view.tsx` (G05, G07), `app/prodavnica/store-view.tsx`,
`app/proizvodi/[slug]/product-detail.tsx`, `app/lib/frontend.ts`, `app/lib/content.ts`,
`server/analytics.ts` (dva nova događaja).

Obrisan `app/components/product-card.tsx` — zamenjen konfiguratorom i više se nigde
ne koristi.

### Animacija

Napravljena je bez nove biblioteke. Plan je predlagao GSAP ScrollTrigger; ista
dramaturgija je ostvarena kroz `position: sticky` i jedan `requestAnimationFrame`
ciklus u oko 120 linija, pa nova zavisnost nije opravdana. Scena zadržava obično
skrolovanje browsera, ne ažurira React stanje po kadru, i piše samo u CSS promenljive
i `video.currentTime`.

Mapiranje napretka na priču iz plana, poglavlje 4:

| Napredak | Šta se dešava |
| --- | --- |
| 0–14 % | Naslov, opis i dugme potpuno vidljivi preko bliskog kadra sipanja |
| 14–44 % | Naslov se blago podiže i povlači iz prostora proizvoda |
| 50–62 % | Pojavljuje se „Tvoje mleko. Tvoj ritam.“ |
| 80–100 % | Okvir medija se smanjuje i zaobljava i uklapa u sledeću sekciju |

Dodatni put skrola: 160 svh na desktopu, 85 svh na telefonu, unutar opsega iz plana.
Blago praćenje skrola: vremenska konstanta 0,3 s desktop i 0,2 s telefon.

---

## 3. AOV i LTV — šta je uključeno, a šta ne

| Funkcija | Prioritet | Stanje |
| --- | --- | --- |
| Izbor količine, ritma i načina kupovine | P0 | Implementirano |
| Paketi bez izmišljenog popusta | P0 | Implementirano, ali **nevidljivo** jer su svi paketi neaktivni |
| Jedna relevantna preporuka u korpi | P0 | Implementirano u bočnoj korpi i na `/korpa` |
| Serverski obračun za svaku promenu | P0 | Implementirano |
| Ispravni analitički događaji | P0 | Implementirano |
| Traka za prag besplatne dostave | P1 | **Isključena**, jer je prag 0 |
| Ponovi porudžbinu, pretvaranje u pretplatu, dodatak sledećoj dostavi | P1 | **Nije implementirano** u ovom prolazu, vidi odeljak 8 |
| Lojalnost, referral, win-back | P2 | Nije dirano, ostaje isključeno |

Konkretne odluke koje sprečavaju lažne tvrdnje:

- **Nema tvrdnje o uštedi.** Pretplatna cena je jednaka jednokratnoj za oba proizvoda,
  pa je uklonjen raniji tekst „Uštedite uz redovan ritam“ i `saving-callout` na stranici
  proizvoda. Ponuda prelaska na redovan ritam u `/korpa` sada se prikazuje samo ako
  katalog stvarno daje nižu pretplatnu cenu.
- **Nema izmišljenog paket-popusta.** Cena paketa je zbir stvarnih linija, uz oznaku da
  dostava nije uključena. `savingPerDeliveryMinor` iz servera se ne prikazuje jer meri
  razliku pretplatne i jednokratne cene, što po G04 nije dokaz paket-popusta.
- **Prag dostave.** Kada postoji više termina pretplate u obračunu, tekst glasi
  „za ovaj obračun“, jer server poredi prag sa zbirom celog obračuna, ne po isporuci.
  Nula se tretira kao „isključeno“, ne kao potvrđena besplatna dostava.
- **Paket se dodaje atomski.** `addItems` u `CartProvider` dodaje sve linije odjednom ili
  nijednu, uz jedan `add_to_cart` događaj.
- **Preporuka.** Najviše jedna, nikada proizvod koji je već u korpi, može se odbiti i ne
  vraća se za isti sadržaj korpe u istoj sesiji.

### Analitika

Dodata su dva nova naziva u serverski spisak u `server/analytics.ts`: `offer_viewed` i
`offer_dismissed`, sa svojstvima `offerId`, `offerKind`, `productId`, `amountRsd` i
`amountBasis`. Postojeći `purchase` nije diran i ostaje vezan za potvrđenu naplatu.
Iznosi u događajima nose `amountBasis` (`per_delivery` ili `billing_total`) da se ne bi
mešale osnove. Troškovi nabavke, adresa i kontakt se ne šalju.

**Izlaganje ponude se trenutno beleži kada je blok montiran u otvorenoj korpi, jednom po
ponudi i sadržaju korpe. To nije merenje stvarne vidljivosti od 50 % kroz jednu sekundu
kako G14 predlaže.** Ako je taj kriterijum obavezan, potreban je `IntersectionObserver`
sa pragom i tajmerom.

---

## 4. Dokazi prihvatanja po D13

Izvedeno u Chrome kroz Playwright, 11. septembra 2026.

| ID | Scenario | Rezultat |
| --- | --- | --- |
| UI-01 | 390 px, video namerno nikad ne stigne | Naslov i dugme vidljivi u prvom ekranu, poster učitan, dugme 52 px |
| UI-02 | Klik na „Izaberi svoje mleko“ | Naslov ponude na 167 px, ispod zaglavlja koje se završava na 65 px |
| UI-03 | 375 × 667 sa uvećanim tekstom 200 % | Nema horizontalnog prelivanja, `scrollWidth = 375` |
| UI-04 | Brza izmena količine 2 → 8 → 4 | Prikazano 4 L i 1.000 RSD |
| UI-05 | Nedostupna pretplata | Uz privremeno isključen `allow_subscription` na kozjem mleku: dugme „Redovna dostava“ onemogućeno, uz objašnjenje „Za ovaj proizvod je moguća samo jednokratna kupovina.“ Baza je odmah vraćena u prvobitno stanje. |
| UI-05b | Neaktivan proizvod | `/proizvodi/domaci-jogurt-1l` vraća pravu 404 stranicu sa linkom nazad na ponudu, ne praznu karticu. Grana „Ovaj proizvod trenutno nije dostupan.“ u konfiguratoru je odbrambena i nije dostižna sa trenutnim katalogom, pa nije izvršena. |
| UI-06 | Dodavanje, zatvaranje, reload | Značka pokazuje 2, korpa zadržava stavku |
| UI-07 | Meni pa korpa | Samo korpa aktivna, pozadina zaključana, nema konkurentskih traka |
| UI-08 | `POST /api/cart` vraća 500 | Stavke sačuvane, greška vidljiva, dugme za plaćanje neaktivno |
| UI-09 | Jednokratno + pretplata u istoj korpi | Proizvodi 1.700, dostava 2 × 350, ukupno 2.400 RSD, oznaka „Za ovaj obračun“ |
| UI-10 | Tastatura | Fokus ulazi u korpu, ostaje zarobljen kroz 30 Tab pritisaka, Escape vraća fokus na dugme |
| UI-11 | Smanjeno kretanje i nedostupan medij | Statična kompozicija, bez video zahteva, bez zadržanog praznog prostora |
| UI-12 | Skrol, navigacija, Back | Jedan video element, bez zaostalog Three.js canvasa, pozicija skrola vraćena |

Provera prelivanja na 360, 375, 390, 430, 768, 1024 i 1440 px, na rutama `/`,
`/prodavnica`, `/proizvodi/[slug]`, `/korpa`, `/checkout`, `/faq`, `/nalog`: bez
horizontalnog prelivanja.

Vizuelni kadrovi na 0, 25, 50, 75 i 100 % animacije za telefon i desktop nalaze se u
`docs/redesign-screenshots/`.

---

## 5. Performanse

Mereno kroz `requestAnimationFrame` tokom skrolovanja kroz celu scenu i nazad, 179
kadrova po prolazu.

| Uslov | Median | p95 | Najgori kadar | Kadrova preko 50 ms |
| --- | --- | --- | --- | --- |
| Desktop 1440, bez usporenja | 16,7 ms | 16,8 ms | 16,9 ms | 0 |
| Telefon 390, CPU usporen 4× | 16,7 ms | 16,8 ms | 16,8 ms | 0 |

Pri prvom merenju telefon je imao p95 od 217 ms i deset zaglavljenih kadrova. Uzrok je
bio gomilanje zahteva za premotavanje: kontroler je tražio novu poziciju i dok dekoder
još nije završio prethodnu. Rešeno tako što se nova pozicija ne postavlja dok je
`video.seeking` tačno, uz produžetak petlje za jedan kadar da klip uvek stigne na
poziciju na kojoj je čitalac stao.

Veličine izvoza su unutar budžeta iz plana, poglavlje 10: desktop video 2,34 MB
(budžet 5 MB), mobilni 1,45 MB (budžet 2,5 MB), desktop poster 60 KB (budžet 250 KB),
mobilni poster 27 KB (budžet 150 KB).

**Core Web Vitals iz plana nisu potvrđeni.** LCP, INP i CLS su terenske metrike na 75.
percentilu stvarnih poseta; lokalno merenje na dev serveru to ne dokazuje. Ovo ostaje
otvoreno do merenja na produkciji.

---

## 6. Pristupačnost

`axe-core` preko Playwrighta na `/`, `/prodavnica`, `/checkout` i `/privatnost`, na
390 px i 1440 px: **nula ozbiljnih i kritičnih nalaza.**

Tokom rada je otkriven i ispravljen stvaran problem kontrasta: prva vrednost tokena
`--muted` (`#6b7a72`) davala je 4,07:1 na mlečnoj i 3,72:1 na toplijoj podlozi, ispod
praga 4,5:1, i pogađala je ceo podnožni deo sajta na svakoj ruti. Token je zatamnjen na
`#58655d`.

Izmereni kontrasti nove palete:

| Kombinacija | Odnos |
| --- | --- |
| Tamna na mlečnoj | 14,35 |
| Prigušena na mlečnoj | 5,52 |
| Prigušena na toploj podlozi | 5,05 |
| Kobalt na mlečnoj | 6,39 |
| Bela na kobaltu | 7,09 |
| Tamna na puteru | 10,83 |

**Napomena o paleti i logotipu.** Zvanični logotip je tirkizno-petrol plav (`#2f7184`).
Kobalt iz plana (`#2146db`) je izrazitije i hladnije plav. Obe boje prolaze kontrast i
rade zajedno na mlečnoj podlozi, ali stoje jedna pored druge u zaglavlju. Ovo je
svesna odluka dizajna iz brifa, ne previd. Ako se pokaže da odudara, predlažem da se
kobalt zadrži samo za akcije, a identitetske površine ostanu u tirkiznoj.

---

## 7. Medij: šta je generisano i šta nedostaje

Higgsfield je bio dostupan i generisanje je odobreno u ovoj sesiji. Detalji su u
`docs/higgsfield-generation-log.md`. Ukratko:

- Četiri referentne slike (`gpt_image_2`) i tri video generacije
  (`cinematic_studio_3_0`), oko 266 kredita.
- Prva desktop generacija je **odbačena** jer je oko 2 s prikazala drugu flašu koja sipa
  mleko i koja nestaje do 4 s. Po H11 to je prekid kontinuiteta objekata. Jedna ciljana
  izmena, koja je menjala samo uslov kontinuiteta, dala je prihvatljiv rezultat.
- Mobilna verzija je prihvaćena iz prve.

**Status materijala je privremen, ne finalan.** Ambalaža u sceni potiče iz 3D rendera
`public/images/3d/milk-bottles.png`, koji nosi zvanični logotip, ali nije fotografija
fizičke flaše. Uz to, katalog sadrži dve nesaglasne ambalaže: fotografije u
`public/images/catalog/` prikazuju krem papirnu etiketu sa zelenom kravom, a 3D render
tirkizni okrugli logotip sa ćiriličnim natpisom. **Koja je stvarna ambalaža je pitanje
za vlasnika i mora se rešiti pre objave.**

Manifest u `public/media/hero/manifest.json` i `app/lib/hero-media.ts` nose
`status: "temporary"`. Test pada ako se ta dva zapisa raziđu ili ako neki navedeni fajl
ne postoji, pa hero nikad ne može da pokazuje na nepostojeći fajl.

---

## 8. Šta nije urađeno i zašto

| Stavka | Razlog |
| --- | --- |
| „Ponovi prethodnu porudžbinu“ (G08) | Zahteva rad na nalogu i istoriji porudžbina koji izlazi izvan redizajna prodajnog toka. Postojeće rute nisu dirane. |
| Pregled pre pretvaranja u pretplatu (G09) | Postojeća `POST /api/orders/convert-to-subscription` ruta radi preko tokena; novi marketinški tok traži nepromenljiv preview ugovor koji još ne postoji. Nije improvizovano. |
| „Dodaj samo sledećoj dostavi“ (G06) | Ova akcija stvarno pokreće naplatu. Traži preview rutu, `expectedVersion`, idempotency ključ i obradu 409. Nije bezbedno uraditi bez tih provera. |
| Donja kupovna traka na početnoj | D10 je dozvoljava, ali zabranjuje prikaz proizvoljnog zbira pre izbora proizvoda. Sekcija ponude je odmah ispod uvoda, pa traka ne bi donela korist, a rizikovala bi drugu fiksnu traku. Traka postoji na stranici proizvoda, gde ima tačan iznos. |
| Blok recenzija | Nema autentičnog sadržaja. Po D02 blok se izostavlja, a ne puni praznim zvezdicama. |
| Merenje izlaganja ponude na 50 % kroz sekundu | Vidi odeljak 3. |

Tri stavke iznad (G06, G08, G09) su jedini delovi zadatog paketa koji nisu isporučeni.
Sve su finansijski osetljive i tražile bi nove serverske rute; radije su ostavljene
neimplementirane nego improvizovane.

---

## 9. Rezultati provera

| Komanda | Rezultat |
| --- | --- |
| `npm run typecheck` | Prolazi |
| `npm run lint` | Prolazi |
| `npx playwright test` (sva tri projekta) | **45 prolazi, 0 pada, 3 preskočena** |
| `node --test tests/*.test.mjs` | 58 testova, 24 prolazi, 34 pada |

### O 34 pada u node test paketu

Ovo je **ranije postojeći problem okruženja, ne regresija.** Provereno tako što je
napravljen izolovan `git worktree` na nepromenjenom `HEAD` i pokrenut isti paket:

| | Testova | Prolazi | Pada |
| --- | --- | --- | --- |
| `HEAD` bez izmena | 55 | 21 | 34 |
| Sa redizajnom | 58 | 24 | 34 |

Spisak imena testova koji padaju je **identičan** pre i posle. Tri nova testa su moja
i sva tri prolaze.

Uzrok: ovi testovi se izvršavaju nad Cloudflare Worker buildom, čiji libsql klijent ne
podržava `file:` URL-ove (`URL_SCHEME_NOT_SUPPORTED`), pa svaki upit u bazu puca.
Paketu treba okruženje sa D1 ili Turso vezom.

Uz to, `npm test` se **uopšte ne pokreće na Windowsu**: skripta `build:worker` koristi
POSIX prefiks `WRANGLER_LOG_PATH=... vinext build`, što `cmd` ne razume. Za proveru sam
build pokretao ručno uz postavljenu promenljivu. Ako se želi da paket radi i na
Windowsu, `cross-env` ili premeštanje promenljive u `wrangler` konfiguraciju rešava to.
Nisam menjao skriptu jer je van obima redizajna.

### Ažurirani testovi

Četiri postojeća testa opisivala su stari dizajn i više nisu mogla da prolaze:
`storefront-motion.spec.ts` i `compact-commerce.spec.ts` su prepisani za novi uvod i
konfigurator, a ciljani delovi `production-readiness.spec.ts` i
`account-admin-flows.spec.ts` prevedeni su na nove selektore. Tvrdnje o ponašanju su
zadržane, promenjeni su samo selektori i one tvrdnje koje su opisivale ukinute
vizuelne odluke starog dizajna.

`tests/rendered-html.test.mjs` je već pre mog rada tvrdio naslov
„Pravo mleko. Bez odlaska u nabavku.“ koji ne postoji u `HEAD` verziji `app/page.tsx`,
pa je i ranije padao na toj liniji. Ažuriran je na novi naslov.

Dva stvarna problema rasporeda otkrivena su novim testovima i ispravljena u CSS-u, a ne
popuštanjem tvrdnji: fotografija u konfiguratoru bila je 439 px visoka na tabletu, a
fotografija proizvoda 784 px na desktopu, što je u oba slučaja guralo cenu i dugme
predaleko.

---

## 10. Otvorene stavke za vlasnika

1. **Koja je stvarna ambalaža?** Katalog i 3D render pokazuju dve različite etikete.
   Dok se to ne razreši, hero materijal ostaje označen kao privremen.
2. **Opisi proizvoda u bazi su u množini („vaš“, „izaberite“).** Novi sajt se obraća u
   jednini. Tekstove u katalogu nisam menjao jer su podatak vlasnika, ne dizajn.
   Menjaju se kroz administraciju.
3. **Cena pretplate je jednaka jednokratnoj.** Zbog toga redovna dostava nema nijednu
   cenovnu prednost. Ako je to namera, u redu; ako nije, to je komercijalna odluka koja
   utiče na ceo tok pretplate.
4. **Svi paketi su neaktivni.** Blok „Gotove kombinacije“ postoji u kodu i pojaviće se
   čim se neki paket aktivira sa isključivo aktivnim komponentama.
5. **Prag besplatne dostave je 0.** Motivaciona traka ostaje isključena dok se prag ne
   potvrdi kao poslovna odluka.
6. **Three.js više nije u upotrebi.** Stari uvod `milk-scene.tsx` i
   `milk-scene-renderer.ts` ne koristi nijedna ruta. Zavisnost `three` i dalje stoji u
   `package.json`. Fajlove nisam brisao; uklanjanje je čist dobitak na veličini paketa
   kada potvrdite da vam više ne trebaju.

---

## 11. Status isporuke

Interfejs je kompletan i funkcionalan. Kupovina radi kroz postojeće API-je i serverski
obračun. Uvod je dinamičan, prati skrol, i drži 60 fps i pod četvorostrukim usporenjem
procesora.

Filmski deo je **nedovršen u smislu ambalaže**: prikazana flaša je generisana iz 3D
rendera, a ne fotografisana. Sve ostalo u sceni je prihvaćeno po kriterijumima iz H11.

Produkciona podešavanja nisu menjana i sajt nije objavljivan.
