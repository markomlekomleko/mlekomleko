# Mleko i Mleko — završni QA izveštaj (2026-11-04)

Orkestrator: Claude Fable 5.1. Agenti: A (korisnički deo), B (admin), C (fiskalizacija), D (bezbednost), E (UI/UX/a11y/performanse), F (automatski testovi), R (nezavisni recenzent). Pojedinačni izveštaji: `report-A.md` … `report-F.md`, `report-REVIEWER.md`; mapa aplikacije: `APP-MAP.md`.

Okruženje: izolovani worktree, `http://localhost:3100`, SQLite `.data/qa-local.sqlite`, `FISCOMM_MODE=mock`, `PAYMENT_MODE=disabled`, `EMAIL_MODE=console`. Nijedan poziv ka `api.fiscomm.rs`, banci ni mejl provajderu. Produkciona baza (glavni checkout `.env.local` → Supabase) nije dirana. Kod aplikacije nije menjan; dodati su samo novi test fajlovi (`tests/qa-*.test.mjs`, `tests/e2e/qa-critical.spec.ts`).

## 1. Rezime

| Agent | Slučajeva | PASS | FAIL | Blocked/NT |
|---|---|---|---|---|
| A — korisnički deo | 318 | 240 | 76 (≈60 su engleske poruke) | 2 |
| B — admin | 371 | 348 | 23 | 0 |
| C — fiskalizacija | 70 | 43 | 22 | 5 |
| D — bezbednost | 84 | 63 | 19 | 2 |
| E — UI/UX | 62 | 27 | 35 | 0 |
| R — recenzent | 61 | 44 | 16 | 1 |
| F — novi automatski testovi | 83 | 78 | 5 (svih 5 = stvarni bagovi) | 0 |
| **Ukupno** | **1049** | **843** | **196** | **10** |

Posle deduplikacije: **1 Kritičan, 12 Visokih, ~30 Srednjih, ~45 Niskih** jedinstvenih defekata. Svaki Kritičan i Visok nalaz orkestrator je lično reprodukovao (HTTP/SQL/kod) i/ili ga je nezavisno potvrdio recenzent koji nije video tuđe izveštaje. Nijedan Kritičan/Visok nalaz nije ostao „nepotvrđen“.

Šta radi dobro: SQL je svuda parametrizovan (nema SQLi), nema XSS-a, CSRF na cookie mutacijama radi, IDOR blokiran, matrica staff uloga tačna, idempotentnost checkout-a/webhook-a/fiskalizacije radi, avansni lanac po isporuci u mock režimu je matematički ispravan (zbir konačnih = avans, alokacije bez preklapanja), audit log je append-only, CSV/XLSX export neutralizuje formule, axe nema povreda na javnim stranicama.

## 2. Bagovi po ozbiljnosti

### KRITIČNO

**K-1 — Plaćena porudžbina sa izdatim avansom može se otkazati bez ikakvog povraćaja; posle toga nema puta do refundacije** (B-145, C-051, R-050; potvrdio orkestrator)
- Reprodukcija: checkout gotovina → admin `PATCH /api/admin/orders {id, paymentStatus:"paid"}` (avans issued) → `PATCH {id, fulfillmentStatus:"cancelled"}` → 200. Zatim `GET /api/admin/refunds?orderId=` daje `amountMinor:0`, `request` → 409 NOTHING_TO_REFUND, `paymentStatus:"refunded"` → 409 FISCAL_PAYMENT_IMMUTABLE.
- Očekivano: 409 dok se ne izda avans-refundacija, ili automatsko otvaranje zahteva za povraćaj.
- Stvarno: novac kupca i otvoren avans ostaju bez postupka; u QA bazi takvih porudžbina ima više (TEST-B, TEST-C, TEST-R).
- Kod: `server/admin.ts:177-180` (Fiscomm grana štiti samo `delivered` i promenu `paid`), `server/refunds.ts:12` (`remaining=0` čim status nije `planned`).
- Rešenje: za `payment_status='paid'` zabraniti `cancelled` bez izdate avans-refundacije (`FISCAL_REFUND_REQUIRED`), a `refundPreview` da računa ostatak i za `cancelled`.

