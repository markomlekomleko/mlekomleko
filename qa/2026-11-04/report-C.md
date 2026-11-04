# Izveštaj C — Fiskalizacija (Faza 5), 2026-11-04

**Agent C, senior QA za fiskalizaciju.**

Okruženje: server `http://localhost:3100`; APP_ENV=local, FISCAL_PROVIDER=fiscomm, FISCOMM_MODE=mock, FISCOMM_API_KEY prazan, PAYMENT_MODE=disabled; baza `.data/qa-local.sqlite`; IP header `cf-connecting-ip: 198.51.100.30`.

Nije bilo nijednog poziva ka `api.fiscomm.rs` ili internetu. Kod aplikacije nije menjan. Glavni `.env.local` nije čitan.

Skripte i ID-jevi porudžbina: scratchpad `agent-c/` (`orders.json`, `dump.mjs`, `recon.mjs`, `dor.mjs`, `route.mjs`, `sim-dispatch.mjs`, `sim-amounts.mjs`, `s1…s12*.mjs`).

## Rezime

**70 slučajeva: 43 PASS, 22 FAIL, 5 NOT-TESTED.**

| Ozbiljnost | Broj | Slučajevi |
|---|---|---|
| Kritično | 1 | C-051 |
| Visoko | 6 | C-030, C-035, C-047, C-052, C-055, C-056 |
| Srednje | 9 | C-016, C-017, C-033, C-039, C-043, C-044, C-048, C-049, C-062 |
| Nisko | 6 | C-038, C-045, C-050, C-057, C-061, C-067 |

Šta radi ispravno (u mock režimu): avansni lanac (avans, konačni po isporuci, refundacija avansa sa referencom); raspodele isporuka bez preklapanja; zbir konačnih = avans; podela naknade za dostavu po stavkama; idempotentnost; blokade pri nepoznatom ishodu.

Najveći rizici: zatvaranje avansa van isporuke (otkazivanje, povraćaj, ostatak van rute); način plaćanja (sve što nije kartica ide kao „gotovina”); gubitak sirovog odgovora provajdera pri neslaganju iznosa; ne postoji alat za usaglašavanje; nedostaju poreske oznake za live.

## Test porudžbine (prefiks TEST-C, `test-c-<n>@example.test`)

