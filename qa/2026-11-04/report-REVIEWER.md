# Nezavisna QA recenzija — Mleko i Mleko (2026-11-04)

Recenzent: nezavisni QA (prefiks `TEST-R-`, header `cf-connecting-ip: 198.51.100.80`). Okruženje: `http://localhost:3100` (FISCOMM_MODE=mock, PAYMENT_MODE=disabled), baza `.data/qa-local.sqlite`. Izveštaji drugih testera nisu čitani, kod aplikacije nije menjan, admin podešavanja nisu dirana.

**Metod:** Playwright (UI tokovi), curl (HTTP), sqlite3 (stanje posle svakog koraka). Skripte i snimci (`r-*.png`) u scratchpad `reviewer/` (`flow1.mjs`, `flow1b.mjs`, `flow2.mjs`, `flow4ui.mjs`, `admin-ui.mjs`, `co.sh`, `a.sh`, `q`, `disp.sh`).

**Rezime:** 61 slučaj — 44 PASS, 16 FAIL (2 Visoko, 6 Srednje, 8 Nisko), 1 NOT-TESTED.

**Ključne porudžbine:**

| Porudžbina | Šta je | Ishod |
|---|---|---|
| `ord_rWMf-M3Ue-MTigX4guDBESaA0_V3hzlV` (MM-20261104-RWMF-M3U) | UI, jednokratno 2× kravlje, gotovina, 850 RSD | Delimična isporuka (R-042) |
| `ord_O8lliPBZLD4-Yjk1nlMev7JRV0Smlw77` (MM-20261104-O8LLIPBZ) | UI, paket weekly 2× kravlje, 3.400 RSD | Avans + 4 konačna + 4 refundacije avansa |
| `ord_u9U8OinpxF2Kd-eb_Ij9EkkekB9-qAPj` | API, paket biweekly 3× kozje, 2.500 RSD | Gotovina pri 1. isporuci |
| `ord_QeRTxB3kiaMz2mJ4wOIHJQDDwNg4ZJ2A` | API, COD 850 RSD | Jedan „normal" račun |
| `ord_TYahbbcsNNu7w6xxqQ9rA2CqH5m1MNnr` | API, COD; uručeno bez gotovine, pa plaćeno | Jedan „normal" račun |
| `ord_TU64r2V30Hjg185Hme7p33bEueuHNptI` | Plaćena, neisporučena | Povraćaj requested → approved → execute 503 |
| `ord_aXtJIQFV05iGk0KZYds2yZTtSE_ComdR` | Plaćena, admin otkazao | Novac i avans bez postupka (R-050) |

## Tabela slučajeva