### VISOKO

**V-1 — Delimično uručenje jednokratne (COD) porudžbine prolazi, naplaćuje ceo iznos, ostatak nestaje na zaključan datum** (B-243, R-042, C-017)
- Reprodukcija: COD 2 kom, lock rute → `POST /api/admin/deliveries {action:"complete", status:"delivered", cashCollected:true, items:[{deliveredQuantity:1}]}` → 200, `cashCollectedMinor` = ceo iznos; porudžbina ostaje `paid/planned` sa `delivery_date` pomerenim na već zaključanu rutu; fiskalno avans + konačni za pola umesto jednog prometa.
- Kod: `server/delivery-completion.ts:31` — uslov `items.every(i => i.package_line_id || i.order_item_id)` je uvek tačan za jednokratne stavke pa `PARTIAL_REQUIRES_PACKAGE` nikad ne okida; `:58` + `server/settings.ts:119-128` biraju datum bez provere statusa rute.
- Rešenje: `items.every(i => i.package_line_id)`; ostatak samo na `open` rute; naplatiti samo uručeno ili blokirati.

**V-2 — IP rate limit se zaobilazi slanjem sopstvenog `cf-connecting-ip` / `x-forwarded-for`** (D-047; potvrdio orkestrator: 11. zahtev 429, 12. sa drugim headerom 403)
- Kod: `server/rate-limit.ts:7-12`. Na Vercelu ovaj header niko pouzdan ne postavlja → brute-force admin/staff lozinki, masovni checkout.
- Rešenje: uzimati IP iz `x-vercel-forwarded-for`/`x-real-ip` (platforma), `cf-connecting-ip` samo uz `TRUSTED_PROXY=cloudflare`; dodati limit po identitetu za admin prijavu.

**V-3 — Korpa i checkout bez datuma nude zaključanu dostavu → 409 DELIVERY_LOCKED (engleski)** (A F-02/A-049/A-312, R-015/R-025, uzrok B-105)
- Kod: `server/settings.ts:119-127` (`getNextDeliveryWindow` gleda samo formalni cutoff), `server/commerce.ts:123,217`. `/api/delivery-options` već preskače zaključane datume, korpa ne.
- Rešenje: preskakati datume čija ruta nije `open`; prevesti poruku.

**V-4 — Ne postoji fiskalna refundacija: ni avans-refundacija pri povraćaju/otkazu, ni promet-refundacija za COD** (C-052, C-055, R-045, R-048)
- `server/refunds.ts:37-38` pri `execute` upisuje string `MOCK-FISCAL-REFUND-<id>` bez dokumenta; `server/fiscomm.ts:122` ne poznaje `normal/refund` ni `advance/refund`. Naknada za dostavu se nikad ne vraća (`refunds.ts:13-15`), pa deo avansa ostaje trajno otvoren (primer: 2400 − 1200 − 500 = 700 RSD).
- Rešenje: implementirati `advance/refund` za neiskorišćeni deo (uključujući udeo dostave iz snapshot-a) i `normal/refund` sa referencom na original; `execute` čeka izdat dokument.

**V-5 — Način plaćanja na fiskalnom računu je uvek „gotovina“ osim kartice; prenos na račun/vaučer/kombinovano nepodržani** (C-047, C-048)
- Kod: `server/fiscomm.ts:113`. Admin oznaka „paid“ ne beleži kako je plaćeno; uplata na račun bi išla kao gotovina.
- Rešenje: obavezno polje `paymentChannel` pri evidenciji uplate mapirano na Fiscomm `payments[].type`; više stavki plaćanja.

**V-6 — Pri neslaganju iznosa u odgovoru PFR-a gubi se sirovi odgovor (čuva se `{}`)** (C-035)
- Kod: `integrations/fiscal-dispatch.mjs:28-30` + `server/fiscomm.ts:128-134` (`normalizeResponse` vraća `{}`). Posle toga se ne zna koji je broj računa izdat.
- Rešenje: u `fiscal_dispatches` čuvati sirovi odgovor i razlog odvojeno od normalizovanog.

