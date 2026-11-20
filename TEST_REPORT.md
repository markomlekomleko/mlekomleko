# TEST_REPORT — Mleko i Mleko (Faza 2)

Datum: 20–21. 11. 2026. Plan: `TEST_PLAN.md`. Okruženje: lokalno, SQLite u memoriji (API testovi) i zasebna SQLite baza (pregledač), simulirano plaćanje, fiskalizacija i mejl. Produkciona baza i `.env.local` iz glavnog foldera nisu korišćeni.

Pravilo o bagovima je promenjeno tokom rada (poruka vlasnika): siguran bag se ispravlja u kodu, a ono što je poslovna odluka ostaje netaknuto i ide u pitanja.

## 1. Rezime

| Paket | Testova | Prošlo | Palo | Napomena |
| --- | --- | --- | --- | --- |
| `npm test` (API i logika) | 788 | 787 | 0 | 1 `todo` = otvoreno pitanje A32; pre Faze 2 bilo je 511 testova |
| Pregledač, telefon 390 px | 81 | 79 | 0 | 2 preskočena; pun prolaz dao je 77 + 2 pala, ta dva su bila greške u testu i prošla su u ponovljenom prolazu svojih fajlova |
| Pregledač, kompjuter 1440 px | 81 | 78 | 0 | 3 preskočena; pun prolaz dao je 76 + 2 pala, isto kao gore |

Novi fajlovi: `tests/tp-a-one-time`, `tp-b-subscription-create`, `tp-c-subscription-matrix` (+`-2`), `tp-d-zone`, `tp-e-time`, `tp-g-security-webhooks` (277 testova) i `tests/e2e/tp-*.spec.ts` (25 testova po širini ekrana). Postojeći testovi u pregledaču su prepravljeni na novi sajt; `hero-loop.spec.ts` je uklonjen jer ta komponenta više ne postoji.

**Nije moglo da se testira:**
- pravi platni provajder, prekinuto plaćanje na strani banke, promena kartice — ne postoji bankarski adapter, samo sinhroni mock;
- prava fiskalizacija i pravo slanje mejla/SMS-a — proveren je samo red za slanje (tema, primalac, bez duplikata);
- PostgreSQL — jedina dostupna baza je produkciona;
- tablet 768 px nije pokretan;
- poništavanje preskakanja i promena dana dostave — te akcije ne postoje (pitanja 4 i 5).

Stvarni ispis `npm test`:

```
ℹ tests 788
ℹ pass 787
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 1
```

Stvarni ispis pregledača je u odeljku 5.

## 2. Matrica pokrivenosti: stanje × akcija × pre / posle roka

✓ = ponaša se po pravilu (dozvoljeno ili ispravno odbijeno), ✓* = bio bag, ispravljeno, ? = pravilo nije definisano. „Posle roka“ = stranica otvorena pre roka, klik minut posle. Odbijanja: DL = `DELIVERY_LOCKED`, ISS = `INVALID_SUBSCRIPTION_STATE`, SC = `SUBSCRIPTION_CANCELLED`, QD = `QUANTITY_DECREASE_NOT_ALLOWED`.

| Stanje | preskoči | pauziraj | nastavi | otkaži | +litri jednom | +litri redovno | smanji | ukloni | adresa |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 aktivna, paket neplaćen | ✓ / ✓DL | ✓ / ✓DL | ✓ISS / ✓ISS | ✓ odmah otkazana / ✓DL | ✓ 250 / ✓DL | ✓ 1.000 / ✓DL | ✓QD / ✓DL | ✓QD / ✓DL | ✓ / ✓DL |
| 2 aktivna, paket plaćen | ✓ / ✓DL | ✓ / ✓DL | ✓ISS / ✓ISS | ✓ obnova isključena / ✓DL | ✓ / ✓DL | ✓ / ✓DL | ✓QD / ✓DL | ✓QD / ✓DL | ✓ / ✓DL |
| 3 sa preskočenom nedeljom | ✓ / ✓DL | ✓ / ✓DL | ✓ISS / ✓ISS | ✓ / ✓DL | ✓ / ✓DL | ✓ / ✓DL | ✓QD / ✓DL | ✓QD / ✓DL | ✓ / ✓DL |
| 4 pauzirana | ✓ISS / ✓ISS | ✓ produžava / ✓DL | ✓ / ✓* | ✓ / ✓DL | ✓ISS (?) | ✓ISS (?) | ✓ISS | ✓ISS | ✓ / ✓DL |
| 5 obnova isključena, paket teče | ✓ / ✓DL | ✓ / ✓DL | ✓ISS / ✓ISS | ? drugi put prolazi / ✓DL | ✓ / ✓DL | ✓ / ✓DL | ✓QD / ✓DL | ✓QD / ✓DL | ✓ / ✓DL |
| 6 otkazana | ✓SC | ✓SC | ✓SC | ✓SC | ✓SC | ✓SC | ✓SC | ✓SC | ✓ samo profil |