| ID | Uloga | Koraci | Očekivano | Stvarno | Status | Ozbiljnost |
|---|---|---|---|---|---|---|
| R-001 | Gost | UI /prijava → „Napravi nalog" → email → pošalji kod | polje za kod i lokalni kod | prikazan lokalni kod (`data-testid=local-auth-code`) | PASS | — |
| R-002 | Gost | pogrešan kod 000000 | srpska poruka | „Kod nije ispravan, istekao je ili je već iskorišćen. Zatražite novi kod." | PASS | — |
| R-003 | Gost | tačan kod | /nalog i sesija | /nalog; `mm_session` HttpOnly, SameSite=Lax, 30 dana | PASS | — |
| R-004 | Kupac | „Odjavi se" | cookie obrisan, 401 | obrisan; 401 AUTH_REQUIRED | PASS | — |
| R-005 | Kupac | stari cookie posle logout-a | 401 | 401 | PASS | — |
| R-006 | Kupac | ponovna prijava „Imam nalog" | 200 | 200 | PASS | — |
| R-007 | Kupac | novi kod odmah | 429, pauza 60 s | 429; posle 60 s radi | PASS | — |
| R-008 | Kupac | 5 pogrešnih, pa tačan | zaključan | tačan odbijen 401 | PASS | — |
| R-009 | Kupac | isti kod 2× | 401 | 401 | PASS | — |
| R-010 | Gost | nepostojeći email | isti odgovor, bez koda | isti ekran | PASS | — |
| R-011 | Gost | POST /api/auth/magic-link | 410 | 410 MAGIC_LINK_RETIRED | PASS | — |
| R-012 | Demo | UI „Isprobaj demo nalog" | demo /nalog | „ZDRAVO, DEMO KORISNIK" | PASS | — |
| R-013 | Demo | 6 mutacija | 403 DEMO_READ_ONLY | svih 6 → 403 | PASS | — |
| R-014 | Kupac | UI jednokratno 2 L → checkout gotovina 10.11. | 201, 850 | 201, 85000 | PASS | — |
| R-015 | Kupac | /korpa | datum koji može da se poruči | „petak, 06. novembar" — zaključan; checkout nudi tek 10.11. | FAIL | Srednje |
| R-016 | Kupac | UI paket weekly 2 L, 13.11. | 2000 + 4×350 = 3400 | 201, 340000, termini 13/20/27.11., 4.12. | PASS | — |
| R-017 | SQL | orders, items, subscriptions, packages | tačni iznosi i veze | qty=2, line_total=200000, active v1, paket open, required=4 | PASS | — |
| R-018 | Kupac | registrovan → checkout sa punim podacima | profil popunjen | `customers.full_name`, telefon, adresa prazni; „ZDRAVO, KUPČE."; admin ime „-" | FAIL | Srednje |
| R-019 | Kupac | /nalog posle 2 porudžbine | vidljivo | paket „uručeno 0/8", jednokratna, „Moje porudžbine 2" | PASS | — |
| R-020 | Kupac | tekst o paketu u /nalog | usklađen | „Bez naknade za dostavu. Mesečni obračun…" iako plaćeno 4×350 | FAIL | Nisko |
| R-021 | Gost | checkout + ponovljen isti (ključ test-r-idem-0001) | isti odgovor, 1 red | oba 201, isti id, 1 red | PASS | — |
| R-022 | Gost | isti ključ, drugi body | 409 | 409 IDEMPOTENCY_CONFLICT | PASS | — |
| R-023 | Gost | bez ključa / „abc" | 422 | 422 / 422 | PASS | — |
| R-024 | Gost | sreda; 24000; kartica; PAN; qty 0, −2, 1,5; cena sa klijenta | odbijeno | 422 / 422 / 503 / 422 / 422×3; cena ignorisana | PASS | — |
| R-025 | Gost | checkout bez deliveryDate | sledeći dostupan | bira zaključan 06.11. → 409 DELIVERY_LOCKED, engleski | FAIL | Srednje |
| R-026 | Admin | PATCH paid sa zastarelim expectedUpdatedAt | 409 | 409 ORDER_VERSION_CONFLICT | PASS | — |
| R-027 | Admin | PATCH paid za paket | outbox sent, avans | sent; `MOCK-…:advance` 3400, cash | PASS | — |
| R-028 | Admin | ponovljen PATCH paid | bez novog | 1 zahtev, 1 račun | PASS | — |
| R-029 | Sistem | poreske oznake u request_json | potvrđene | `[null]` / `[""]`; live bi stao | NOT-TESTED | — |
| R-030 | Admin | lock 10.11. bez force | 409 | 409 CUTOFF_NOT_REACHED (engleski) | PASS | — |
| R-031 | Admin | lock bez ključa; bez rute | 422; 404 | 422; 404 (engleski) | PASS | — |
| R-032 | Admin | complete u otvorenoj ruti | 409 | 409 DELIVERY_STATE_INVALID | PASS | — |
| R-033 | Admin | generate 05.06. → complete 1. isporuke | konačni + refundacija | final 850 → advance_refund 850 → avans; finalize sa referencom | PASS | — |
| R-034 | SQL | provider mock refundacije | fiscomm-mock | „fiscomm" (svih 6) | FAIL | Srednje |
| R-035 | Admin | pogrešan datum; replay; druga količina; failed | 409 / replay / 409 / 409 | kao očekivano | PASS | — |
| R-036 | Sistem | duplikati outbox → process | bez novog računa | oba sent isti MOCK id | PASS | — |
| R-037 | Admin | isporuke 2–4 | zbir = avans | 4×850; offseti 0/2/4/6; paket completed | PASS | — |
| R-038 | Admin | biweekly bez/sa cashCollected; 2. isporuka | 409, pa avans+konačni; 2500 | tačno | PASS | — |
| R-039 | Sistem | stavka „Dostava" po isporuci (biweekly) | 350,00 | 349,99 / 350,01 | FAIL | Nisko |
| R-040 | Admin | COD complete qty 2 + cashCollected; replay | jedan normal | normal 850; replay | PASS | — |
| R-041 | Admin | COD uručen bez gotovine, pa paid | normal | PAYMENT_NOT_CAPTURED retry, pa normal 850 | PASS | — |
| R-042 | Admin | COD complete qty 1 od 2 + cashCollected | 409 PARTIAL_REQUIRES_PACKAGE | 200: naplaćeno 850 za 1 L; avans 850 + konačni 425; ostatak na zaključan 06.11. | FAIL | Visoko |
| R-043 | Admin | failed + cashCollected | 422 | 422 | PASS | — |
| R-044 | Kupac | preview svoje/tuđe; POST bez Origin; POST; replay | preview / 404 / 403 / 201 / isti | tačno | PASS | — |
| R-045 | Kupac | povraćaj neisporučene od 850 | ceo iznos | 500 (dostava izuzeta); posle execute ostaje paid | FAIL | Srednje |
| R-046 | Kupac | drugi zahtev za povraćaj (UI i API) | 409 srpski | 500 „Unexpected server error." | FAIL | Srednje |
| R-047 | Admin | approve v5; execute pre approve; approve v1 | 409 / 409 / 200 | tačno | PASS | — |
| R-048 | Admin | execute | 503, bez promene | 503 REFUND_PROVIDER_NOT_CONNECTED; approved; bez fiskalne refundacije | PASS | — |
| R-049 | Kupac | status povraćaja u /nalog | vidljiv | nema u `/api/account`; forma skrivena | FAIL | Nisko |
| R-050 | Admin | plaćena sa avansom → cancelled → povraćaj | odbiti ili povraćaj | 200; preview 0; request 409 NOTHING_TO_REFUND; refunded 409 | FAIL | Visoko |
| R-051 | Kupac | otkazivanje plaćene | 409 | 409 ORDER_NOT_EDITABLE | PASS | — |
| R-052 | Admin | bez tokena / lažan / pogrešna lozinka / bez Origin | 403 | 403 ×4 | PASS | — |
| R-053 | Owner | staff driver; slaba lozinka | 200; 422 | 200; 422 PASSWORD_WEAK | PASS | — |
| R-054 | Driver | sve admin rute | 403 osim dostava | tačno | PASS | — |
| R-055 | Driver | UI /admin | samo „Dostave" | samo „Dostave", bez grešaka | PASS | — |
| R-056 | Kupac | istorija dostava za delimičnu | 1× | 2× | FAIL | Nisko |
| R-057 | Owner | admin Porudžbine pretraga | ime, čitljiv status | ime „-", status „issued", MOCK id | FAIL | Nisko |
| R-058 | Sistem | `email.fiscal_document.requested` | poslato | pending do cron/process; 3 mejla po isporuci | PASS | — |
| R-059 | Kupac | ekran posle checkout-a | ispravan tekst | „2026.." | FAIL | Nisko |
| R-060 | Kupac | prijavljen na checkout-u | email popunjen | prazno | FAIL | Nisko |
| R-061 | Kupac/Admin | poruke | srpski | više na engleskom | FAIL | Nisko |