**V-7 — Nema postupka usaglašavanja za `unknown`/`rejected`; i 401/400 trajno blokiraju porudžbinu** (C-030, C-033)
- Kod: `app/api/admin/integrations/route.ts:14-18` (samo process/retry_failed/resend/reminders), `server/integration-jobs.ts:192` (retry preskače fiskalne), `fiscomm.ts:81,86`.
- Rešenje: admin akcija „Usaglasi“ (owner/finance) sa ishodima: račun pronađen / nije izdat → novi pokušaj / greška podešavanja → retry; sve u audit.

**V-8 — Poreske oznake nisu podešene (seed `fiscal_tax_label` NULL, `FISCOMM_DELIVERY_TAX_LABEL` prazan); mock preskače validaciju** (C-056, C-057, R-029)
- Live bi stao sa FISCAL_TAX_LABEL_MISSING (bezbedno, ali blokira izlazak). Mock šalje `labels:[null]`/`[""]`.
- Rešenje: knjigovođa potvrđuje oznake pre live-a; mock da odbija prazne oznake (`fiscomm.ts:99,102,110`).

**V-9 — Drugi zahtev za povraćaj daje 500 „Unexpected server error.“** (A F-03/A-120, B-307/B-309, R-046; potvrdio orkestrator)
- Kod: `server/refunds.ts:23-24` — `mutationGuard` pada u bazi, greška neprevedena.
- Rešenje: provera pre batch-a → 409 REFUND_ALREADY_REQUESTED sa srpskom porukom.

**V-10 — Konverzija porudžbine u pretplatu odmah pravi fakturu za ceo paket iako UI kaže „sada nema nove naplate“; otkazana porudžbina se može konvertovati** (A F-05/A-314/A-137, A F-04/A-135; potvrdio orkestrator u kodu)
- Kod: `server/commerce.ts:382-383` poziva `generateMonthlyBilling` odmah; `:355-359` ne proverava `fulfillment_status`; tekst u `app/checkout/checkout-form.tsx:210`.
- Rešenje: uskladiti tekst i ponašanje (ili odložiti obračun), odbiti konverziju otkazane porudžbine.

**V-11 — `/nalog` je vizuelno pokvaren: naslovi plutaju 104–273 px ispod vrha kartica** (E-001; potvrdio orkestrator)
- Kod: `app/nalog/account.css:18` — `margin-top: var(--header-stack)` na h1/h2/h3/p. Rešenje: ukloniti liniju.

**V-12 — „Dodaj u korpu“ nema povratnu informaciju (bez toasta, aria-live, otvaranja drawer-a)** (E-003)
- Kod: `app/components/product-configurator.tsx:98`. Rešenje: toast `role=status` ili otvaranje drawer-a.

### SREDNJE

