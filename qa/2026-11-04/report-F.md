# Izveštaj Agenta F — automatski testovi kritičnih flowova (2026-11-04)

Rezultat: **83 testa** (76 domenskih u `node --test` + 7 Playwright). **78 PASS, 5 FAIL** (5 FAIL su stvarni nalazi, ostavljeni da padaju). Lint i typecheck prolaze.
Ponovljeno 3x zaredom: stabilno (71/5 domenski), Playwright 7/7.

## Fajlovi
| Fajl | Testova | Sadržaj |
| --- | --- | --- |
| `tests/qa-harness.mjs` | – | zajednički harness (nije `.test.mjs`, `npm test` ga ne hvata): sopstvena in-memory SQLite (`tests/sqlite-d1.mjs`), zamrznut sat, `fetch` zamenjen zaštitom (svaki poziv ka mreži baca grešku), prefiks `TEST-F-` |
| `tests/qa-auth.test.mjs` | 23 | auth (kupac, demo, CSRF, admin, staff) |
| `tests/qa-checkout.test.mjs` | 30 | checkout, plaćanje, promo, admin uplata, webhook |
| `tests/qa-fiscal.test.mjs` | 23 | fiskalizacija (FISCOMM_MODE=mock + 2 testa sa lokalnim `fetch` stub-om za live odgovor) |
| `tests/e2e/qa-critical.spec.ts` | 7 | iste kritične ugovore, ali preko pravog Next.js runtime-a (domenski testovi rade nad Vinext worker bundle-om) |

## Kako se pokreću (tačne komande)
```
# 1. jednom (ili posle izmene app koda): izgradnja worker bundle-a -> dist/ (Vinext; NE Next build)
npm run build:worker && git checkout -- next-env.d.ts   # vinext prepisuje next-env.d.ts; scripts/test-worker.mjs ga vraća
# 2. pojedinačni fajlovi, bez dodatnog builda
node --test tests/qa-auth.test.mjs
node --test tests/qa-checkout.test.mjs
node --test tests/qa-fiscal.test.mjs
node --test tests/qa-*.test.mjs                 # sva tri
node --test --test-name-pattern="F-C04" tests/qa-fiscal.test.mjs
# 3. e2e (podiže sopstveni dev server na 4173, .next-e2e i .data/e2e-<pid>.sqlite; ne dira 3100)
npx playwright test tests/e2e/qa-critical.spec.ts --project=desktop-1440
npm run lint && npm run typecheck
```
Napomene: `npm test` (scripts/test-worker.mjs) sam radi `build:worker` pa `node --test tests/*.test.mjs`, pa će nove fajlove automatski uključiti — **dok se 5 nalaza ne ispravi, `npm test` će padati na njima** (namerno). Da bi CI ostao zelen do popravke, nalazi se mogu privremeno označiti `{ todo: true }`. Pojedinačni domenski testovi traže samo postojeći `dist/server/index.js` (postojalo nije — napravljen sa `npm run build:worker`, `dist/` je u .gitignore). Playwright pokretanje prepisuje `next-env.d.ts` (dev server), vratiti ga: `git checkout -- next-env.d.ts` ili iz backup-a.