Preskakanje, pauza i otkazivanje provereni su i tačno minut pre roka (dozvoljeno) u svim stanjima. Posle svake dozvoljene akcije proverene su četiri stvari: baza, prikaz kupcu (`/api/account`), admin lista za taj dan i red obaveštenja (tačno jedno).

**Ostale oblasti**

| Oblast | Rezultat |
| --- | --- |
| A. Jednokratno: količine 2 / 100 / 101 / 1 / 0 / negativno / decimalno; gost i prijavljen; dupli klik, ponovljen zahtev, 15 paralelnih → jedna porudžbina | ✓ |
| A. Isti ključ, drugo telo, paralelno | ✓* |
| A. Odbijena mock kartica → ništa ne ostaje u bazi | ✓ |
| A. Datum: prošli, dan bez dostave, praznik, minut pre / tačno / minut posle roka, zaključana tura | ✓ (korpa ✓*, prošli datum ✓*) |
| A. Otkazivanje pre/posle roka; povraćaj pre roka; drugi zahtev za povraćaj | ✓ (drugi zahtev ✓*) |
| A. Povraćaj posle roka / posle zaključavanja | ? (pitanja 3, A32) |
| B. Pretplata utorak BG, petak BG, petak NS; NS utorak i dvonedeljno odbijeno; iznos 4 × litri × 250 + 4 × 350 | ✓ |
| B. Prijava minut pre i posle roka; praznik u paketu i kao prvi datum; neplaćen / plaćen paket; neuspela prva naplata ne ostavlja pretplatu | ✓ |
| B. Druga pretplata istog kupca | ? (pitanje 1) |
| C. Nizovi: pauza nedelju dana kroz dnevni posao, 3 meseca i dan duže, tri preskakanja zaredom, preskoči pa pauziraj, pauziraj pa otkaži, otkaži pa kupi ponovo, doplate usred paketa, neuspela kartična obnova (3 pokušaja), dve istovremene izmene → jedna pobeđuje | ✓ |
| D. Zona: oba grada prolaze; Niš, Inđija, nepoznat i neispravan broj odbijeni; ćirilica / latinica / bez kvačica / velika slova / razmaci / Zemun / Petrovaradin; broj koji ne odgovara gradu; selidba van zone (pretplata netaknuta); utorak BG → NS odbijeno, petak BG → NS dozvoljeno | ✓ |
| E. Jedna pretplata dan po dan 8. 1 – 27. 3. 2027: kupovina → 4 dostave → obnova → uplata → preskok → pauza → nastavak → otkazivanje → kraj; tačno 2 × 3.400 RSD, 16 l | ✓ |
| E. Prelaz godine; letnje/zimsko vreme (rok ostaje 19:00 po lokalnom); praznici; dnevni posao 4× i paralelno; nadoknada posle 6 propuštenih dana | ✓ (paralelni odgovor ✓*) |
| G. Tuđi ID na svim `/api/account/**` i `/api/orders/**` rutama; bez sesije; pogrešan `Origin`; admin rute; uloge vozač / finansije; ograničenja broja pokušaja | ✓ |
| G. Webhook: pogrešna tajna, dupli, paralelni, zakasneli „plaćeno“, „plaćeno“ posle „neuspelo“ | ✓ |
| G. Webhook: zakasnelo „neuspelo“ na plaćenoj porudžbini | ✓* |
| G. Webhook: „vraćeno“ pre „plaćeno“; „plaćeno“ na otkazanoj porudžbini | ? |
| G. Promo kodovi: procenat i fiksno, dostava se ne umanjuje, limit (i paralelno), prva kupovina, uz nagradu vernosti | ✓ |
| Pregledač: jednokratno 1.050, pretplata 5.400, nalog (preskok, pauza, nastavak, doplate, otkazivanje), zona, admin, bez vodoravnog skrola na 390 px | ✓ |