| ID | Nalaz | Kod | Rešenje |
|---|---|---|---|
| S-1 (D-036) | Owner sesija čuva neposoljen sha256(JSON[email,lozinka]) u `admin_sessions.credential_hash` → offline brute-force iz backup-a | `server/auth.ts:142-143,164` | HMAC(serverSecret) ili verzija kredencijala; owner u `admin_users` sa scrypt; MFA |
| S-2 (D-063) | Gost checkout sa tuđim emailom kači porudžbinu (sa napadačevom adresom) na nalog žrtve i šalje joj mejl | `server/commerce.ts:250-252,277,308` | Za email sa kredencijalima tražiti sesiju/kod; inače nepotvrđena guest porudžbina |
| S-3 (D-041) | `localAuth()` hostname provera ne štiti (`request.url` u dev-u uvek `localhost`); izložen dev/self-host server vraća kod za bilo koji nalog | `server/customer-login.ts:40-46`, `server/runtime.ts:4` (podrazumevan `APP_ENV=local`) | Eksplicitni flag + loopback socket; `APP_ENV` podrazumevano `production` van Vercela |
| S-4 (D-057) | CSP `script-src 'unsafe-inline'`; CSP i HSTS samo uz `NODE_ENV=production` | `next.config.ts:18-21` | Nonce CSP kroz `proxy.ts`; stroži CSP za `/admin` |
| S-5 (D-054) | Limit tela 64 KB se zaobilazi `Transfer-Encoding: chunked` (300 KB → 200) | `server/domain.ts:18-22` | Stream sa brojačem bajtova |
| S-6 (R-018, B-341 posledica) | Registrovan kupac koji potom poruči ostaje bez imena/telefona/adrese u `customers` (`ON CONFLICT DO NOTHING`); admin prikazuje ime „-“ | `server/commerce.ts:277` | `DO UPDATE` sa COALESCE/NULLIF za prazna polja |
| S-7 (C-039, R-034, F N-5) | Mock refundacije avansa upisane kao `provider='fiscomm'` (live) | `server/fiscomm.ts:149,40-42` | Proslediti `fiscommMode` u `refundReceipt` |
| S-8 (C-016, F N-1) | Porudžbina od 0 RSD uz Fiscomm izdaje avans/konačni/refund na 0,00 (skip postoji samo u Badi grani) | `server/fiscomm.ts:47`, up. `fiscal-receipts.ts:65` | `skipped` za iznos 0 |
| S-9 (B-022, F N-2) | Izmena staff naloga bez `isActive` ponovo aktivira deaktivirani nalog | `server/staff.ts:36` | `isActive ?? before.is_active` |
| S-10 (B-139) | PATCH dozvoljava `pending → refunded` | `server/admin.ts:166-180` | Mašina dozvoljenih prelaza |
| S-11 (B-105, B-231) | Privremena izmena `cutoffHours` trajno zaključava dostavu; generate za prošli/nedostavni datum pravi trajan red; nema otključavanja | `server/admin.ts:393-398`, `server/deliveries.ts` | Validacija datuma; admin „otključaj“ pre cutoff-a |
| S-12 (B-341) | Dashboard `topProducts` sabira i nenaplaćene i otkazane stavke (13.925.000 vs plaćeno 6.149.876) | `server/admin.ts:38-39` | Filtrirati na `paid` i ne-`cancelled` |
| S-13 (B-358) | Nema audit zapisa za prijavu/odjavu/neuspelu prijavu admina | `server/auth.ts:146-173` | Audit događaji |
| S-14 (C-043) | Mejl sa fiskalnim dokumentom i bezbedni fiskalni retry čekaju dnevni cron (08:00 UTC) | `server/integration-jobs.ts:184-188`, `vercel.json` | Petlja po agregatu ili cron 5–15 min |
| S-15 (C-044, R-049) | Kupac u nalogu ne vidi fiskalne dokumente ni status povraćaja; mejl u mock-u bez linka | `app/nalog/account-view.tsx`, `server/commerce.ts:386` | Lista dokumenata i povraćaja u `/api/account` |
| S-16 (C-049, C-050) | `taxId` bez naziva firme ne validira se (`buyerId "10:TEST-C-X!"`); nema kontrolne cifre PIB-a; JMBG nepodržan | `server/address-snapshot.ts:19`, `fiscomm.ts:115` | Uvek 9 cifara + mod 11 |
| S-17 (C-062) | Mesečni obračun sa doplatom ne može da se fiskalizuje (terminalno `INTEGRATION_ERROR`) | `server/billing.ts:81-82`, `integrations/fiscal-amounts.mjs:26-28` | Stavka „Doplata“ ili zabrana |
| S-18 (A F-01, E-005/006/007, R-061) | Engleske/tehničke poruke vidljive kupcu i adminu (DELIVERY_LOCKED, „Unexpected server error.“, „A valid customer session is required.“, „quantity must be a positive integer.“, „Email address is invalid.“, CUTOFF_NOT_REACHED…); UI prikazuje `error.message` doslovno | `server/domain.ts:55,91`, `server/time.ts:55`, `server/auth.ts:107,110`, `server/commerce.ts:186,254`, `server/deliveries.ts:208-209`, `app/nalog/account-view.tsx:184-190` | Prevesti sve poruke; UI mapira kodove na srpski |
| S-19 (A F-06, E-004) | Telefon se ne validira („abc“, „1“ prolaze); max 40 u checkout-u, 200 u profilu | `server/commerce.ts:197`, `server/profile.ts` | Format +381/06x, jedinstvena granica |
| S-20 (A A-311) | Posle uspešne porudžbine refresh `/checkout` gubi potvrdu („Nema stavki za plaćanje“) | `app/checkout/checkout-form.tsx` | Redirect na `/checkout/rezultat?order=` |
| S-21 (E-002) | Consent banner zauzima ~48 % ekrana na 360 px; CSS klase ne odgovaraju TSX-u | `app/components/analytics-provider.tsx`, `app/styles/shell.css` | Kompaktan banner |
| S-22 (E-010, E-014, E-015) | Iznosi nedosledni (UI bez decimala, mejl „1.234,5 RSD“); tri izraza za pretplatu; mešanje ti/vi | `server/notifications.ts:12`, i18n katalog | Jedan formatter i jedan rečnik |
| S-23 (E-016, E-017) | Submit u checkoutu disabled bez objašnjenja i van tab redosleda; greške bez pomeranja fokusa | `app/checkout/checkout-form.tsx` | aria-describedby, fokus na alert |
| S-24 (E-025) | Hero video 4,2 MB desktop / 1,5 MB mobilni preuzima se odmah; favicon 359 KB | `app/components/hero-*.tsx`, `public/` | Lazy load, poster, manji favicon |
| S-25 (E-027, E-028) | Admin Porudžbine učitava 100 redova odjednom; brzo menjanje kartica prikazuje „Nije uspelo učitavanje“ zbog prekinutih zahteva | `app/admin/orders-panel.tsx`, `workspace-shared.tsx` | Paginacija; ignorisati AbortError |
| S-26 (E-029, E-030) | Hero naslov hardkodiran (admin `heroTitle` ne radi); vidljivi placeholder-i „Ilustracija“, „Fotografija uskoro“ | `app/components/hero-scene.tsx:314` | Vezati na storefront settings; ukloniti placeholder-e |
| S-27 (B-027, B-079, B-132, D-071, F N-3) | 500 umesto 4xx: dupli staff email, dupli promo kod, dupli lot, upload bez multipart-a | `server/staff.ts:40`, `server/admin.ts:452`, `app/api/admin/product-images/route.ts:8` | 409 / 415 |
| S-28 (B-084, B-085, B-086) | Promo prihvata nevažeće datume, `endsAt` pre `startsAt`, `usageLimit` 0 | `server/admin.ts:428-461` | Validacija |