## Slučajevi
### A. Auth (`tests/qa-auth.test.mjs`)
| ID | Pokriva | Status |
| --- | --- | --- |
| F-A01 | registracija bez lozinke → verify → sesija: HttpOnly/SameSite=Lax/bez Secure na http, 30 dana, u bazi samo SHA-256 tokena i HMAC koda, token se ne vraća u /api/account | PASS |
| F-A02 | granica pogrešnog koda: 4 pogrešna + tačan prolazi; 5 pogrešnih zaključava (i tačan kod → 401), attempts staje na 5, nema korisnika/sesije | PASS |
| F-A03 | istek izazova na milisekundu (299.999 s ok, 300.000 s mrtav) | PASS |
| F-A04 | kod vezan za svoj izazov, ponovna upotreba posle uspeha 401, malformiran unos 422 | PASS |
| F-A05 | nepoznat email = isti odgovor (bez enumeracije), nema izazova u bazi | PASS |
| F-A06 | cooldown 1/min i satni limit 6 po primaocu, važi preko različitih IP adresa | PASS |
| F-A07 | odjava opoziva sesiju; strani/nedostajući Origin ne može da odjavi; odjava bez kolačića bezopasna; Max-Age=0 | PASS |
| F-A08 | istekla sesija (expires_at manipulacija, granica ±1 ms), nepoznat/kratak/predugačak token, bez kolačića; mutacija sa isteklom sesijom 401 | PASS |
| F-A09 | sesijski token nije prihvaćen kao admin Bearer; magic_link red nije sesija | PASS |
| F-A10 | demo sesija read-only: GET radi, PATCH profil/pretplata/porudžbina, refund, login-settings, whatsapp, checkout → 403 DEMO_READ_ONLY; bez ijedne porudžbine/outbox reda; 8 h; DEMO_LOGIN_ENABLED=false gasi žive demo sesije | PASS |
| F-A11 | CSRF matrica: 11 cookie/auth mutacija × 6 loših Origin-a (strani, drugi port, look-alike, "null", bez headera) → 403 CSRF_REJECTED, stanje bazi nepromenjeno; GET sa stranim Origin-om radi | PASS |
| F-A12 | /api/auth/magic-link → 410, ne pravi tokene/outbox | PASS |
| F-A13 | admin login: pogrešna lozinka/korisnik/bez Origin → 403; uspeh = 8 h bearer, u bazi samo hash | PASS |
| F-A14 | admin throttle: 10 pokušaja/IP/15 min, 11. = 429 i uz tačnu lozinku, drugi IP slobodan, posle prozora ok | PASS |
| F-A15 | DELETE /api/admin/access opoziva token odmah; ponovljen/bez tokena bezopasan | PASS |
| F-A16 | istekla admin sesija (granica), neispravni bearer oblici, legacy x-admin-secret mrtav kad su podešeni ADMIN_EMAIL/PASSWORD, rotacija ADMIN_PASSWORD poništava sesije | PASS |
| F-A17 | admin 503 ADMIN_NOT_CONFIGURED kad nema/prekratki kredencijali | PASS |
| F-A18 | matrica uloga: driver 403 na orders/customers/staff/settings/integrations, 200 na deliveries; finance GET orders+dashboard 200, PATCH/POST/bulk-payment 403, deliveries/products 403; manager sve osim staff (i ne može da napravi staff); owner sve + lični actor u audit_log | PASS |
| F-A19 | pravila kreiranja osoblja: slaba lozinka, bez lozinke, rola owner/root, loš email; hash je salted scrypt, lista ne izlaže lozinke | PASS |
| **F-A19b** | duplikat emaila osoblja mora biti čist 4xx | **FAIL (nalaz N-3)** |
| F-A20 | deaktivacija poništava žive sesije i login; reaktivacija radi; promena lozinke poništava sesije | PASS |
| **F-A21** | parcijalni update (samo fullName) ne sme da reaktivira deaktiviran nalog | **FAIL (nalaz N-2)** |
| F-A22 | eskalacija uloge nemoguća (manager ne zove staff, enum bez owner) | PASS |