| Ključ | order_id | Scenario | total_minor |
|---|---|---|---|
| O1 | ord_WHYNGvX9CgjxKUc-BWdlRqOpa1jF61Bc | Pouzeće, jednokratno 2× kravlje; uručenje uz naplatu gotovine | 85000 |
| O2 | ord_brMGp38vmaua_dhFr2VR244UWcsnLGi5 | Plaćeno unapred: 3× TEST-C Mleko (Е) i 1× ćirilični Kajmak (Ђ); promo 10 % | 118997 |
| O3 | ord_FnBQdHc8xUqX6cbK319xx5fRGH5aQcI2 | Paket nedeljno, 4×2 kozje | 380000 |
| O4 | ord_iL2_1CZcfVtHWPouL7vVlfzEYL5LzwMs | Paket dvonedeljno 2×3; isporučeno 2, pa 3, pa 1 | 189994 |
| O5 | ord_qsDU-GTLUhXq0NKqxd_fUWfArjsZVF7Q | Mešovita korpa; fiksni promo 7,77; PIB | 325889 |
| O6 | ord_zcIZGy0o41mOYzycY0EB1k37gjl7tEjL | 10 l nedeljno; 3. nedelja neuspešna | 1140000 |
| O17 | ord_QcYb7cpnv1kAJ9yeTMz2bkiM2BYjdwZg | 10 l nedeljno; preskok 3. nedelje | 1140000 |
| O7 | ord_hVrGuewXLrgEDGqOlFY7BfsFwMLFU69k | Kredit 100 RSD (SQL simulacija) | 50000 |
| O8 | ord_aQzSMjjKWfnGx4hCe3sUd47PP6iduzub | Nula iznos (SQL simulacija) | 0 |
| O9 | ord_bnNX-yUFIrnk9OcTxgZp9S1Oi5BZvJcA | Pouzeće delimično: 2 od 3, gotovina naplaćena | 110000 |
| O10 | ord_8qeVxF3YLCRVYl500euHLMIRsOrW2X9j | Slanje avansa ručno na `unknown` | 54999 |
| O11 | ord_BiCUQ7fffnJVCHVInSf2kkJGy5tl6JUb | `sending`: sveže, pa starije od 5 min | 74998 |
| O12 | ord_YmVefIXmpZb0OaJEKtogZF718DdzRbGh | Režim avansa promenjen (provider=fiscomm) | 54999 |
| O13 | ord_ljvIjcDWK9pPHDt6DyjyWoVHnyUHheP4 | Paralelno plaćanje i potvrda; stari `fiscal.final.requested` | 65000 |
| O14 | ord_I6G3UQYWAfIVDzY9VYhbwS5gEWF4hxNn | Otkazivanje plaćene (blokirao cutoff) | 95000 |
| O20 | ord_xuxq0fsI6CFRQHrlFL9Xy8yCh79wbY50 | Otkazivanje plaćene porudžbine | 65000 |
| O15 | ord_2hnktMITpbWIT1wthx4kvLPihOFLglQh | Paket: 2 isporuke + 2 neuspešne, pa povraćaj | 240000 |
| O16 | ord_OEIbazxWE_TWg2VK1-tikdt9zPhI1IIj | Dvonedeljni paket, gotovina pri prvoj isporuci | 130000 |
| O19 | ord_YehF_-_zwlqvZv0vWWw9te1kkkj1SqLR | Pouzeće: uručenje bez naplate, pa naplata | 125000 |
| O21 | ord_kDspyfqgr6MczIYuDzIaq_OnJdwdIps4 | `taxId` bez naziva firme | 65000 |
| O22 | ord_Hf_jLJ0TPiQgayIg9p-FnYMhKG8hcd3Y | Paralelno: 2× plaćanje, 2× obrada reda, 2× cron | 95000 |

**Metoda za isporuke u prošlosti.** Datumi pomereni SQL-om posle uplate (`orders.delivery_date`, `subscriptions.next_delivery_date`, `subscription_items.cadence_anchor_date`, `package_lines.anchor_date`), jer `activatePaidPackage` pomera datume u budućnost. Ruta: `POST /api/admin/deliveries {action:"generate"|"lock", force:true}`. Uručenje: `{action:"complete", id, status, date, items?, cashCollected?}`.

## Tabela slučajeva