### NISKO (sažeto; detalji u pojedinačnim izveštajima)

- Bezbednost (D): 429 bez `Retry-After`; nema limita na `/api/cart`, `/api/cart/recovery` (tuđi cartId), convert-to-subscription; admin mutacije bez Origin provere (Bearer ublažava); sirov conversion token u `outbox`/`idempotency_keys`; globalni Idempotency-Key otkriva postojanje i vidljiv finance ulozi; `X-Powered-By`; payment webhook dozvoljava `paid → failed/refunded`; truthy placeholderi u `.env.example` (`SESSION_SECRET=replace…`, `PAYMENT_PROVIDER=raiaccept`) — krši globalno pravilo o praznim placeholder-ima; CMS audit fiksni actor; demo email može da se registruje; query string sa tokenom u logu; duboko ugnežđen JSON → 500; dupli card-field aliasi (`card_number`, `cardNo`) prolaze (F N-4).
- Admin (B): `deliveryWeekday` polje ne radi ništa; `fulfillmentStatus=locked` prihvaćen; upload slike nije u audit logu; audit za staff ne razlikuje promenu lozinke.
- Fiskalizacija (C, R): `BADI_HTTP_*` kod se gubi u `INTEGRATION_ERROR`; status integracija prikazuje `provider:"badi"`; potvrda porudžbine bez „Ovo nije fiskalni račun“; dva paralelna crona → jedan 500 (UNIQUE idempotency_keys); dostava po isporuci 349,99/350,01 umesto 350 (deli se po jedinici, ne po poseti); popust nije iskazan na računu; kredit se tretira kao popust (ne razdužuje raniji avans); 2–4 mejla po jednoj poseti.
- Korisnički deo (A, R): ponovno otkazivanje otkazane porudžbine daje pogrešnu poruku; zahtev za povraćaj bez notifikacije; dupla tačka „2026..“ u datumima (3 fajla); datum dostave bez gornje granice (2030); greška za neaktivan proizvod otkriva interni ID; demo cena kozjeg 350 vs 300; 60 s blokirano dugme za novi kod bez odbrojavanja; prijavljenom kupcu checkout ne popunjava email; istorija dostava prikazuje planiranu umesto uručene količine (`commerce.ts:414`); tekst „Bez naknade za dostavu. Mesečni obračun“ za plaćeni paket.
- UI/UX (E): datumi nisu dd.mm.gggg. i nedosledni; export/mejl sa sirovim ISO datumima; plural „2 jedinica“; logo preliva header 3 px na 360; chipovi lome reči; fontovi 10–12 px u nalogu; mete < 44 px; 404 duplira robots meta; robots.txt Disallow + noindex se poništavaju; N+1 u `getAccount` (`commerce.ts:386-439`); localStorage bez try/catch; `drawerOpen` u istom kontekstu kao stavke; aria-label bez role; admin pogrešna lozinka 403 umesto 401; jedna axe povreda `empty-table-header` u admin Porudžbinama.