### B. Checkout / plaćanje (`tests/qa-checkout.test.mjs`)
| ID | Pokriva | Status |
| --- | --- | --- |
| F-B01 | Idempotency-Key replay: isti odgovor bajt-po-bajt, nezavisno od redosleda polja, 1 porudžbina, 1 order.created | PASS |
| F-B02 | isti ključ + drugi body (količina, email, datum, napomena) → 409 IDEMPOTENCY_CONFLICT; novi ključ = nova porudžbina | PASS |
| F-B03 | ključ obavezan, 8–200 znakova (7 → 422, 201 → 422, 200 ok) | PASS |
| F-B04 | cene/total/status/popust iz klijenta ignorisani (i na nivou stavke, `paymentStatus:paid` ne fiskalizuje) | PASS |
| F-B05 | /api/cart kvota == checkout total (promo 10% zaokruženo naniže 3333, dostava se ne popustuje) | PASS |
| F-B06 | PAN/CVV: 14 varijanti (cardNumber, pan, cvc, CVV, expiry, cardholder, ugnežđeno/niz, token kao PAN sa razmacima/crticama, Amex) → 422 CARD_DATA_REJECTED, ništa u bazi | PASS |
| **F-B06b** | alternativna imena (card_number, cardNo, cc_number, securityCode, card_cvv, card-number) | **FAIL (nalaz N-4)** |
| F-B07 | kartica bez adaptera (PAYMENT_MODE disabled/unset/''/production/live) → 503 PAYMENT_METHOD_UNAVAILABLE, gotovina radi | PASS |
| F-B08 | mock kartica: token obavezan, `mock-decline` → 402 bez porudžbine i bez idempotency reda, uspeh = paid + 1 fiskalni avans | PASS |
| F-B09 | nepoznat/prazan paymentMethod → 422 | PASS |
| F-B10 | minimalna porudžbina: tačna granica, bez dostave, pre popusta | PASS |
| F-B11 | nevalidne zone (99999, 11, 1100x, prazno, Niš, Pančevo, Inđija zatvorena, grad≠PTT) → 422, nema kupca | PASS |
| F-B12 | Novi Sad samo petak, Beograd utorak+petak, ostali dani 422 | PASS |
| F-B13 | loši formati datuma (13/45, 30. feb, ISO sa vremenom, SQL string…) 422; bez datuma → sledeći termin; praznik → DELIVERY_HOLIDAY | PASS |
| F-B14 | cutoff: 06:59:59.999Z prolazi, 07:00:00.000Z → 409 DELIVERY_LOCKED (i /api/cart) | PASS |
| F-B15 | količina 0/-1/0.5/1e21/MAX_SAFE/'2'/null/true/[]/{} /izostavljena → 422; 1 i 100 prolaze | PASS |
| F-B16 | overflow iznosa → 422 AMOUNT_OVERFLOW | PASS |
| F-B17 | nepoznat/neaktivan proizvod, loš purchaseType/cadence, prazna/51 stavka, null/objekat umesto liste | PASS |
| F-B18 | demo email (svaka veličina slova/razmaci) → 403 DEMO_READ_ONLY | PASS |
| F-B19 | rate limit checkout: 21. zahtev = 429, drugi IP ok | PASS |
| F-B20 | promo limit upotrebe: neuspeo checkout ne troši upotrebu, poslednja upotreba jednom, replay ne troši | PASS |
| F-B21 | promo prozor: ends_at/starts_at inkluzivno na ms, +1 ms van; neaktivan, nepoznat, `<script>`, 41 znak, 6 kodova | PASS |
| F-B22 | per_customer_limit važi i uz email drugog slovnog oblika | PASS |
| F-B23 | admin PATCH paid → tačno 1 `fiscal.receipt.requested` + 1 `email.receipt.requested`, račun izdat (MOCK), ponovni paid ne dodaje ništa | PASS |
| F-B24 | expectedUpdatedAt: zastareo → 409 ORDER_VERSION_CONFLICT bez posledica; iskorišćena vrednost je zastarela | PASS |
| F-B25 | admin PATCH validacija (404, enum 422, DELIVERY_CONFIRMATION_REQUIRED, FISCAL_PAYMENT_IMMUTABLE, bez admin headera 403) | PASS |
| F-B26 | webhook: 503 osim PAYMENT_MODE=mock + APP_ENV local/test (posle provere tajne: loš secret je 401 i kad je adapter isključen), 503 bez secret-a | PASS |
| F-B27 | webhook (mock): 401 loš/nedostajući/produžen secret, plaćanje jednom, replay eventId → duplicate:true, bez drugog fiskalnog posla | PASS |
| F-B28 | webhook validacija: bez eventId/orderId, loš status, nepoznata porudžbina 404, ne-JSON, predugačak id; failed ne fiskalizuje | PASS |
| F-B29 | webhook na paketu: paid ok; failed/refunded posle uplate → 409 PACKAGE_PAYMENT_IMMUTABLE | PASS |