| ID | Uloga | Koraci | Očekivano | Stvarno | Status | Ozbiljnost |
|---|---|---|---|---|---|---|
| C-001 | owner | `POST /api/admin/access` | 200 i token | 200 | PASS | — |
| C-002 | owner | `GET /api/admin/settings` | naknada za dostavu podešena | deliveryFeeMinor=35000, prag 0, paymentFeeBps=250 | PASS | — |
| C-003 | owner | Proizvod „ТЕСТ-Ц Кајмак „Златиборски“ 250 г” (Ђ) i „TEST-C Mleko 1 l” (Е) | ćirilica netaknuta | `items[].name` tačan UTF-8 | PASS | — |
| C-004 | owner | O1: generate+lock 09-01, complete `cashCollected:true` | jedan promet-prodaja | `receipt:O1:sale`, normal, `/receipt/normal/sale`; 850 = total; pfr_time = sdcDateTime; delivery događaj vraća isti račun | PASS | — |
| C-005 | owner | O19: complete bez naplate, pa `PATCH paid` | retry pa jedan normal | `pending PAYMENT_NOT_CAPTURED`, zatim jedan `receipt:O19:sale` | PASS | — |
| C-006 | owner | O2: `PATCH paid`, isporuka 09-01 | avans, konačni, refundacija avansa | Avans 1189,97; finalize ima `isFinal`, `skipAdvanceChainDerivation:true`, `referentDocumentNumber/Dt`, `advanceAmount`; sačuvani konačni i refundacija → avans | PASS | — |
| C-007 | owner | O2 promo 10 % | popust po stavkama | 333,33→300,00; 199,99→3×179,99; zbir 1189,97; popust nije posebno iskazan | PASS | — |
| C-008 | owner | O2, O5 više stopa | oznaka po stavci | Ђ, Е, `null` (seed), `""` (dostava) | PASS (logika) | — |
| C-009 | owner | O3 paket 4×2 | 4 konačna, zbir = avans | 4× 950; 3800; dostava 4×350 | PASS | — |
| C-010 | owner | O4 2, 3, 1 komad | zbir = avans | 1899,94; dostava 700 | PASS | — |
| C-011 | owner | O5 mešovita, 2 rute istog dana | dostava po vrednosti stavki | 49999 i 90001; promo 777 kao 277+500; 5 konačnih, zbir 3258,89 | PASS | — |
| C-012 | owner | O5 PIB 100000030 | `buyerId "10:100000030"` | na avansu i svim konačnim | PASS | — |
| C-013 | owner | O6: 3. nedelja neuspešna | 4×10 l, bez računa za propuštenu | računi 09-04, 09-11, 09-25, 10-16; 40/40 l | PASS | — |
| C-014 | owner | O17 preskok 07-21 | računi 1, 2, 4, 5 | 07-07, 07-14, 07-28, 08-04; 07-21 bez rute i računa | PASS | — |
| C-015 | owner | O7 kredit (SQL) | iznosi = total_minor | kredit umanjuje samo proizvod (250→150); avans = konačni = 500 | PASS (R-1) | — |
| C-016 | owner | O8 total 0 | `skipped` | izdati avans, konačni i refundacija na 0,00 | FAIL | Srednje |
| C-017 | owner | O9: 2 od 3, gotovina | ostatak u sledeću rutu | avans 1100, konačni 733,33; ostatak pomeren na 11-06, ruta već zaključana bez njega; 366,67 otvoreno | FAIL | Srednje |
| C-018 | owner | O16 bez `cashCollected`, pa sa | 409, pa avans+konačni | `PACKAGE_CASH_REQUIRED`; avans 1300, konačni 650+650 | PASS | — |
| C-019 | owner | O13 2× paralelni `PATCH paid` | jedan događaj | jedan fiskalni red, jedno slanje, jedan mejl | PASS | — |
| C-020 | owner/cron | O22 2× plaćanje, 2× obrada, 2× cron | jedno slanje | jedno slanje (500 iz crona: C-067) | PASS | — |
| C-021 | owner | O13 2× paralelna potvrda iste isporuke | potvrda + replay | 200 i 200 `{replay:true}`; jedan konačni | PASS | — |
| C-022 | owner | O13 ponovna potvrda količina 0 | odbijeno | 422 INVALID_QUANTITIES | PASS | — |
| C-023 | owner/SQL | O2 dupli `fiscal.delivery.requested` | bez novog slanja | `sent` isti broj; slanja ostaju 2 | PASS | — |
| C-024 | owner/SQL | O10 avans → `unknown`, pa isporuka | sve blokirano | `FISCAL_RECONCILIATION_REQUIRED`, terminalno | PASS | — |
| C-025 | owner/SQL | O11 sveže `sending`, uplata | zauzeto, retry | `FISCAL_ORDER_BUSY`, retry 2 min | PASS | — |
| C-026 | owner/SQL | O11 `sending` > 10 min | usaglašavanje | `failed FISCAL_RECONCILIATION_REQUIRED` | PASS | — |
| C-027 | owner/SQL | O12 provider avansa → `fiscomm` | FISCAL_MODE_MISMATCH | 409, terminalno | PASS | — |
| C-028 | owner/SQL | O13 stari `fiscal.final.requested` | FISCAL_LEGACY_REVIEW_REQUIRED | tačno, terminalno | PASS | — |
| C-029 | owner | `retry_failed` | fiskalni se ne vraćaju | `requeued:0` | PASS | — |
| C-030 | owner | razrešenje `unknown`/`rejected` | postupak usaglašavanja | nema akcije ni UI-a; samo ručni SQL | FAIL | Visoko |
| C-031 | sim | timeout | unknown, bez ponovnog slanja | `FISCAL_OUTCOME_UNKNOWN`; drugi poziv blokiran | PASS | — |
| C-032 | sim | HTTP 500 (JSON) i 503 (HTML) | unknown | unknown | PASS | — |
| C-033 | sim | HTTP 400 / 401 | odbijeno uz mogućnost provere | `rejected` trajno blokira, čak i kod 401 bez izdavanja | FAIL | Srednje |
| C-034 | sim | 200 bez broja/vremena | unknown | `FISCAL_RESPONSE_INVALID` | PASS | — |
| C-035 | sim | pogrešan `totalAmount` / iznos refundacije | unknown + sirovi odgovor sačuvan | `response_json="{}"`, gubi se pravi broj računa | FAIL | Visoko |
| C-036 | sim | 200 koji nije JSON | unknown | unknown | PASS | — |
| C-037 | sim | ponovljen poziv sa izmenjenim zahtevom | isti račun | isti račun, 1 slanje, prvi zahtev zadržan | PASS | — |
| C-038 | kod | `BADI_HTTP_*` | jasan kod | postaje `INTEGRATION_ERROR` | FAIL | Nisko |
| C-039 | SQL | provider refundacije avansa u mock | `fiscomm-mock` | svih 29 kao `fiscomm` (live) | FAIL | Srednje |
| C-040 | SQL | čuvanje odgovora i veza | ceo odgovor povezan | `response_json` ceo normalizovani odgovor; metaFields order_id i delivery_order_id | PASS | — |
| C-041 | SQL | vreme PFR-a | pfr_time = sdcDateTime | ispravno | PASS | — |
| C-042 | owner | mejl posle upisa; ponovno slanje | sa upisom; resend bez fiskalizacije | ista transakcija; resend 200 bez novog slanja; neizdat 409 | PASS | — |
| C-043 | owner | kada kupac dobija mejl sa računom | ubrzo | čeka dnevni cron (08:00 UTC); isto za safe retry | FAIL | Srednje |
| C-044 | kupac | pristup dokumentu | link u nalogu | `/nalog` ne prikazuje fiskalne dokumente; mejl u mock-u bez linka | FAIL | Srednje |
| C-045 | kupac | mejl „Potvrda porudžbine” | „Ovo nije fiskalni račun” | nedostaje | FAIL | Nisko |
| C-046 | gost | kartica | nedostupno | 503 PAYMENT_METHOD_UNAVAILABLE | PASS | — |
| C-047 | kod | način plaćanja u zahtevu | stvarni način | uvek `cash` kad nije kartica, i za uplatu na račun | FAIL | Visoko |
| C-048 | kod | prenos, vaučer, kombinovano | podržano | nije | FAIL | Srednje |
| C-049 | gost | O21 `taxId:"TEST-C-X!"` bez firme | 422 | 201; `buyerId "10:TEST-C-X!"` | FAIL | Srednje |
| C-050 | gost | firma + PIB 12345; JMBG | format + kontrolna cifra | 9 cifara da (422), kontrolna ne; JMBG nepodržan | FAIL | Nisko |
| C-051 | owner | O20 plaćeno pa otkazano | odbijeno ili avans-refundacija | 200; avans otvoren; preview povraćaja 0; isto zatečeno na test-b-21 | FAIL | Kritično |
| C-052 | owner | O15 povraćaj zahtev/odobrenje/izvršenje | avans-refundacija | execute 503; u mock-u samo MOCK referenca; 700 dostave ostaje otvoreno | FAIL | Visoko |
| C-053 | owner | plaćeno → refunded PATCH | odbijeno | 409 FISCAL_PAYMENT_IMMUTABLE | PASS | — |
| C-054 | owner | PATCH na isporučeno | odbijeno | 409 DELIVERY_CONFIRMATION_REQUIRED | PASS | — |
| C-055 | kod | storno običnog računa | promet-refundacija sa referencom | ne postoji | FAIL | Visoko |
| C-056 | SQL | poreske oznake | potvrđena na svakoj stavci | seed NULL; `FISCOMM_DELIVERY_TAX_LABEL` prazan; mock šalje `[null]`, `[""]`; live blokira pre slanja | FAIL | Visoko |
| C-057 | kod | validacija oznaka u mock | ista kao live | preskače | FAIL | Nisko |
| C-058 | SQL | raspodele po isporukama | bez preklapanja i rupa | 33 raspodele: 0 rupa, 0 preklapanja, 0 prekoračenja | PASS | — |
| C-059 | SQL | `recon.mjs` zbirovi | tačno | tačno za O2–O7, O13, O16, O17, O1/O19 | PASS | — |
| C-060 | owner | prihod na tabli vs fiskalni | jednaki | plaćeni 4.934.876 = avansi + normalni + O10 + O11 (blokirani); tabla ne prikazuje blokirane | PASS (napomena) | — |
| C-061 | owner | status integracija | fiscomm | `provider:"badi"` | FAIL | Nisko |
| C-062 | sim | obračun sa doplatom | doplata kao stavka | `BADI_ADJUSTMENT_SKU` → `INTEGRATION_ERROR`, terminalno | FAIL | Srednje |
| C-063 | kod | režim obuke | — | samo kod | NOT-TESTED | — |
| C-064 | kod | kopija, predračun | — | ne postoje | NOT-TESTED | — |
| C-065 | sim | zaokruživanje | tačni zbirovi | 33,33+2×33,34; 366,66+366,67+366,67 = 1100 | PASS | — |
| C-066 | sim | raspodela preko kupljene količine | odbijeno | baca grešku | PASS | — |
| C-067 | cron | 2× cron paralelno | oba 200 | jedan 500 (UNIQUE idempotency_keys) | FAIL | Nisko |
| C-068 | kod | ADVANCE_NOT_ISSUED | — | praktično nedostižno | NOT-TESTED | — |
| C-069 | kod | `skipBuyerIdValidation:true` | — | nepotvrđeno | NOT-TESTED | — |
| C-070 | kod | finalize amount = advanceAmount | po specifikaciji | nepotvrđeno bez test naloga | NOT-TESTED | — |