## 3. Fiskalizacija — status po tipu računa

| Tip | Podržano | Testirano (mock) | Status |
|---|---|---|---|
| Promet–prodaja (COD, jedna isporuka) | Da | O1, O19, R-040/041 | PASS |
| Avans–prodaja (uplata unapred / paket) | Da | 18+ porudžbina | PASS, ali način plaćanja uvek „cash“ (V-5) |
| Avans–refundacija + Promet–prodaja po isporuci (`advance/finalize`) | Da | 29+ isporuka | PASS u mock-u; `amount = advanceAmount` i `skipAdvanceChainDerivation` nepotvrđeni bez Fiscomm test naloga |
| Avans–refundacija pri povraćaju / otkazu | **Ne** | O15, O20, R-050 | **FAIL** (K-1, V-4) |
| Promet–refundacija (storno COD) | **Ne** | — | **FAIL** (V-4) |
| Kopija | Ne | — | nepodržano |
| Predračun | Ne | — | nepodržano |
| Obuka (training) | Da | samo kod | nije moguće potvrditi bez test naloga i mreže |
| Identifikacija kupca | PIB (`10:PIB`) | O5 | PASS; JMBG/ostalo nepodržano; PIB bez kontrolne cifre |
| Više poreskih stopa / popust / dostava | Da | O2, O5, O11 | PASS matematički; oznake NULL u seed-u (V-8) |
| Idempotentnost / otpornost | Da | timeout, 5xx, unknown, sending, dupli događaji, paralelne potvrde | PASS (nikad dva računa za istu operaciju); nema alata za usaglašavanje (V-7); sirovi odgovor se gubi (V-6) |
| Iznosi | — | SQL recon | ukupno na računu = `total_minor` = request_json = zbir konačnih = avans; dashboard prikazuje naplatu, ne fiskalni promet |

Zakonska usklađenost — provereno iz zahteva koje aplikacija šalje: vrsta/tip transakcije po endpointu, referentni dokument (broj + PFR vreme) na konačnom računu, `buyerId` format, poreska oznaka po stavci, vreme PFR-a sačuvano, jedinstvenost po operaciji, ćirilica netaknuta. **Nije moglo da se potvrdi** (generiše PFR/Fiscomm, mock vraća null): brojač i tip brojača, digitalni potpis, QR kod i verifikacioni URL, „KRAJ FISKALNOG RAČUNA“, izgled PDF-a; ponašanje PFR-a za račun od 0 RSD i `skipBuyerIdValidation`; poreski tretman dostave i trenutak prometa pri pouzeću (odluka knjigovođe); B2B/SEF.

## 4. UX preporuke po uticaju