## 3. Bagovi (svi ispravljeni osim A32)

Poređani po ozbiljnosti; prvo ono što dira novac ili dostavu.

| # | Bag | Bilo | Sada | Uzrok / ispravka | Test |
| --- | --- | --- | --- | --- | --- |
| 1 | **Uplata paketa posle preskakanja** vraćala 500 | Admin označi paket kao plaćen dok postoje dve otvorene liste (stari i novi datum) → `UNIQUE … generation_key`, uplata se ne evidentira | Uplata prolazi | `server/packages.ts:54`, `server/admin.ts:405`: isti ključ upisivan u više redova; sada je jedinstven po listi | `tests/e2e/tp-account-self-service` TP-3 |
| 2 | **Nastavak pauze odmah posle roka** izbacuje dostavu sa ture | Stranica otvorena pre roka, klik „nastavi“ posle roka → sledeća dostava prelazi na narednu nedelju, a već dospela nestaje sa liste | Dospela dostava ostaje na turi | `server/commerce.ts` (resume nije poštovao rok) | `tp-c-subscription-matrix`: paused × resume, 1 min posle roka |
| 3 | **Zakasnelo „neuspelo“** kvari plaćenu porudžbinu | Posle `paid`, novi događaj `failed` → porudžbina postaje „neuspela“ iako je račun već zatražen (samo mock webhook) | Događaj se beleži i ignoriše | `app/api/webhooks/payments/route.ts:34` | `tp-g…` G7f |
| 4 | **Drugi zahtev za povraćaj** → 500 | Sirova greška baze | 409 `REFUND_ALREADY_REQUESTED` | `server/refunds.ts:29` | `tp-a…` A30 |
| 5 | **Isti ključ, drugo telo, paralelno** → 500 | Jedan zahtev prolazi, drugi puca | 409 `IDEMPOTENCY_CONFLICT` | `server/commerce.ts:365` | A15 |
| 6 | **Korpa nudi termin koji je admin zaključao** | `/api/cart` kaže da može, checkout odbija | Korpa i checkout koriste istu proveru | `server/commerce.ts:163` | A24b |
| 7 | **Odbijena porudžbina za prošli datum** ostavlja red u `deliveries` | Bilo ko je mogao da pravi redove za proizvoljne prošle datume | Zaključava se samo stvarna predstojeća tura | `server/delivery-cutoff.ts:19` | A20 |
| 8 | **Dnevni posao pokrenut dvaput istovremeno** → drugi vraća 500 | Bez duplikata, ali preskače završno slanje poruka | Drugi završava čisto | `server/billing.ts:45` | E5b2 |
| 9 | **Latinica gubi `/sr-latn`** u linkovima | Kupac na latinici klikne „na plaćanje“ i vrati se na ćirilicu | Linkovi čuvaju jezik | `app/lib/i18n/render.tsx` | `i18n.spec.ts` |
| 10 | **Kontrast** dana u odbrojavanju 3,83 : 1 (traži se 4,5) | Samo na širim ekranima | Puna bela | `app/styles/final-spec.css` | axe provere u `production-readiness`, `i18n` |
| 11 | **Visina zaglavlja na telefonu** ne odgovara tokenu `--header-stack` (104 vs 121 px) | Sidra i lepljivi elementi pomereni 17 px | Token prati dva reda trake | `app/styles/final-spec.css` | `shell.spec.ts` |

**Nije ispravljeno — čeka odluku (A32):** zahtev za povraćaj plaćene jednokratne porudžbine prihvata se za ceo iznos (1.050 RSD) i kad je tura već zaključana i mleko spremljeno. Uzrok: `server/refunds.ts:17` koristi fiskalni ostatak, a `server/fiscomm.ts:164` broji samo uručeno. Izvršenje je delimično zaštićeno proverom `REFUND_CHANGED`, ali zahtev i odobrenje prolaze. Test: `tp-a-one-time` A32 (označen kao `todo`).