## Detalji FAIL slučajeva

### C-051 (Kritično): otkazivanje plaćene porudžbine ostavlja otvoren avans
Reprodukcija: checkout gotovinom za 2026-11-13 → `PATCH /api/admin/orders {id, paymentStatus:"paid"}` → `PATCH {id, fulfillmentStatus:"cancelled"}` vraća 200 → `GET /api/admin/refunds?orderId=` daje `amountMinor:0`. U `fiscal_receipts` samo `advance|issued` za `ord_xuxq0fsI6CFRQHrlFL9Xy8yCh79wbY50`.
Kod: `server/admin.ts:177-180` (Fiscomm grana blokira samo `delivered` i promenu `paid`, ne `cancelled`); `server/refunds.ts:12` (`remaining` je 0 kad status nije `planned`).
Predlog: dok se ne izda Avans-refundacija, odbiti otkazivanje sa 409 `FISCAL_REFUND_REQUIRED`.

### C-052 (Visoko): povraćaj nema fiskalni dokument
Kod: `server/refunds.ts:37-38` upisuje `MOCK-FISCAL-REFUND-<id>`; `refunds.ts:13-15` naknada za dostavu se nikad ne vraća. Posledica: avans 2400 − konačni 1200 − povraćaj 500 = 700 RSD trajno otvoreno.
Predlog: `advance/refund` za neiskorišćeni deo sa udelom dostave iz snapshot-a; `execute` čeka izdat dokument.