1. Ukloniti `margin-top` u `app/nalog/account.css:18` (jedna linija vraća ceo nalog u upotrebljivo stanje).
2. Potvrda pri dodavanju u korpu (toast `role=status` ili otvaranje drawer-a).
3. Sve serverske i form poruke na srpski; UI mapira kodove grešaka umesto `error.message`; validirati telefon.
4. Ne nuditi zaključan datum dostave u korpi/checkoutu; posle porudžbine redirect na stranicu rezultata.
5. Uskladiti tekst konverzije u pretplatu sa stvarnim obračunom (ili ne naplaćivati odmah).
6. Kompaktan consent banner na mobilnom; objasniti disabled dugme i pomeriti fokus na grešku.
7. Jedan izraz za pretplatu/redovnu dostavu/paket i jedna forma obraćanja; jedan formatter za datume (dd.mm.gggg.) i iznose (1.234,56 RSD) u UI, mejlu i exportu.
8. Lazy-load hero videa, poster slika, manji favicon; paginacija admin Porudžbina.
9. Kupcu prikazati fiskalne dokumente i status povraćaja u nalogu.
10. Dopuniti profil registrovanog kupca podacima sa checkout-a.

## 5. Nije pokriveno i zašto

- **Pravi Fiscomm (training/live), test sertifikat, SUF:** mrežni pozivi zabranjeni; API ključ postoji samo u glavnom checkout-u uz produkcionu bazu. Potreban izolovan Fiscomm demo nalog da se potvrde finalize iznosi, QR/verifikacija, PDF i ponašanje za 0 RSD.
- **Kartično plaćanje, bankarski webhook, izvršenje povraćaja:** `PAYMENT_MODE=disabled` (RaiAccept adapter nije povezan); mock webhook bi zahtevao restart servera i uticao na druge agente — pokriveno pregledom koda i unit testovima.
- **Produkcioni build (`next start`), CSP/HSTS uživo, `request.url` na Vercelu:** build zabranjen u deljenom okruženju; ocena iz `next.config.ts`.
- **`npm audit`:** nema interneta.
- **Kontakt forma:** `CONTACT_EMAIL_TO` nije podešen u QA env-u → 503 pre limita.
- **Obnova paketa / mesečni billing u sledećem ciklusu, pauza pretplate, Postgres put, `AUTH_MODE=provider`:** van vremena ili zahteva drugo okruženje.
- **Admin UI na 360/768/1920 px, čitači ekrana, ćirilični/en/ru UI, CPU hero videa (headless ne dekodira H.264).**
- **Cutoff granica ±1 s, prestupna godina:** sat se ne može pomerati; testiran je samo zaključan datum i vremenska zona Europe/Belgrade u obračunu datuma.

## 6. Automatski testovi (Agent F)

Novi fajlovi: `tests/qa-harness.mjs`, `tests/qa-auth.test.mjs` (23), `tests/qa-checkout.test.mjs` (30), `tests/qa-fiscal.test.mjs` (23), `tests/e2e/qa-critical.spec.ts` (7). Pokretanje: `npm run build:worker` (jednom, pravi `dist/`), zatim `node --test tests/qa-auth.test.mjs` itd.; e2e: `npx playwright test tests/e2e/qa-critical.spec.ts --project=desktop-1440`. Lint i typecheck prolaze. Pet testova namerno pada jer otkrivaju bagove (S-8, S-9, S-27, S-7, nisko N-4) — `npm test` će ih hvatati; do popravke označiti `{ todo: true }`.

## 7. Stanje QA baze

`.data/qa-local.sqlite` sadrži sve TEST-A…F i TEST-R podatke, uključujući namerno ostavljena stanja kao dokaz (unknown/failed dispatch-evi, otkazane plaćene porudžbine, delimične isporuke). Admin podešavanja su vraćena na: `minimumOrderMinor=0`, `holidays=[]`, `deliveryWeekdays=[2,5]`, `cutoffHours=24`, `deliveryFeeMinor=35000`. Dostava 2026-11-06 je ostala trajno zaključana (nema API-ja za otključavanje, S-11).