## 4. Otvorena pitanja o poslovnim pravilima

Pitanja 1–13 su i u dokumentu za klijenta (`docs/klijent/Mleko-i-Mleko-pitanja-za-potvrdu.docx`, brojevi 15–27).

1. Sme li jedan kupac da ima dve pretplate u isto vreme? Sada sme (dva stajanja istog dana na istoj adresi).
2. Gotovinska pretplata je aktivna čim se poruči. Šta ako kupac ne plati pri prvoj dostavi? Sada: ulazi u pripremu samo prva dostava; ostale tek posle evidentirane uplate.
3. Povraćaj posle roka ili posle zaključavanja ture: ceo iznos, deo ili ništa; da li se vraća dostava? (A31, A32)
4. Poništavanje preskakanja ne postoji. Da li treba?
5. Promena dana dostave (utorak ↔ petak) ne postoji kao akcija kupca. Da li treba?
6. Neplaćen obnovljeni paket: koliko dugo čekamo pre zaustavljanja dostava? Kod kartice dnevni posao ne pokušava ponovo sam; pretplata ostaje „aktivna“ bez dostava.
7. Prijavljen kupac sa drugim mejlom u formi: porudžbina ide na taj drugi mejl. Vezati za nalog?
8. Promena adrese bez „primeni na pretplatu“: nalog pokazuje novi grad, pretplata ide na staru adresu. Uvek primeniti?
9. Promo kod važi samo za prvi paket; obnova je po punoj ceni. U redu?
10. Kod „samo prva kupovina“ može ponovo posle otkazane prve porudžbine. U redu?
11. Dok je pauzirana, pretplata ne prima ni dodatne litre ni preskakanje. U redu?
12. Vozač može sam da zaključa turu pre roka. Dozvoliti?
13. Lista može da se zaključa mesecima unapred. Zabraniti?

Tehnička pitanja (nisu u dokumentu za klijenta):

14. Otkazivanje kad je obnova već isključena prolazi drugi put i šalje drugo obaveštenje „pretplata je otkazana“.
15. Akcija sa stranice otvorene pre roka dobija `DELIVERY_LOCKED` umesto da se primeni na sledeću dostavu; radi tek posle osvežavanja.
16. Webhook `refunded` pre `paid`, i `paid` na otkazanoj porudžbini: sada se oba prihvataju. Važno tek kad se poveže banka.
17. Praznik unet posle kupovine: datum na porudžbini paketa i datum pretplate mogu da se razlikuju za nekoliko dana (prikaz kupcu je tačan).
18. `/api/cart` za adresu van zone vraća 200 sa `serviceable: false`, a checkout odbija. Plan je pretpostavio odbijanje; ovo je verovatno namerno (prikaz cene pre unosa adrese).
19. Promena adrese ne šalje nikakvo obaveštenje.

## 5. Ispis testova u pregledaču

Poslednji pun prolaz (`npx playwright test --project=…`):

```
== mobile-390
  2 failed
    account-admin-flows.spec.ts:147 › catalog editors preserve decimal prices, report duplicates and switch bundle contents
    admin-workspace.spec.ts:635 › admin settings expose every editor with keyboard navigation and no horizontal overflow
  2 skipped
  77 passed (4.5m)
== desktop-1440
  2 failed (ista dva testa)
  3 skipped
  76 passed (3.7m)
```

Oba pada su bila u testovima, ne u sajtu: očekivali su tab „Paketi“ i arhiviranje proizvoda koji je u paketu, a paketi su po odluci vlasnika isključeni (`app/lib/features.ts`). Posle ispravke testova, ta dva fajla na obe širine:

```
npx playwright test tests/e2e/account-admin-flows.spec.ts tests/e2e/admin-workspace.spec.ts --project=mobile-390 --project=desktop-1440
  25 passed (1.1m)
```

Pun prolaz posle te poslednje ispravke nije ponovljen. Tablet (768 px) nije pokretan.

Preskočeni testovi: stari prekidač animacije (više ne postoji), strelice slajdera na telefonu (sakrivene ispod 768 px), traka za kupovinu i mobilni meni koji važe samo za jednu širinu.