### C-047 i C-048 (Visoko i Srednje): način plaćanja
Kod: `server/fiscomm.ts:113` šalje samo `card` ili `cash`. Kod prodaje na daljinu uplata na račun je „Prenos na račun”. Predlog: obavezno `paymentChannel` pri evidenciji uplate mapirano na `payments[].type`; više stavki plaćanja.

### C-035 (Visoko): gubi se sirovi odgovor provajdera
Kod: `integrations/fiscal-dispatch.mjs:28-30`; kad `normalizeResponse` (`server/fiscomm.ts:128-134`) vrati `{}`, upisuje se `{}`. Reprodukcija: `node sim-dispatch.mjs`. Predlog: sirovi odgovor i razlog u dnevnik, odvojeno od normalizovanog.

### C-030 i C-033 (Visoko i Srednje): nema usaglašavanja
Kod: `app/api/admin/integrations/route.ts:14-18` (samo `resend_receipt`, `process`, `retry_failed`, `delivery_reminders`); `server/integration-jobs.ts:192` retry preskače fiskalne; `fiscomm.ts:81,86` `rejected` blokira kao `unknown`. Predlog: akcija „Usaglasi” (owner/finance) sa ishodima: račun pronađen / nije izdat (novi pokušaj) / retry posle greške podešavanja; sve u audit.