## 8. Popravke (odobrene 2026-11-04: K-1, V-1–V-4) — stanje posle izmena

| Nalaz | Status | Izmena |
|---|---|---|
| K-1 | **Popravljeno** | `server/admin.ts` `updateOrder`: otkazivanje plaćene porudžbine sa izdatim fiskalnim dokumentom (ili uz aktivan Fiscomm van režima obuke) vraća 409 `FISCAL_REFUND_REQUIRED` i upućuje na tok povraćaja. Dokumenti obuke ostaju otkazivi. |
| V-1 | **Reklasifikovano, suštinski rešeno kroz V-3** | Delimično uručenje jednokratne porudžbine je namerno ponašanje (pitanje 60 u `docs/funkcionalna-provera-200-pitanja.md`, test Q060): ostatak prelazi u sledeći termin bez nove naplate, a fiskalno avans + konačni po uručenju je u skladu sa modelom po isporuci. Stvarni defekat je bio to što ostatak odlazi na već zaključanu rutu; `getNextDeliveryWindow` sada preskače zatvorene rute (V-3), pa ostatak ide na prvu otvorenu. Zaštita `PARTIAL_REQUIRES_PACKAGE` ostaje za stavke koje nisu vezane ni za paket ni za porudžbinu. |
| V-2 | **Popravljeno** | `server/rate-limit.ts` `clientAddress`: na Vercelu / u produkciji čita samo `x-real-ip` / `x-vercel-forwarded-for` / `x-forwarded-for` (koje platforma prepisuje); `cf-connecting-ip` važi samo uz `TRUSTED_PROXY=cloudflare`; lokalno i u testovima ostaje prihvaćen. `server/auth.ts`: dodatni limit po nalogu (20 pokušaja / 15 min) nezavisan od IP-ja. `.env.example`: `TRUSTED_PROXY=`. |
| V-3 | **Popravljeno** | `server/settings.ts` `getNextDeliveryWindow`: datumi čija ruta nije `open` se preskaču, pa korpa, checkout bez datuma, cron i ostatak delimične isporuke dobijaju prvu otvorenu rutu. `server/time.ts`: poruka `DELIVERY_LOCKED` na srpskom. |
| V-4 | **Popravljeno (mock), nepotvrđeno uživo** | `server/fiscomm.ts`: `fiscalRefundRemainder` (neisporučene jedinice po cenama iz snimka, uključujući udeo dostave) i `issueFiscommRefund` → `POST /receipt/{advance|normal}/refund` sa `referentDocumentNumber`/`referentDocumentDt` originalnog dokumenta, `buyerId` za PIB, isti dnevnik slanja (jedan dokument po porudžbini, replay, blokada pri `unknown`). `server/refunds.ts`: preview uz Fiscomm vraća fiskalni ostatak (sada uključuje dostavu za neiskorišćene posete — rešava i R-045); `execute` najpre izdaje fiskalnu refundaciju pa evidentira novac — gotovina se vraća ručno (`manual-refund:<id>`), kartica i dalje traži bankarski adapter (503 pre bilo kakvog dokumenta). Admin ruta odmah obrađuje outbox (mejl o dokumentu). Usput: refundacija avansa iz finalize sada nosi ispravan režim (`fiscomm-mock`), čime su zatvoreni C-039/R-034/F-C19. Poziv ka pravom Fiscomm `refund` endpointu nije proveren bez test naloga; endpoint i polja su potvrđeni iz javne OpenAPI specifikacije. |

Regresioni testovi: `tests/qa-fixes.test.mjs` (9 testova, svi prolaze): K-1 ×2, V-2 ×3, V-3 ×1, V-4 ×3. Provera: `npm run lint`, `npm run typecheck`, `node --test tests/*.test.mjs` (477 testova: prolaze svi osim 4 nalaza agenta F van obima — F-A19b, F-A21, F-B06b, F-C14b), `npm run test:vercel` (18/18). Napomena: worker build za domenske testove mora biti napravljen sa `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, inače 3 rendered-html testa padaju na canonical URL (artefakt QA okruženja, ne koda).

Nije komitovano.