### C. Fiskalizacija (`tests/qa-fiscal.test.mjs`)
| ID | Pokriva | Status |
| --- | --- | --- |
| F-C01 | paket weekly 4×2: uplata (admin) → avans `MOCK-receipt:<id>:advance` fiscomm-mock; 4 isporuke (generate→lock→complete) → 4 final + 4 advance_refund; lanac final→refund→avans; SUM(finali)==avans==total; po 2 jedinice; jedinstven orderNumber; paket completed; nula HTTP poziva | PASS |
| F-C02 | email.fiscal_document.requested tek posle upisa računa: 3 mejla = 3 izdata dokumenta, ključ `fiscal-email:<operation_key>` | PASS |
| F-C03 | blokiran/neizdat dokument → nijedan mejl, nijedan dispatch | PASS |
| F-C04 | delimična isporuka 2 od 3 uz popust 1000 para (12 jedinica): jedinične cene samo 24916/24917, zbir 299000, alokacije kontinualne i nepreklapajuće (0..12), peta poseta, finali = total do pare | PASS |
| F-C05 | preskok nedelje: nema dokumenta za preskočen petak, 4 finala = avans, nema nove porudžbine | PASS |
| F-C06 | COD jednokratno: nema dokumenta pre predaje; jedan `normal` račun (`receipt:<id>:sale`) tek posle uručenja+gotovine; bez avansa/finala; ponovna potvrda = replay, 1 račun, 1 posao | PASS |
| F-C07 | dupla/trostruka potvrda iste isporuke paketa: 1 final, 1 refund, 1 posao, 1 alokacija | PASS |
| F-C08 | paralelna obrada istog outbox reda: 1 dispatch, attempts +1 | PASS |
| F-C09 | dva različita outbox reda za istu operaciju paralelno: 1 dispatch, nikad terminalni failed, drugi se završi `sent` | PASS |
| F-C10a | dispatch `unknown` → FISCAL_RECONCILIATION_REQUIRED, outbox failed (terminalno), bez novog POST, retry_failed ne vraća red | PASS |
| F-C10b | dispatch `rejected` → isto (terminalno) | PASS |
| F-C10c | `sending` svež → FISCAL_ORDER_BUSY (pending, retry); isti red stariji od 5 min → RECONCILIATION_REQUIRED | PASS |
| F-C10d | nerazrešen dispatch jedne isporuke blokira račun sledeće isporuke iste porudžbine | PASS |
| F-C11 | FISCAL_MODE_MISMATCH (mock avans, training finalizacija), bez HTTP | PASS |
| F-C12 | stari `fiscal.final.requested` → FISCAL_LEGACY_REVIEW_REQUIRED, terminalno, ništa izdato | PASS |
| F-C13 | ADVANCE_NOT_ISSUED je retry-safe klasifikacija (statička provera; grana nije dostižna kroz javne flowove – vidi dole) | PASS |
| F-C14a | nulti iznos, legacy (ne-Fiscomm) putanja → `skipped`, bez dispatch-a | PASS |
| **F-C14b** | nulti iznos uz FISCAL_PROVIDER=fiscomm ne sme da izda račun | **FAIL (nalaz N-1)** |
| F-C15 | PIB → `buyerId:"10:123456789"` u request_json avansa i svakog finala; bez PIB-a nema buyerId | PASS |
| F-C16 | ćirilični naziv (Домаће кравље млеко Ћ Ж Ђ Š) doslovno u request_json avansa i finala | PASS |
| F-C17 | live (stub) odgovor sa finalReceipt.totalAmount +0.01 → dispatch unknown, ništa final/refund izdato, posao failed (FISCAL_RESPONSE_INVALID), bez drugog POST, bez mejla | PASS |
| F-C18 | refundReceipt bez sdcDateTime → unknown | PASS |
| **F-C19** | svaki izdat mock dokument je `fiscomm-mock` i ima issued journal red | **FAIL (nalaz N-5)** |