### C-055 (Visoko): nema refundacije običnog računa
Kod: `fiscomm.ts:122` ne poznaje `normal/refund`. Predlog: Promet-refundacija sa referencom na `receipt:<id>:sale`.

### C-056 i C-057 (Visoko i Nisko): poreske oznake
Seed proizvodi `fiscal_tax_label` NULL; `FISCOMM_DELIVERY_TAX_LABEL` prazan. `fiscomm.ts:99,102,110` preskaču validaciju u mock-u. Predlog: knjigovođa potvrđuje oznake pre live-a; mock da odbija prazne.

### C-016 (Srednje): račun od 0,00
`skipped` postoji samo u Badi grani (`server/fiscal-receipts.ts:65-68`). Realno: `billing.ts:86` kad kredit pokrije sve. Predlog: za 0 upisati `skipped` sa referencom na kredit.

### C-017 (Srednje): ostatak delimične isporuke van rute
Kod: `server/delivery-completion.ts:58-60`, `settings.ts:119-124` — novi datum bez provere statusa rute. Predlog: preskočiti datume čija ruta nije otvorena; adminu prikazati plaćene sa neisporučenim ostatkom.

### C-039 (Srednje): refundacija avansa u mock-u upisana kao live
Kod: `fiscomm.ts:149` i `40-42`; `body.refundReceipt` nema `fiscommMode`. Predlog: proslediti režim eksplicitno.

### C-043 (Srednje): mejl i retry čekaju dnevni cron
Kod: `server/integration-jobs.ts:184-188`; `vercel.json` cron `0 8 * * *`. Predlog: petlja po agregatu ili cron 5–15 min.

### C-044 (Srednje): kupac nema pristup fiskalnim dokumentima
`fiscal_receipts` se ne koristi u nalogu; mejl (`notifications.ts:46-50`) bez `documentUrl` vodi na `/nalog`. Predlog: lista dokumenata u nalogu; u mejlu iznos i verifikacioni link.

### C-049 i C-050: validacija PIB-a
`server/address-snapshot.ts:19` proverava PIB samo uz naziv firme; `skipBuyerIdValidation:true` (`fiscomm.ts:115`). Predlog: uvek 9 cifara + kontrolna cifra (mod 11).

### C-062 (Srednje): obračun sa doplatom
`billing.ts:81-82` dodaje doplatu bez stavke; `fiscal-amounts.mjs:26-28` baca grešku, terminalno. Predlog: stavka „Doplata” ili zabrana doplate uz Fiscomm.

### Nisko
- C-038: `integration-jobs.ts:138-143` mapirati `FiscalDispatchError` na `FISCAL_HTTP_*`.
- C-061: `integrations/config.mjs:198,234` uvek `badi`.
- C-045: `notifications.ts:88` dodati „Ovo nije fiskalni račun.”
- C-067: cron zaštititi lock-om ili konflikt tretirati kao replay.