## FAIL — detalji

### R-042 (Visoko): delimična COD isporuka prolazi, ostatak se gubi
Reprodukcija: COD jednokratna 2 kom, zaključana ruta → `POST /api/admin/deliveries {action:"complete", status:"delivered", cashCollected:true, items:[{deliveredQuantity:1}]}` → 200, `cashCollectedMinor` 85000 → porudžbina paid/planned, `delivery_date` 2026-11-06 (ruta locked, `generateDelivery` vraća postojeći spisak, `server/deliveries.ts:69`) → fiskalno avans 850 + konačni 425 + refundacija 425; 425 avansa otvoreno.
Uzrok: `server/delivery-completion.ts:31` (uslov uvek tačan za jednokratne stavke); `:58` + `server/settings.ts:119-128` (ne proverava zaključanu rutu).
Predlog: blokirati delimičnu jednokratnu isporuku ili je svesno podržati; ostatak samo na otvorene rute; ne naplaćivati ceo iznos.

### R-050 (Visoko): otkazana plaćena porudžbina nema put do povraćaja
Reprodukcija: paid (avans issued) → PATCH `fulfillmentStatus:"cancelled"` → 200 → preview 0, request 409 NOTHING_TO_REFUND, PATCH refunded 409 FISCAL_PAYMENT_IMMUTABLE.
Uzrok: `server/admin.ts:169-196` (nema zabrane cancel za paid); `server/refunds.ts:12` (`remaining=0` čim nije planned).
Predlog: odbiti cancel sa 409 i uputiti na povraćaj, ili automatski otvoriti `refund_requests`.

### R-015 / R-025 (Srednje): korpa i checkout nude zaključan datum
Uzrok: `server/settings.ts:119-128` u `server/commerce.ts:123,217`. Predlog: `getNextDeliveryWindow` preskače datume čija ruta nije `open`.

### R-018 (Srednje): registrovan kupac bez profila
Uzrok: `server/commerce.ts:277` `ON CONFLICT(email) DO NOTHING` — prazan red iz registracije se ne dopunjuje. Vozač ipak ima adresu iz `orders.shipping_json`. Predlog: `DO UPDATE` sa COALESCE/NULLIF za prazna polja.