### E. Playwright (`tests/e2e/qa-critical.spec.ts`, desktop-1440) — 7/7 PASS
F-E01 sesija/CSRF/odjava opoziva na serveru; F-E02 zaključavanje izazova + enumeracija; F-E03 demo read-only; F-E04 checkout (replay, 409, forged cene, PAN, kartica 503, količine, zona); F-E05 webhook 401/503 (PAYMENT_MODE disabled); F-E06 admin throttle/uloge/deaktivacija/DELETE; F-E07 11. admin pokušaj = 429.

## Nalazi (testovi koji PADAJU jer app ima problem)
| # | Test | Reprodukcija | Fajl:linija | Ozbiljnost |
| --- | --- | --- | --- | --- |
| N-1 | F-C14b | FISCAL_PROVIDER=fiscomm; poručiti sa promo 100% (ili potpuno pokrivenu kreditom) → `total_minor=0`, plaćeno (kartica/mock). `issueFiscomm` izdaje i šalje avans sa stavkama `unitPrice 0`, `payments:[{amount:0}]`. U live/training režimu Fiscomm to najverovatnije odbija (HTTP 4xx) → `fiscal_dispatches=rejected` → porudžbina ulazi u RECONCILIATION (blokira i kasnije isporuke); u mock-u se "izda" račun od 0,00. Preskakanje nultog iznosa postoji samo u legacy putanji. | `server/fiscomm.ts:47` (`issueFiscomm`, nema grane za `order.total_minor === 0`); poređenje: `server/fiscal-receipts.ts:65` | Srednje |
| N-2 | F-A21 | Owner deaktivira osobu (`POST /api/admin/staff {id,isActive:false}`), zatim promeni samo ime (`{id,fullName}`) → `is_active` ponovo 1, nalog može da se prijavi. `isActive` izostavljen se tretira kao `true`. | `server/staff.ts:36` (`const active = input.isActive === false ? 0 : 1`) | Srednje (privilegije; UI verovatno uvek šalje isActive) |
| N-3 | F-A19b | `POST /api/admin/staff` sa emailom koji već postoji (drugi id) → UNIQUE(email) → **500 INTERNAL_ERROR** umesto 409/422 | `server/staff.ts:40` (INSERT bez provere duplikata; šema `migrations/0017_complete_commerce.sql:26`) | Nisko |
| N-4 | F-B06b | `POST /api/checkout` sa `card_number`, `cardNo`, `cc_number`, `securityCode`, `card_cvv`, `card-number` → 201 (polja se ignorišu, ne čuvaju). Zaštita je samo regex tačnih naziva. Defense-in-depth, ne curenje (polja se ne upisuju). | `server/domain.ts:65` (`/^(card(number)?|pan|cvc|cvv|expiry|expiration|cardholder)$/i`) | Nisko |
| N-5 | F-C19 | FISCOMM_MODE=mock; paket, isporuka → red `…:advance_refund` ima `provider='fiscomm'` (live oznaka) dok su avans i final `fiscomm-mock`. `saveIssued` čita `body.fiscommMode`, a objekat `refundReceipt` ga nema. Mock povratni dokument se u izveštajima/filterima broji kao pravi, a mejl za njega nema "test" oznaku. Samo APP_ENV=local. | `server/fiscomm.ts:149` (poziva `saveIssued` sa `body.refundReceipt`) → `server/fiscomm.ts:40,42` | Nisko |

Za N-1 popravka: u `issueFiscomm` pre `snapshot`-a: ako je `Number(order.total_minor) === 0` upisati `fiscal_receipts.status='skipped'` kao u `fiscal-receipts.ts:65`. N-2: `input.isActive === undefined ? before?.is_active ?? 1 : (input.isActive === false ? 0 : 1)`. N-5: prosleđivati `{...body.refundReceipt, fiscommMode: body.fiscommMode}`.