## Status po tipu računa

| Tip računa | Podržano | Testirano | Status |
|---|---|---|---|
| Promet-prodaja | Da | O1, O19 | PASS |
| Avans-prodaja | Da | 18 porudžbina | PASS (način plaćanja FAIL, C-047) |
| Avans-refundacija + promet-prodaja (finalize) | Da | 29 isporuka | PASS u mock-u (C-070 nepotvrđeno) |
| Avans-refundacija pri povraćaju ili otkazu | Ne | O15, O20 | FAIL |
| Promet-refundacija | Ne | — | FAIL |
| Kopija | Ne | — | Nepodržano |
| Predračun | Ne | — | Nepodržano |
| Obuka | Da | samo kod | Nije moguće potvrditi bez test naloga |

## Zakonska usklađenost

### Provereno (iz zahteva/odgovora koje čuvamo i SQL-a)
1. Vrsta i tip transakcije preko URL-a: normal/sale, advance/sale, advance/finalize, training/sale.
2. Referentni dokument: konačni nosi broj i vreme avansa.
3. Identifikacija kupca: `10:<PIB>`.
4. Poreska oznaka na svakoj stavci i dostavi.
5. Način plaćanja: samo cash ili card (FAIL).
6. Vreme PFR-a se čuva.
7. Iznosi: zbir stavki = plaćanje = `total_minor` = `totalAmount`; zbir konačnih = avans; delovi dostave = originalna naknada.
8. Ćirilica netaknuta.
9. Jedinstvenost: jedan dokument po operaciji.

### Nije moglo da se potvrdi
- Brojač i tip brojača, potpis, „KRAJ FISKALNOG RAČUNA”, QR kod i PDF (pravi ih V-PFR/Fiscomm; mock vraća null).
- Format verifikacionog URL-a.
- Finalize sa `amount = advanceAmount` (Fiscomm test nalog).
- `skipBuyerIdValidation` ponašanje PFR-a.
- Račun od 0 RSD u PFR-u.
- Poreski tretman dostave i trenutak prometa pri pouzeću (knjigovođa).
- B2B kupci i SEF e-faktura (knjigovođa).
- Režim obuke (API nije zvan).
- Dužina polja `orderNumber`.

## Napomene o rizicima
- R-1 (kredit): kredit se tretira kao popust; ako potiče iz ranijeg avansa, trebalo bi razdužiti taj avans.
- R-2: popust nije posebno iskazan na računu.
- R-3: za jednu posetu kupac dobija 2–4 mejla (O5).

## Nije pokriveno i zašto
- Pravi Fiscomm (live i trening): mreža zabranjena, ključ prazan.
- Kartica i webhook naplate: PAYMENT_MODE=disabled; execute povraćaja traži mock.
- Timeout, 5xx, pogrešan iznos kroz server: samo izolovane skripte i SQL (mock odgovor je ugrađen u `issueFiscomm`).
- Pravi `credits_ledger` i billing: simulirano.
- Pauza: nije posebno testirana (preskok i neuspešna nedelja pokrivaju isti put).
- HTML mejla: samo tekst.

## Čišćenje i uticaj na deljeno okruženje
- Deaktivirano: TEST-C proizvodi i promo TESTC10, TESTC777. Porudžbine i fiskalni zapisi ostavljeni kao dokaz.
- Namerno ostavljena stanja iz SQL simulacija: O10 unknown; O11 failed; O12 provider fiscomm; O7, O8 izmenjeni iznosi; O2, O13 dodatni outbox redovi.
- Rute (prošli datumi, samo TEST-C): 07-07, 07-14, 07-28, 08-04, 08-07, 09-01, 09-04, 09-11, 09-18, 09-25, 10-16.
- Tuđe: 10-02 zaključao cron; 11-06 ima cutoff 11-04T07:00Z (drugi agent menjao cutoff) — verovatni okidač C-017.