### R-034 (Srednje): mock refundacije upisane kao live
Uzrok: `server/fiscomm.ts:149` prosleđuje `body.refundReceipt` bez `fiscommMode`; linija 42 upisuje „fiscomm"; mejl dobija `training:false`. Predlog: `{...refundReceipt, fiscommMode: body.fiscommMode}`.

### R-045 (Srednje): povraćaj ne vraća dostavu
`server/refunds.ts:13-15` uvek isključuje `delivery_fee_minor`; posle execute ostaje paid (`refunds.ts:36`). Predlog: vratiti dostavu za neiskorišćene posete; proveriti pravo na odustanak.

### R-046 (Srednje): 500 na drugi zahtev za povraćaj
Uzrok: `mutationGuard` (`server/refunds.ts:23`) pada u bazi, greška neprevedena; `refundPreview` ne proverava otvoren zahtev. Predlog: 409 REFUND_ALREADY_REQUESTED sa srpskom porukom.

### Nisko
- R-020: tekst o „mesečnom obračunu" u `app/nalog/account-view.tsx` ne odgovara paketu.
- R-039: `integrations/fiscal-deliveries.mjs:25-29,37` deli dostavu po jedinicama (70000/6), ne po poseti.
- R-049: `/api/account` ne vraća zahteve za povraćaj; forma u `account-view.tsx:536-540`.
- R-056: `server/commerce.ts:414` čita `quantity` umesto `COALESCE(delivered_quantity, quantity)`.
- R-057: posledica R-018 + sirov status „issued" i MOCK id.
- R-059: dupla tačka u datumu.
- R-060: checkout ne popunjava email prijavljenog kupca.
- R-061 engleske poruke — kupac: DELIVERY_LOCKED (`server/time.ts:55`), „Unexpected server error." (`server/domain.ts:91`), CARD_DATA_REJECTED, „items[0].quantity must be a positive integer.", „orderId must contain 1-100 characters.", „customer is required.", IDEMPOTENCY_CONFLICT, „Payment authorization failed." (`server/commerce.ts:254`); admin: CUTOFF_NOT_REACHED, „Generate the delivery before locking it." (`server/deliveries.ts:208-209`).

## Potvrđeno da radi
- Prijava kodom: registracija, pogrešan kod, zaključavanje posle 5, jednokratan kod, pauza 60 s, bez otkrivanja naloga, HttpOnly sesija 30 dana, odjava opoziva i na serveru, magic link 410, demo read-only.
- Checkout: tačni iznosi u parama, cene sa servera, validacije, CSRF, Idempotency-Key replay/konflikt.
- Fiskalni tok paketa (mock): avans pri uplati; konačni sa `advance/finalize` i refundacijom avansa; `reference_receipt_id` lanac; alokacije bez preklapanja; zbirovi tačni (3400, 2500); paket se zatvara; gotovina obavezna pri prvoj isporuci.
- Idempotentnost fiskalizacije: ponovljena potvrda i duplikati outbox-a ne prave nov dispatch/račun.
- COD: tačno jedan „normal" račun u oba redosleda.
- Zaštite dostava i povraćaja: cutoff, stanje rute, datum, version, redosled stanja, execute 503 bez promene.
- Admin i driver pristup ispravni u API-ju i UI-ju.

## Nije pokriveno i zašto
- Live/training Fiscomm i poreske oznake (R-029): internet zabranjen; proizvodi bez `fiscal_tax_label`.
- Kartice, webhook, stvarno izvršenje povraćaja: PAYMENT_MODE=disabled.
- Obnova paketa i billing/cron: pretplate ostaju active posle završenog paketa; sledeći ciklus neproveren.
- Bulk akcije, promo kodovi, PIB, pauza, preskakanje: van obaveznih tokova.
- Lock budućih ruta (06/10/13.11.): deljene; redovi pomereni SQL-om na prošle datume (maj/jun).

## Podaci (za čišćenje)
- Kupci `test-r-1…6@example.test`; staff `test-r-driver@example.test` (aktivan).
- SQL izmene samo svojih redova (`ord_O8ll…`, `ord_u9U8…`, `ord_rWMf…`, `ord_QeRT…`, `ord_TYah…`); outbox `test-r-dup-1/2`.
- Rute samo sa svojim redovima: 2026-05-05, 05-12, 05-19, 06-02, 06-05, 06-09, 06-12, 06-16, 06-19, 06-23, 06-26.
- Ostavljeno kao dokaz: `ord_rWMf…` (R-042), `ord_TU64…` (approved povraćaj), `ord_aXtJ…` (R-050).