## Šta je već bilo pokriveno postojećim testovima (nisam duplirao, osim granica/varijanti)
- `customer-login.test.mjs`: registracija sa lozinkom, 5 pogrešnih → zaključavanje, istek koda, paralelna verifikacija, cooldown preko IP, strani Origin na /register, magic-link 410, WhatsApp tokovi, Infobip/Resend adapteri.
- `domain-sqlite.test.mjs`: T-11 paralelni/ponovljeni checkout i 409 za drugačije stavke, T-03/T-07 količine i lažna cena (totalMinor:1), T-09/T-34 pogrešan dan i PTT, T-73 poslednja upotreba promo, magic-link single-use + logout, kartica 503 kad nije mock/production.
- `functional-audit.test.mjs`: Q105 minimalna porudžbina, Q116–118/Q017/Q121/Q122 promo uslovi, Q113 lažne cene, Q106–Q110 količine/stavke, Q185 cross-origin pretplata, Q186 admin sesija (pogrešna lozinka/istek), Q091/Q092 staff uloge (manager, driver), Q093 paralelni update porudžbine, Q188–190 webhook (secret, duplikat, paket), Q102 PIB.
- `rendered-html.test.mjs`: CARD_DATA_REJECTED za `payment.cardNumber/cvv`, ADMIN_FORBIDDEN/INVALID_WEBHOOK_SIGNATURE bez upita u bazu.
- `fiscomm.test.mjs` (live/training sa fetch stub-om): COD jedan račun, tok paketa + lanac, preskočena nedelja, delimična isporuka, nepodudaran iznos (avans/refund), timeout → unknown, MODE_MISMATCH (live↔training, mock→live), legacy snapshot, istovremene isporuke, PIB, ćirilični `Е` label.
- `fiscal-dispatch.test.mjs`, `fiscal-receipts.test.mjs`, `fiscal-deliveries.test.mjs`, `fiscal-amounts.test.mjs`: jedinična logika dispatch žurnala i raspodele; `cash-bulk`, `connected-delivery-flows`: gotovina/bulk/podsetnici.
- E2E: `customer-login.spec.ts` (UI registracija/odjava), `customer-self-service.spec.ts`, `account-admin-flows.spec.ts`.

Novo u odnosu na to: sve u `FISCOMM_MODE=mock` (do sada gotovo isključivo live/training), journal stanja unknown/rejected/sending(sveže/staro) kroz outbox, paralelna obrada istog reda, nerazrešen dispatch jedne isporuke blokira narednu, email tek posle upisa, nulti iznos, provider oznaka mock dokumenata, granice na milisekundu (istek koda, cutoff, sesije, promo), CSRF matrica nad svim mutacijama, demo read-only nad svim mutacijama, throttle admin logina, deaktivacija/reaktivacija osoblja, webhook gating po PAYMENT_MODE, e2e nad pravim Next runtime-om.

## Šta nije pokriveno i zašto
- ADVANCE_NOT_ISSUED: grana u `server/fiscomm.ts` nije dostižna kroz javne tokove (`issueFiscomm(orderId)` uvek prvo uspostavi avans, a greška avansa se propagira sa svojim kodom); F-C13 proverava samo da je kod klasifikovan kao retry-safe.
- Pravi Fiscomm (training/live), pravi mejl/WhatsApp provajderi, RaiAccept/OTP kartica: zabranjeno (nema interneta); live odgovori simulirani lokalnim `fetch` stub-om (F-C17/18), ne odražavaju stvarni API.
- Auth provider režim (`AUTH_MODE=provider`, Infobip/Resend slanje koda) i `__Host-` kolačić na https: postojeći `customer-login.test.mjs` pokriva slanje; ja sam testirao lokalni režim.
- Browser UI e2e (klik kroz formu checkout-a, admin UI kartice): E2E sloj je API-nivo; vizuelni tokovi su u postojećim spec-ovima. Samo `desktop-1440` projekat pokrenut (mobile/tablet isti kod).
- Postgres/Supabase put (`test:postgres`), Vercel cron `/api/jobs/scheduled`, inventar, refund `execute`, uvoz kupaca: van opsega zadatka.
- Dugi "stvarni" konkurentni scenariji nad pravom bazom: in-memory SQLite jedne konekcije serijalizuje upite, pa paralelni testovi (F-C08/C09) potvrđuju logiku claim-a i žurnala, ali ne i race uslove D1/Postgres.
