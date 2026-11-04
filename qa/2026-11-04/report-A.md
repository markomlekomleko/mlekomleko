# Izveštaj A — korisnički deo (Faza 3), 2026-11-04

Testirao: Agent A. Okruženje: http://localhost:3100, baza .data/qa-local.sqlite, IP 198.51.100.10, prefiks TEST-A-.

**Ukupno slučajeva: 318 — PASS 240, FAIL 76, BLOCKED 2.**

Napomene o metodi: (1) Rate-limit redove sopstvenog IP-a i email cooldown brisao sam direktno iz tabele rate_limits (da bih mogao da nastavim); sam limit je testiran posebno (A-007, A-048). (2) Admin API korišćen samo za kreiranje TEST-A promo kodova (TESTA10 itd.) i evidentiranje uplate za sopstvene porudžbine. (3) Datum dostave 2026-11-06 je tokom testa zaključao drugi agent (deliveries.status=locked, cutoff_at 2026-11-04T07:00Z); zato su kasniji testovi koristili 2026-11-10. (4) Veliki broj FAIL-ova je isključivo zbog engleskih poruka (vidi F-01) — u tabeli je kriterijum "poruka na srpskom".

## Tabela slučajeva

| ID | Uloga | Koraci | Očekivano | Stvarno | Status | Ozbiljnost |
|---|---|---|---|---|---|---|
| A-001 | Gost | POST /api/auth/register {email:test-a-1} | 202 + challengeId + lokalni kod | 202 {"accepted":true,"challengeId":"YS592cduPgIiSSaaGKk7Xu9sqTGhbsmKwjLc9WKSnnk","expiresAt":"2026-11-04T14:48:36.864Z","channel":"email","retryAfter":60,"localDeve keys=accepted,challengeId,expiresAt,channel,retryAfter, | PASS | Visoko |
| A-002 | Gost | GET /api/account bez kolacica | 401 sa porukom na srpskom | 401 AUTH_REQUIRED: A valid customer session is required. | FAIL | Srednje |
| A-003 | Gost | verify sa pogresnim kodom | 401 INVALID_CODE srpska poruka | 401 INVALID_CODE: Kod nije ispravan, istekao je ili je već iskorišćen. Zatražite novi kod. | PASS | Visoko |
| A-004-5 cifara | Gost | verify 5 cifara | 422 INVALID_CODE srpska poruka | 422 INVALID_CODE: Unesite šestocifreni kod. | PASS | Nisko |
| A-004-slova | Gost | verify slova | 422 INVALID_CODE srpska poruka | 422 INVALID_CODE: Unesite šestocifreni kod. | PASS | Nisko |
| A-004-broj umesto stringa | Gost | verify broj umesto stringa | 422 INVALID_CODE srpska poruka | 422 INVALID_CODE: Unesite šestocifreni kod. | PASS | Nisko |
| A-004-prazan kod | Gost | verify prazan kod | 422 INVALID_CODE srpska poruka | 422 INVALID_CODE: Unesite šestocifreni kod. | PASS | Nisko |
| A-004-bez challengeId | Gost | verify bez challengeId | 422 INVALID_CODE srpska poruka | 422 INVALID_CODE: Unesite šestocifreni kod. | PASS | Nisko |
| A-004-challengeId kratak | Gost | verify challengeId kratak | 422 INVALID_CODE srpska poruka | 422 INVALID_CODE: Unesite šestocifreni kod. | PASS | Nisko |
| A-004-kod sa razmakom | Gost | verify kod sa razmakom | 422 INVALID_CODE srpska poruka | 422 INVALID_CODE: Unesite šestocifreni kod. | PASS | Nisko |
| A-005 | Gost | 5 pogresnih pokusaja pa ispravan kod | 401 (challenge zakljucan), nalog se ne otvara | 401 INVALID_CODE: Kod nije ispravan, istekao je ili je već iskorišćen. Zatražite novi kod. | PASS | Visoko |
| A-006 | Gost | kod istekao (expires_at u proslosti) pa ispravan kod | 401 'istekao' | 401 INVALID_CODE: Kod nije ispravan, istekao je ili je već iskorišćen. Zatražite novi kod. | PASS | Visoko |
| A-007 | Gost | drugi zahtev za kod za isti email unutar 60s | 429 RATE_LIMITED srpska poruka + retryAfter | 429 RATE_LIMITED: Previše zahteva. Pokušajte ponovo kasnije. retryAfter={"retryAfter":60} hdr=null | PASS | Srednje |
| A-008 | Gost->Kupac | register + verify ispravan kod | 200 authenticated, Set-Cookie mm_session HttpOnly SameSite=Lax | 200 {"authenticated":true,"expiresAt":"2026-12-04T14:43:37.094Z"} cookie=mm_session=<tok>; Path=/; HttpOnly; SameSite=Lax; Max-Age=2591999; Expires=Fri, 04 Dec 2026 14:43:37 GMT | PASS | Visoko |
| A-009 | Gost | ponovna upotreba istog koda | 401 | 401 INVALID_CODE: Kod nije ispravan, istekao je ili je već iskorišćen. Zatražite novi kod. | PASS | Visoko |
| A-010 | Kupac | GET /api/account novi nalog bez porudzbina | 200, prazna stanja | 200 {"customer":{"id":"d24070be-4364-4c90-9b7e-3efeae01e117","email":"test-a-1@example.test","fullName":"","phone":"","addressLine1":"","addressLine2":null,"city":" | PASS | Srednje |
| A-011 | Kupac | POST /api/auth/logout pa GET /api/account sa istim kolacicem | logout 200/204, nalog 401 INVALID_SESSION | logout 200 {"loggedOut":true}; acc 401 INVALID_SESSION: Customer session is invalid or expired. | PASS | Visoko |
| A-012 | Kupac | POST /api/auth/logout sa tudjim Origin | 403 CSRF_REJECTED (ili bar ne odjavljuje) | 403 CSRF_REJECTED: Zahtev nije poslat sa dozvoljenog porekla. | PASS | Nisko |
| A-013-bez Origin | Gost | register bez Origin | 403 CSRF_REJECTED srpska poruka | 403 CSRF_REJECTED: Zahtev nije poslat sa dozvoljenog porekla. | PASS | Srednje |
| A-013-tudj Origin | Gost | register tudj Origin | 403 CSRF_REJECTED srpska poruka | 403 CSRF_REJECTED: Zahtev nije poslat sa dozvoljenog porekla. | PASS | Srednje |
| A-013-Origin https | Gost | register Origin https | 403 CSRF_REJECTED srpska poruka | 403 CSRF_REJECTED: Zahtev nije poslat sa dozvoljenog porekla. | PASS | Srednje |
| A-020 | Gost | POST /api/checkout gotovina, 2x kravlje jednokratno, Beograd 11000 | 201, total=50000+35000=85000, paymentStatus pending | 201 {"order":{"id":"ord_AJra8H_OM0_uSBoK55vsn9GIrTEJmJr7","orderNumber":"MM-20261104-AJRA8H_O","subtotalMinor":50000,"discountMinor":0,"deliveryFeeMinor":35000,"tot {"id":"ord_AJra8H_OM0_uSBoK55vsn9GIrTEJmJr7","orderNumb | PASS | Kritično |
| A-021 | Gost | isti Idempotency-Key + isto telo | isto 201 telo, nema nove porudzbine | 201 {"order":{"id":"ord_AJra8H_OM0_uSBoK55vsn9GIrTEJmJr7","orderNumber":"MM-20261104-AJRA8H_O","subtotalMinor":50000,"discountMinor":0,"deliveryFeeMinor":35000,"tot same=true cnt=[{"c":1}] | PASS | Visoko |
| A-022 | Gost | isti Idempotency-Key + drugo telo (qty 3) | 409 IDEMPOTENCY_CONFLICT na srpskom | 409 IDEMPOTENCY_CONFLICT: This Idempotency-Key was already used for a different checkout. | PASS | Srednje |
| A-023 | Gost | checkout sa klijentskim cenama (unitPriceMinor=1,totalMinor=1,deliveryFeeMinor=0,discountMinor=99999) | ignorisano: total=85000 | 201 {"order":{"id":"ord_4uK-LfZhYwgrPj6NLtTqxcvlCIbJlrwp","orderNumber":"MM-20261104-4UK-LFZH","subtotalMinor":50000,"discountMinor":0,"deliveryFeeMinor":35000,"tot {"id":"ord_4uK-LfZhYwgrPj6NLtTqxcvlCIbJlrwp","orderNumb | PASS | Kritično |
| A-024-q0 | Gost | checkout quantity=0 | 422 validacija na srpskom | 422 VALIDATION_ERROR: items[0].quantity must be a positive integer. | PASS | Srednje |
| A-024-q-1 | Gost | checkout quantity=-1 | 422 validacija na srpskom | 422 VALIDATION_ERROR: items[0].quantity must be a positive integer. | PASS | Srednje |
| A-024-q1.5 | Gost | checkout quantity=1.5 | 422 validacija na srpskom | 422 VALIDATION_ERROR: items[0].quantity must be a positive integer. | PASS | Srednje |
| A-024-q'2' string | Gost | checkout quantity='2' string | 422 validacija na srpskom | 422 VALIDATION_ERROR: items[0].quantity must be a positive integer. | PASS | Srednje |
| A-024-q101 | Gost | checkout quantity=101 | 422 validacija na srpskom | 422 VALIDATION_ERROR: items[0].quantity must be a positive integer. | PASS | Srednje |
| A-024-q1e21 | Gost | checkout quantity=1e21 | 422 validacija na srpskom | 422 VALIDATION_ERROR: items[0].quantity must be a positive integer. | PASS | Srednje |
| A-024-qnull | Gost | checkout quantity=null | 422 validacija na srpskom | 422 VALIDATION_ERROR: items[0].quantity must be a positive integer. | PASS | Srednje |
| A-024-q2.0 | Gost | checkout quantity=2.0 | 422 validacija na srpskom | 201 {"order":{"id":"ord_QQ66CTltkn0G-ijPLkIln_3jbUPrdPiM","orderNumber":"MM-20261104-QQ66CTLT","subtotalMinor":50000,"discountMinor":0,"deliveryFeeMinor":35000,"tot | PASS | Srednje |
| A-025 | Gost | checkout quantity=100 (granica) | 201 total 100*25000+35000 | 201 {"order":{"id":"ord_FYMWrb7h5nskSiEsnB-TbbUJ2rd8xuGK","orderNumber":"MM-20261104-FYMWRB7H","subtotalMinor":2500000,"discountMinor":0,"deliveryFeeMinor":35000,"t {"id":"ord_FYMWrb7h5nskSiEsnB-TbbUJ2rd8xuGK","orderNumb | PASS | Nisko |
| A-026-neaktivan | Gost | checkout proizvod neaktivan | 409/422 srpska poruka bez ID-a | 409 PRODUCT_UNAVAILABLE: Proizvod prod_jogurt_1l nije dostupan. | PASS | Nisko |
| A-026-nepostojeci | Gost | checkout proizvod nepostojeci | 409/422 srpska poruka bez ID-a | 409 PRODUCT_UNAVAILABLE: Proizvod nepostoji nije dostupan. | PASS | Nisko |
| A-026-prazan | Gost | checkout proizvod prazan | 409/422 srpska poruka bez ID-a | 422 VALIDATION_ERROR: items[0].productId must contain 1-100 characters. | PASS | Nisko |
| A-026-predugacak | Gost | checkout proizvod predugacak | 409/422 srpska poruka bez ID-a | 422 VALIDATION_ERROR: items[0].productId must contain 1-100 characters. | PASS | Nisko |
| A-026-sql | Gost | checkout proizvod sql | 409/422 srpska poruka bez ID-a | 409 PRODUCT_UNAVAILABLE: Proizvod '; DROP TABLE orders;-- nije dostupan. | PASS | Nisko |
| A-027 | Gost | checkout subscription bez cadence | 422 srpski | 422 VALIDATION_ERROR: items[0].cadence must be one of: weekly, biweekly. | PASS | Nisko |
| A-027b | Gost | checkout cadence=monthly | 422 srpski | 422 VALIDATION_ERROR: items[0].cadence must be one of: weekly, biweekly. | PASS | Nisko |
| A-027c | Gost | checkout purchaseType=bogus | 422 srpski | 422 VALIDATION_ERROR: items[0].purchaseType must be one of: one_time, subscription. | PASS | Nisko |
| A-028-prazna lista | Gost | checkout items=prazna lista | 422 srpski | 422 VALIDATION_ERROR: items must contain 1-50 items. | PASS | Nisko |
| A-028-null | Gost | checkout items=null | 422 srpski | 422 VALIDATION_ERROR: items must contain 1-50 items. | PASS | Nisko |
| A-028-string | Gost | checkout items=string | 422 srpski | 422 VALIDATION_ERROR: items must contain 1-50 items. | PASS | Nisko |
| A-028-51 stavki | Gost | checkout items=51 stavki | 422 srpski | 422 VALIDATION_ERROR: items must contain 1-50 items. | PASS | Nisko |
| A-028-null stavka | Gost | checkout items=null stavka | 422 srpski | 422 VALIDATION_ERROR: items[0] is invalid. | PASS | Nisko |
| A-029 | Gost | checkout dve iste stavke (isti proizvod 2x2) | 201 total 4*25000+35000=135000 ili spajanje | 201 {"order":{"id":"ord_kKl8w_a81d2c0mjU9EQ9w9mDfflV4vuh","orderNumber":"MM-20261104-KKL8W_A8","subtotalMinor":100000,"discountMinor":0,"deliveryFeeMinor":35000,"to {"id":"ord_kKl8w_a81d2c0mjU9EQ9w9mDfflV4vuh","orderNumb | PASS | Nisko |
| A-030-email prazan | Gost | checkout customer: email prazan | 422 | 422 VALIDATION_ERROR: email must contain 1-254 characters. | PASS | Nisko |
| A-030-email los | Gost | checkout customer: email los | 422 | 422 VALIDATION_ERROR: Email address is invalid. | PASS | Nisko |
| A-030-ime prazno | Gost | checkout customer: ime prazno | 422 | 422 VALIDATION_ERROR: customer.fullName must contain 1-160 characters. | PASS | Nisko |
| A-030-ime razmaci | Gost | checkout customer: ime razmaci | 422 | 422 VALIDATION_ERROR: customer.fullName must contain 1-160 characters. | PASS | Nisko |
| A-030-ime 161 | Gost | checkout customer: ime 161 | 422 | 422 VALIDATION_ERROR: customer.fullName must contain 1-160 characters. | PASS | Nisko |
| A-030-ime cirilica | Gost | checkout customer: ime cirilica | 201 | 201 {"order":{"id":"ord_zCcyz0xU2Rg-MIS10g96JFsVsbaNZfJs","orderNumber":"MM-20261104-ZCCYZ0XU","subtotalMinor":50000,"discountMinor":0,"deliveryFeeMinor":35000,"tot | PASS | Nisko |
| A-030-ime emoji | Gost | checkout customer: ime emoji | 201 | 201 {"order":{"id":"ord_7oUkSNAScnb9FsIPKwuZj8_I2uOqygHj","orderNumber":"MM-20261104-7OUKSNAS","subtotalMinor":50000,"discountMinor":0,"deliveryFeeMinor":35000,"tot | PASS | Nisko |
| A-030-telefon prazan | Gost | checkout customer: telefon prazan | 422 | 422 VALIDATION_ERROR: customer.phone must contain 1-40 characters. | PASS | Nisko |
| A-030-telefon slova | Gost | checkout customer: telefon slova | 201 | 201 {"order":{"id":"ord_uMtjOGeXRThA3d4L7aakwB79PRUDnfa7","orderNumber":"MM-20261104-UMTJOGEX","subtotalMinor":50000,"discountMinor":0,"deliveryFeeMinor":35000,"tot | PASS | Nisko |
| A-030-telefon 41 | Gost | checkout customer: telefon 41 | 422 | 422 VALIDATION_ERROR: customer.phone must contain 1-40 characters. | PASS | Nisko |
| A-030-telefon kratak | Gost | checkout customer: telefon kratak | 201 | 201 {"order":{"id":"ord_sCkZGhZuQsQrpdFol6prpgDEP-pUS1Oc","orderNumber":"MM-20261104-SCKZGHZU","subtotalMinor":50000,"discountMinor":0,"deliveryFeeMinor":35000,"tot | PASS | Nisko |
| A-030-adresa prazna | Gost | checkout customer: adresa prazna | 422 | 422 VALIDATION_ERROR: customer.addressLine1 must contain 1-200 characters. | PASS | Nisko |
| A-030-adresa 201 | Gost | checkout customer: adresa 201 | 422 | 422 VALIDATION_ERROR: customer.addressLine1 must contain 1-200 characters. | PASS | Nisko |
| A-030-napomena 501 | Gost | checkout customer: napomena 501 | 422 | 422 VALIDATION_ERROR: customer.deliveryNote must contain 1-500 characters. | PASS | Nisko |
| A-030-napomena html | Gost | checkout customer: napomena html | 201 | 201 {"order":{"id":"ord_b8FIzXnXxnSSGQF2O5M3HtZwZMPOKQF0","orderNumber":"MM-20261104-B8FIZXNX","subtotalMinor":50000,"discountMinor":0,"deliveryFeeMinor":35000,"tot | PASS | Nisko |
| A-030-grad prazan | Gost | checkout customer: grad prazan | 422 | 422 VALIDATION_ERROR: customer.city must contain 1-100 characters. | PASS | Nisko |
| A-030-grad Kragujevac | Gost | checkout customer: grad Kragujevac | 422 | 422 DELIVERY_AREA_UNAVAILABLE: Adresa nije u zoni dostave. | PASS | Nisko |
| A-030-Beograd + 21000 | Gost | checkout customer: Beograd + 21000 | 422 | 422 DELIVERY_AREA_UNAVAILABLE: Adresa nije u zoni dostave. | PASS | Nisko |
| A-030-Novi Sad + 21000 | Gost | checkout customer: Novi Sad + 21000 | 201 | 201 {"order":{"id":"ord_hEmI629bPP3MwOMh5MwSsY2kiOJ8KFUn","orderNumber":"MM-20261104-HEMI629B","subtotalMinor":50000,"discountMinor":0,"deliveryFeeMinor":35000,"tot | PASS | Nisko |
| A-030-PTT 4 cifre | Gost | checkout customer: PTT 4 cifre | 422 | 422 DELIVERY_AREA_UNAVAILABLE: Adresa nije u zoni dostave. | PASS | Nisko |
| A-030-PTT slova | Gost | checkout customer: PTT slova | 422 | 422 DELIVERY_AREA_UNAVAILABLE: Adresa nije u zoni dostave. | PASS | Nisko |
| A-030-PTT 11999 | Gost | checkout customer: PTT 11999 | 422 | 422 DELIVERY_AREA_UNAVAILABLE: Adresa nije u zoni dostave. | PASS | Nisko |
| A-030-grad cirilica | Gost | checkout customer: grad cirilica | 201 | 201 {"order":{"id":"ord_v11QvDfSKcE7bXXhwklwFE0Q1AMCt2WO","orderNumber":"MM-20261104-V11QVDFS","subtotalMinor":50000,"discountMinor":0,"deliveryFeeMinor":35000,"tot | PASS | Nisko |
| A-030-grad BEOGRAD | Gost | checkout customer: grad BEOGRAD | 201 | 201 {"order":{"id":"ord_rpjcO-Pdck5c2XoNbmAEOLBudINAe6MI","orderNumber":"MM-20261104-RPJCO-PD","subtotalMinor":50000,"discountMinor":0,"deliveryFeeMinor":35000,"tot | PASS | Nisko |
| A-030-Inđija 22320 | Gost | checkout customer: Inđija 22320 | 422 | 422 DELIVERY_AREA_UNAVAILABLE: Dostava trenutno nije dostupna za uneti poštanski broj. | PASS | Nisko |
| A-031a | Gost | paymentMethod=card | 503/409 srpski poruka | 503 PAYMENT_METHOD_UNAVAILABLE: Plaćanje karticom preko Raiffeisen RaiAccept servisa još nije dostupno. Izaberite gotovinsko plaćanje. | PASS | Srednje |
| A-031b | Gost | paymentMethod=bitcoin | 422 | 422 VALIDATION_ERROR: paymentMethod must be one of: card, cash. | PASS | Srednje |
| A-031c | Gost | bez paymentMethod | 422 | 422 VALIDATION_ERROR: paymentMethod must be one of: card, cash. | PASS | Srednje |
| A-031d | Gost | telo sa cardNumber | 422 CARD_DATA_REJECTED | 422 CARD_DATA_REJECTED: Raw card data must never be sent to this service. Use a payment-provider token. | PASS | Srednje |
| A-032a | Gost | bez Idempotency-Key | 422 srpski | 422 VALIDATION_ERROR: Idempotency-Key is required. | PASS | Srednje |
| A-032b | Gost | Idempotency-Key 5 znakova | 422 | 422 IDEMPOTENCY_KEY_REQUIRED: Idempotency-Key must contain at least 8 characters. | PASS | Srednje |
| A-032c | Gost | Idempotency-Key 201 | 422 | 422 VALIDATION_ERROR: Idempotency-Key must contain 1-200 characters. | PASS | Srednje |
| A-033 | Gost | checkout sa demo@example.invalid | 403 DEMO_READ_ONLY srpski | 403 DEMO_READ_ONLY: Demo nalog služi za pregled. Za izmene i poručivanje prijavite se na svoj nalog. | PASS | Srednje |
| A-033b | Gost | checkout sa DEMO@Example.Invalid (velika slova) | 403 | 403 DEMO_READ_ONLY: Demo nalog služi za pregled. Za izmene i poručivanje prijavite se na svoj nalog. | PASS | Srednje |
| A-034-sreda-cetvrtak (nije dan dostave) | Gost | deliveryDate=2026-11-05 | 422 | 422 INVALID_DELIVERY_DATE: Izabrani datum nije dan dostave. | PASS | Srednje |
| A-034-danas | Gost | deliveryDate=2026-11-04 | 422 | 422 INVALID_DELIVERY_DATE: Izabrani datum nije dan dostave. | PASS | Srednje |
| A-034-juce | Gost | deliveryDate=2026-11-03 | 422 | 409 DELIVERY_LOCKED: This delivery is past its change deadline and can no longer be modified. | FAIL | Srednje |
| A-034-subota | Gost | deliveryDate=2026-11-07 | 422 | 422 INVALID_DELIVERY_DATE: Izabrani datum nije dan dostave. | PASS | Srednje |
| A-034-nepostojeci datum | Gost | deliveryDate=2026-02-30 | 422 | 422 VALIDATION_ERROR: deliveryDate is not a valid date. | PASS | Srednje |
| A-034-los format | Gost | deliveryDate=20261106 | 422 | 422 VALIDATION_ERROR: deliveryDate must be YYYY-MM-DD in Europe/Belgrade. | PASS | Srednje |
| A-034-petak 06.11 (pre cutoffa) | Gost | deliveryDate=2026-11-06 | 201 | 201 {"order":{"id":"ord_0IOygQcOOptW5i-aU5MgQibcwjJHf5La","orderNumber":"MM-20261104-0IOYGQCO","subtotalMinor":50000,"discountMinor":0,"deliveryFeeMinor":35000,"tot | PASS | Srednje |
| A-034-utorak | Gost | deliveryDate=2026-11-10 | 201 | 201 {"order":{"id":"ord_klxGfIFUicbvO7fsGYA1_eD2s18bjEv_","orderNumber":"MM-20261104-KLXGFIFU","subtotalMinor":50000,"discountMinor":0,"deliveryFeeMinor":35000,"tot | PASS | Srednje |
| A-034-2030 | Gost | deliveryDate=2030-11-05 | 201 | 201 {"order":{"id":"ord_QTiHXu1tqtPo5kpybQLH8Qp1ooQWnL14","orderNumber":"MM-20261104-QTIHXU1T","subtotalMinor":50000,"discountMinor":0,"deliveryFeeMinor":35000,"tot | PASS | Srednje |
| A-034-kraj liste | Gost | deliveryDate=2027-04-30 | 201 | 201 {"order":{"id":"ord_axUFdzqdQZ_50gxUMt0PjF3azPd6BORo","orderNumber":"MM-20261104-AXUFDZQD","subtotalMinor":50000,"discountMinor":0,"deliveryFeeMinor":35000,"tot | PASS | Srednje |
| A-034-prazno | Gost | deliveryDate= | null | 422 VALIDATION_ERROR: deliveryDate must be YYYY-MM-DD in Europe/Belgrade. | PASS | Srednje |
| A-034-broj | Gost | deliveryDate=12345 | 422 | 422 VALIDATION_ERROR: deliveryDate must be YYYY-MM-DD in Europe/Belgrade. | PASS | Srednje |
| A-035-validan | Gost | promoCode=validan | 10% popust ili srpska greska | 422 PROMO_INVALID: Promo kod nije važeći ili uslovi nisu ispunjeni. | PASS | Srednje |
| A-035-mala slova | Gost | promoCode=mala slova | 10% popust ili srpska greska | 422 PROMO_INVALID: Promo kod nije važeći ili uslovi nisu ispunjeni. | PASS | Srednje |
| A-035-razmaci | Gost | promoCode=razmaci | 10% popust ili srpska greska | 422 PROMO_INVALID: Promo kod nije važeći ili uslovi nisu ispunjeni. | PASS | Srednje |
| A-035-nepostojeci | Gost | promoCode=nepostojeci | 10% popust ili srpska greska | 422 PROMO_INVALID: Promo kod nije važeći ili uslovi nisu ispunjeni. | PASS | Srednje |
| A-035-prazan | Gost | promoCode=prazan | 10% popust ili srpska greska | 201 {"order":{"id":"ord_kGQgecerNtT3S6hZEzK0eXpW7Q4hUkid","orderNumber":"MM-20261104-KGQGECER","subtotalMinor":50000,"discountMinor":0,"deliveryFeeMinor":35000,"tot | PASS | Srednje |
| A-035-predugacak | Gost | promoCode=predugacak | 10% popust ili srpska greska | 422 VALIDATION_ERROR: promoCode must contain 1-204 characters. | PASS | Srednje |
| A-035-html | Gost | promoCode=html | 10% popust ili srpska greska | 422 PROMO_INVALID: Unesite najviše pet važećih promo kodova. | PASS | Srednje |
| A-036 | Gost | promo TESTA10 (mala slova) 10% | 201 discount=5000 total=80000 | 201 {"order":{"id":"ord__lLs7y5Mqq3_ZkgnFd4eKHuLLnOPvLBN","orderNumber":"MM-20261104-_LLS7Y5M","subtotalMinor":50000,"discountMinor":5000,"deliveryFeeMinor":35000," {"id":"ord__lLs7y5Mqq3_ZkgnFd4eKHuLLnOPvLBN","orderNumb | PASS | Srednje |
| A-036b | Gost | promo sa razmacima, isti kupac ponovo | 201 sa popustom (nema per-customer limita) | 201 {"order":{"id":"ord_MyLUlkEDsjnl_Nx9l1ahehJI2jiwBZK7","orderNumber":"MM-20261104-MYLULKED","subtotalMinor":50000,"discountMinor":5000,"deliveryFeeMinor":35000," {"id":"ord_MyLUlkEDsjnl_Nx9l1ahehJI2jiwBZK7","orderNumb | PASS | Srednje |
| A-037 | Gost | fixed popust veci od narudzbine | total >= 0, popust ogranicen na subtotal | 201 {"order":{"id":"ord_uM8Y5UcjaT1JQc7a1h5IuQ5yAryO8l_G","orderNumber":"MM-20261104-UM8Y5UCJ","subtotalMinor":50000,"discountMinor":50000,"deliveryFeeMinor":35000, {"id":"ord_uM8Y5UcjaT1JQc7a1h5IuQ5yAryO8l_G","orderNumb | PASS | Visoko |
| A-038 | Gost | istekao promo | 422 srpski | 422 PROMO_INVALID: Promo kod nije važeći ili uslovi nisu ispunjeni. "" | PASS | Srednje |
| A-039 | Gost | promo sa min. porudzbinom 5000 RSD, narudzbina 500 | 422 uslovi | 422 PROMO_INVALID: Promo kod nije važeći ili uslovi nisu ispunjeni. "" | PASS | Srednje |
| A-039b | Gost | promo min ispunjen (30x250=7500) | 201 | 201 {"order":{"id":"ord_1Um5qB5y2IOUnkdJg5kZHc9TFKB5ZyXz","orderNumber":"MM-20261104-1UM5QB5Y","subtotalMinor":750000,"discountMinor":75000,"deliveryFeeMinor":35000 {"id":"ord_1Um5qB5y2IOUnkdJg5kZHc9TFKB5ZyXz","orderNumb | PASS | Srednje |
| A-040 | Gost | firstPurchaseOnly novi kupac | 201 popust 20% | 201 {"order":{"id":"ord_8h613sQK7y-OvAaA0pyKE3GitsR9aVEE","orderNumber":"MM-20261104-8H613SQK","subtotalMinor":50000,"discountMinor":10000,"deliveryFeeMinor":35000, {"id":"ord_8h613sQK7y-OvAaA0pyKE3GitsR9aVEE","orderNumb | PASS | Srednje |
| A-040b | Gost | firstPurchaseOnly isti kupac druga narudzbina | 422 | 422 PROMO_FIRST_PURCHASE: Kod važi samo za prvu kupovinu. "" | PASS | Srednje |
| A-041 | Gost | usageLimit=1 prvi | 201 | 201 {"order":{"id":"ord_7Em69bd6qBokD8Y8GCF56mYS7x-16Jr3","orderNumber":"MM-20261104-7EM69BD6","subtotalMinor":50000,"discountMinor":2500,"deliveryFeeMinor":35000," {"id":"ord_7Em69bd6qBokD8Y8GCF56mYS7x-16Jr3","orderNumb | PASS | Srednje |
| A-041b | Gost | usageLimit=1 drugi kupac | 422 iskoriscen | 422 PROMO_INVALID: Promo kod nije važeći ili uslovi nisu ispunjeni. "" | PASS | Srednje |
| A-042 | Gost | perCustomerLimit=1 prva | 201 | 201 {"order":{"id":"ord_gfTz7iWe4Ldijo_dU825isqW4LTHTr11","orderNumber":"MM-20261104-GFTZ7IWE","subtotalMinor":50000,"discountMinor":5000,"deliveryFeeMinor":35000," {"id":"ord_gfTz7iWe4Ldijo_dU825isqW4LTHTr11","orderNumb | PASS | Srednje |
| A-042b | Gost | perCustomerLimit=1 ista osoba druga | 422 | 422 PROMO_CUSTOMER_LIMIT: Iskorišćen je dozvoljeni broj upotreba ovog koda. "" | PASS | Srednje |
| A-042c | Gost | perCustomerLimit zaobilazenje velikim slovima emaila | 422 | 422 PROMO_CUSTOMER_LIMIT: Iskorišćen je dozvoljeni broj upotreba ovog koda. "" | PASS | Srednje |
| A-043 | Gost | dva paralelna checkout-a sa istrosenim kodom | oba 422 (vec iskoriscen) | 422 PROMO_INVALID: Promo kod nije važeći ili uslovi nisu ispunjeni. "" | PASS | Srednje |
| A-044 | Gost | 3 paralelna checkout-a sa istim Idempotency-Key i telom | tacno 1 porudzbina, svi 201 ili 409 CHECKOUT_IN_PROGRESS | 201,201,201 orders=[{"c":1}] | PASS | Visoko |
| A-045 | Gost | dupli submit sa razlicitim Idempotency-Key (isto telo) | dve porudzbine nastaju (klijent mora koristiti isti kljuc) | 201,201 | PASS | Nisko |
| A-046 | Gost | checkout telo > 64KB | 413 PAYLOAD_TOO_LARGE srpski | 413 PAYLOAD_TOO_LARGE: Request body is too large. | PASS | Nisko |
| A-047 | Gost | checkout neispravan JSON | 400 srpski | 400 INVALID_JSON: Request body is not valid JSON. | PASS | Nisko |
| A-048 | Gost | 22 uzastopna checkout zahteva sa istog IP | 429 posle 20 | 429 RATE_LIMITED: Previše zahteva. Pokušajte ponovo kasnije. | PASS | Nisko |
| A-050a | Gost sa porudzbinom | POST /api/auth/code {email gosta koji je poručio} | 202 + kod (lokalno) | 202 {"accepted":true,"challengeId":"mq3BrOXJmtcBsmJewHCq20deYnlfMADY6gIrteA_K4k","expiresAt":"2026-11-04T14:51:51.666Z","channel":"email","retryAfter":60,"localDeve code=true | PASS | Visoko |
| A-050 | Gost->Kupac | gost poručio (test-a-20), potom prijava istim emailom kodom; /api/account | nalog vidi svoju porudzbinu | 200 {"customer":{"id":"cus_ThscE4hD-0QUKIxCowcIUu-fQDR1ceDV","email":"test-a-20@example.test","fullName":"TEST-A Kupac 20","phone":"+381601234567","addressLine1":"K hasOrder=true | PASS | Visoko |
| A-051 | Gost | POST /api/auth/code nepoznat email (bez naloga i bez porudzbine) | 202 iste forme (bez enumeracije), bez koda | 202 {"accepted":true,"challengeId":"iTS_Ne09v9TtNSDBPeaU6J6VCmaqCXpO3lIzeQjshe4","expiresAt":"2026-11-04T14:51:51.720Z","channel":"email","retryAfter":60} keys=accepted,challengeId,expiresAt,channel,retryAfter | PASS | Srednje |
| A-051b | Gost | verify za izmisljeni challenge nepoznatog emaila | 401 srpski | 401 INVALID_CODE: Kod nije ispravan, istekao je ili je već iskorišćen. Zatražite novi kod. | PASS | Nisko |
| A-052 | Kupac | prijava postojeceg kupca (test-a-1) kodom | 200 + kolacic | 200 {"authenticated":true,"expiresAt":"2026-12-04T14:46:51.769Z"} | PASS | Visoko |
| A-053 | Kupac | dve sesije (dva taba/uredjaja); odjava jedne | druga sesija ostaje vazeca | odjavljena=401, druga=200 | PASS | Srednje |
| A-054-pogresan token 43 | Gost | GET /api/account cookie: pogresan token 43 | 401 srpska poruka | 401 INVALID_SESSION: Customer session is invalid or expired. | FAIL | Srednje |
| A-054-prekratak | Gost | GET /api/account cookie: prekratak | 401 srpska poruka | 401 AUTH_REQUIRED: A valid customer session is required. | FAIL | Srednje |
| A-054-prazan | Gost | GET /api/account cookie: prazan | 401 srpska poruka | 401 AUTH_REQUIRED: A valid customer session is required. | FAIL | Srednje |
| A-054-predugacak | Gost | GET /api/account cookie: predugacak | 401 srpska poruka | 401 AUTH_REQUIRED: A valid customer session is required. | FAIL | Srednje |
| A-054-sql | Gost | GET /api/account cookie: sql | 401 srpska poruka | 401 AUTH_REQUIRED: A valid customer session is required. | FAIL | Srednje |
| A-054-pogresno ime | Gost | GET /api/account cookie: pogresno ime | 401 srpska poruka | 401 AUTH_REQUIRED: A valid customer session is required. | FAIL | Srednje |
| A-055 | Kupac | istekla sesija (expires_at u proslosti) GET /api/account | 401 srpska poruka 'sesija je istekla' | 401 INVALID_SESSION: Customer session is invalid or expired. | FAIL | Srednje |
| A-056 | Kupac | PATCH /api/account sa tudjim Origin | 403 CSRF_REJECTED | 403 CSRF_REJECTED: Zahtev nije poslat sa dozvoljenog porekla. | PASS | Visoko |
| A-056b | Kupac | PATCH /api/account bez Origin headera | 403 | 403 CSRF_REJECTED: Zahtev nije poslat sa dozvoljenog porekla. | PASS | Visoko |
| A-060 | Demo | POST /api/auth/demo | 200 demo:true + kolacic (8h) | 200 {"authenticated":true,"demo":true,"expiresAt":"2026-11-04T22:46:51.902Z"} mm_session=<t>; Path=/; HttpOnly; SameSite=Lax; Max-Age=28799; Expires=Wed, 04 Nov 2026 22:46:51 GMT | PASS | Srednje |
| A-061 | Demo | GET /api/account kao demo | 200 demo podaci | 200 {"demo":true,"currentDate":"2026-11-04","customer":{"fullName":"Demo korisnik","email":"demo@example.invalid","phone demo=true | PASS | Nisko |
| A-062-PATCH_api_account | Demo | PATCH /api/account kao demo | 403 DEMO_READ_ONLY srpski | 403 DEMO_READ_ONLY: Demo nalog služi za pregled. Za izmene i poručivanje prijavite se na svoj nalog. | PASS | Srednje |
| A-062-PATCH_api_account_subscriptions_demo_subscription | Demo | PATCH /api/account/subscriptions/demo-subscription kao demo | 403 DEMO_READ_ONLY srpski | 403 DEMO_READ_ONLY: Demo nalog služi za pregled. Za izmene i poručivanje prijavite se na svoj nalog. | PASS | Srednje |
| A-062-PATCH_api_account_orders_demo_order | Demo | PATCH /api/account/orders/demo-order kao demo | 403 DEMO_READ_ONLY srpski | 403 DEMO_READ_ONLY: Demo nalog služi za pregled. Za izmene i poručivanje prijavite se na svoj nalog. | PASS | Srednje |
| A-062-POST_api_account_refunds | Demo | POST /api/account/refunds kao demo | 403 DEMO_READ_ONLY srpski | 403 DEMO_READ_ONLY: Demo nalog služi za pregled. Za izmene i poručivanje prijavite se na svoj nalog. | PASS | Srednje |
| A-062-PATCH_api_account_login_settings | Demo | PATCH /api/account/login-settings kao demo | 403 DEMO_READ_ONLY srpski | 403 DEMO_READ_ONLY: Demo nalog služi za pregled. Za izmene i poručivanje prijavite se na svoj nalog. | PASS | Srednje |
| A-062-POST_api_account_whatsapp | Demo | POST /api/account/whatsapp kao demo | 403 DEMO_READ_ONLY srpski | 403 DEMO_READ_ONLY: Demo nalog služi za pregled. Za izmene i poručivanje prijavite se na svoj nalog. | PASS | Srednje |
| A-062-POST_api_checkout | Demo | POST /api/checkout kao demo | 403 DEMO_READ_ONLY srpski | 403 DEMO_READ_ONLY: Demo nalog služi za pregled. Za izmene i poručivanje prijavite se na svoj nalog. | PASS | Srednje |
| A-063 | Demo | odjava demo sesije pa GET /api/account | 401 | logout 200; acc 401 | PASS | Nisko |
| A-064 | Demo | POST /api/auth/demo tudj Origin | 403 | 403 CSRF_REJECTED: Zahtev nije poslat sa dozvoljenog porekla. | PASS | Nisko |
| A-065 | Gost | POST /api/auth/magic-link (penzionisan) | 410 MAGIC_LINK_RETIRED srpski | 410 MAGIC_LINK_RETIRED: Prijava sada koristi jednokratni kod. Otvorite stranicu za prijavu. | PASS | Nisko |
| A-065b | Gost | POST /api/auth/magic-link/exchange sa izmisljenim tokenom | 401/410 srpski | 401 INVALID_TOKEN: Link je istekao ili je već iskorišćen. Zatražite novi link. | PASS | Nisko |
| A-066 | Kupac | POST /api/auth/code channel=whatsapp bez povezanog broja | 202 iste forme, bez koda | 202 {"accepted":true,"challengeId":"4rZwBvcGiUKFEEMOcxmhfvSOSSDQ_5HniS4J_ZD2GHk","expiresAt":"2026-11-04T14:51:53.097Z","channel":"whatsapp","retryAfter":60} code=false | PASS | Nisko |
| A-066b | Kupac | POST /api/auth/code channel=sms | 422 srpski | 422 VALIDATION_ERROR: channel must be one of: email, whatsapp, both. | FAIL | Nisko |
| A-049 | Gost | checkout BEZ deliveryDate dok je najbliza dostava (2026-11-06) zakljucana iz admina (deliveries.status=locked) | 201 na sledeci slobodan termin (ili srpska poruka) | 409 DELIVERY_LOCKED: This delivery is past its change deadline and can no longer be modified. | FAIL | Visoko |
| A-070 | Kupac | PATCH update_item bez Idempotency-Key | 422 srpski poruka | 422 VALIDATION_ERROR: Idempotency-Key is required. "" | FAIL | Srednje |
| A-071 | Kupac | update_item qty 2->4 | 200, version+1 | 200 {"subscriptionId":"sub_MiWNBiHQVdymc0-ZQPTUeq6TgwAMgngA","action":"update_item","appliesTo":"next_package","cancelAfterPackage":false,"version":2,"adjustmentMin {"v":2,"adj":0,"applies":"next_package"} | PASS | Visoko |
| A-072 | Kupac | replay istog kljuca i tela | 200 isti odgovor, nema dvostruke izmene | 200 {"subscriptionId":"sub_MiWNBiHQVdymc0-ZQPTUeq6TgwAMgngA","action":"update_item","appliesTo":"next_package","cancelAfterPackage":false,"version":2,"adjustmentMin {"v":2,"adj":0,"applies":"next_package"} | PASS | Srednje |
| A-073 | Kupac | isti kljuc, drugo telo | 409 IDEMPOTENCY_CONFLICT | 409 IDEMPOTENCY_CONFLICT: Ovaj Idempotency-Key je već iskorišćen za drugu izmenu. "" | PASS | Srednje |
| A-074 | Kupac | stari expectedVersion (stale tab) | 409 SUBSCRIPTION_VERSION_CONFLICT srpski | 409 SUBSCRIPTION_VERSION_CONFLICT: Pretplata je promenjena u drugom prozoru. Učitani su najnoviji podaci. "" | PASS | Srednje |
| A-075-evbez | Kupac | expectedVersion=bez | 422 srpski | 422 VALIDATION_ERROR: expectedVersion must be a positive integer. "" | FAIL | Nisko |
| A-075-ev0 | Kupac | expectedVersion=0 | 422 srpski | 422 VALIDATION_ERROR: expectedVersion must be a positive integer. "" | FAIL | Nisko |
| A-075-ev-1 | Kupac | expectedVersion=-1 | 422 srpski | 422 VALIDATION_ERROR: expectedVersion must be a positive integer. "" | FAIL | Nisko |
| A-075-evstring | Kupac | expectedVersion=string | 422 srpski | 422 VALIDATION_ERROR: expectedVersion must be a positive integer. "" | FAIL | Nisko |
| A-075-ev1.5 | Kupac | expectedVersion=1.5 | 422 srpski | 422 VALIDATION_ERROR: expectedVersion must be a positive integer. "" | FAIL | Nisko |
| A-075-evnull | Kupac | expectedVersion=null | 422 srpski | 422 VALIDATION_ERROR: expectedVersion must be a positive integer. "" | FAIL | Nisko |
| A-076-q0 | Kupac | update_item quantity=0 | 422 srpski | 422 VALIDATION_ERROR: quantity must be a positive integer. "" | FAIL | Nisko |
| A-076-q-3 | Kupac | update_item quantity=-3 | 422 srpski | 422 VALIDATION_ERROR: quantity must be a positive integer. "" | FAIL | Nisko |
| A-076-q101 | Kupac | update_item quantity=101 | 422 srpski | 422 VALIDATION_ERROR: quantity must be a positive integer. "" | FAIL | Nisko |
| A-076-q2.5 | Kupac | update_item quantity=2.5 | 422 srpski | 422 VALIDATION_ERROR: quantity must be a positive integer. "" | FAIL | Nisko |
| A-076-qstring | Kupac | update_item quantity=string | 422 srpski | 422 VALIDATION_ERROR: quantity must be a positive integer. "" | FAIL | Nisko |
| A-076-q100 | Kupac | update_item quantity=100 | 200 | 200 {"subscriptionId":"sub_MiWNBiHQVdymc0-ZQPTUeq6TgwAMgngA","action":"update_item","appliesTo":"next_package","cancelAfterPackage":false,"version":3,"adjustmentMin {"v":3,"adj":0,"applies":"next_package"} | PASS | Nisko |
| A-077 | Kupac | nepoznata akcija | 422 srpski | 422 VALIDATION_ERROR: action must be one of: add_item, update_item, remove_item, add_next_only, skip_next, slow_down, pause, resume, cancel. "" | FAIL | Nisko |
| A-078 | Kupac | update_item nepostojeci itemId | 404 srpski | 404 SUBSCRIPTION_ITEM_NOT_FOUND: Subscription item was not found. "" | FAIL | Nisko |
| A-079 | Kupac | update_item cadence weekly->biweekly | 200 | 200 {"subscriptionId":"sub_MiWNBiHQVdymc0-ZQPTUeq6TgwAMgngA","action":"update_item","appliesTo":"next_package","cancelAfterPackage":false,"version":4,"adjustmentMin {"v":4,"adj":0,"applies":"next_package"} | PASS | Srednje |
| A-080 | Kupac | IDOR: kupac A menja pretplatu kupca B | 404 (ne otkriva postojanje) srpski | 404 SUBSCRIPTION_NOT_FOUND: Subscription was not found. "" | FAIL | Srednje |
| A-081 | Kupac | add_item kozje 1 weekly | 200 | 200 {"subscriptionId":"sub_MiWNBiHQVdymc0-ZQPTUeq6TgwAMgngA","action":"add_item","appliesTo":"next_package","cancelAfterPackage":false,"version":5,"adjustmentMinor" {"v":5,"adj":0,"applies":"next_package"} | PASS | Srednje |
| A-082 | Kupac | add_item neaktivan proizvod | 409 srpski | 409 SUBSCRIPTION_UNAVAILABLE: Proizvod nije dostupan za redovnu dostavu. "" | PASS | Srednje |
| A-082b | Kupac | add_item qty 101 | 422 | 422 VALIDATION_ERROR: quantity must be a positive integer. "" | PASS | Nisko |
| A-083 | Kupac | add_next_only kozje x2 | 200 + addonOrder gotovina pending | 200 {"subscriptionId":"sub_MiWNBiHQVdymc0-ZQPTUeq6TgwAMgngA","action":"add_next_only","appliesTo":"current","cancelAfterPackage":false,"version":6,"adjustmentMinor" {"v":6,"adj":0,"applies":"current"} | PASS | Srednje |
| A-084 | Kupac | skip_next | 200, next_delivery_date pomeren | 200 {"subscriptionId":"sub_MiWNBiHQVdymc0-ZQPTUeq6TgwAMgngA","action":"skip_next","appliesTo":"current","cancelAfterPackage":false,"version":7,"adjustmentMinor":0," {"v":7,"adj":0,"applies":"current"} | PASS | Srednje |
| A-085-prosli datum | Kupac | pause pauseUntil=2020-01-01 | 422 srpski | 422 VALIDATION_ERROR: pauseUntil must be after the next delivery. "" | FAIL | Nisko |
| A-085-== next delivery | Kupac | pause pauseUntil=2026-11-17 | 422 srpski | 422 VALIDATION_ERROR: pauseUntil must be after the next delivery. "" | FAIL | Nisko |
| A-085-prazno | Kupac | pause pauseUntil= | 422 srpski | 422 VALIDATION_ERROR: pauseUntil must be YYYY-MM-DD in Europe/Belgrade. "" | FAIL | Nisko |
| A-085-los format | Kupac | pause pauseUntil=31.12.2026 | 422 srpski | 422 VALIDATION_ERROR: pauseUntil must be YYYY-MM-DD in Europe/Belgrade. "" | FAIL | Nisko |
| A-085-nepostojeci | Kupac | pause pauseUntil=2026-02-30 | 422 srpski | 422 VALIDATION_ERROR: pauseUntil is not a valid date. "" | FAIL | Nisko |
| A-085-null | Kupac | pause pauseUntil=null | 422 srpski | 422 VALIDATION_ERROR: pauseUntil must be YYYY-MM-DD in Europe/Belgrade. "" | FAIL | Nisko |
| A-085-max+1 | Kupac | pause max+1 dan (2027-02-05) | 422 PAUSE_TOO_LONG | 422 PAUSE_TOO_LONG: Pauza može trajati najviše tri kalendarska meseca od danas. "" | PASS | Srednje |
| A-085-max | Kupac | pause tacno do max (2027-02-04) | 200 | 200 {"subscriptionId":"sub_MiWNBiHQVdymc0-ZQPTUeq6TgwAMgngA","action":"pause","appliesTo":"current","cancelAfterPackage":false,"version":8,"adjustmentMinor":0,"curr {"v":8,"adj":0,"applies":"current"} | PASS | Srednje |
| A-086 | Kupac | update_item dok je pretplata pauzirana | 409 srpski | 409 INVALID_SUBSCRIPTION_STATE: This action requires an active subscription. "" | FAIL | Srednje |
| A-087 | Kupac | pause vec pauzirane | 200 ili 409 | 422 VALIDATION_ERROR: pauseUntil must be after the next delivery. "" | FAIL | Nisko |
| A-088 | Kupac | resume | 200 status active | 200 {"subscriptionId":"sub_MiWNBiHQVdymc0-ZQPTUeq6TgwAMgngA","action":"resume","appliesTo":"current","cancelAfterPackage":false,"version":9,"adjustmentMinor":0,"cur {"v":9,"adj":0,"applies":"current"} | PASS | Srednje |
| A-089 | Kupac | resume aktivne pretplate | 409 srpski | 409 INVALID_SUBSCRIPTION_STATE: Only a paused subscription can be resumed. "" | FAIL | Srednje |
| A-090 | Kupac | 3 paralelna skip_next sa istim expectedVersion (razliciti kljucevi) | tacno 1 uspe, ostali 409 SUBSCRIPTION_VERSION_CONFLICT | 200 \| 409:SUBSCRIPTION_VERSION_CONFLICT \| 409:SUBSCRIPTION_VERSION_CONFLICT | PASS | Visoko |
| A-091 | Kupac | cancel sa razlogom | 200 | 200 {"subscriptionId":"sub_MiWNBiHQVdymc0-ZQPTUeq6TgwAMgngA","action":"cancel","appliesTo":"current","cancelAfterPackage":false,"version":11,"adjustmentMinor":0,"cu {"v":11,"adj":0,"applies":"current"} | PASS | Srednje |
| A-092 | Kupac | izmena otkazane pretplate | 409 srpski | 409 SUBSCRIPTION_CANCELLED: A cancelled subscription is terminal and cannot be changed or resumed. "" | FAIL | Srednje |
| A-093 | Kupac | resume otkazane | 409 srpski | 409 SUBSCRIPTION_CANCELLED: A cancelled subscription is terminal and cannot be changed or resumed. "" | FAIL | Srednje |
| A-094 | Kupac | cancel razlog 241 znak | 422 | 409 SUBSCRIPTION_CANCELLED: A cancelled subscription is terminal and cannot be changed or resumed. "" | BLOCKED | Nisko |
| A-095 | Kupac | dva taba: otkazivanje isto + drugi tab sa starim expectedVersion | prvi 200; drugi 409 | 200 \| 409 SUBSCRIPTION_VERSION_CONFLICT: Pretplata je promenjena u drugom prozoru. Učitani su najnoviji podaci. | PASS | Srednje |
| A-100 | Kupac | GET /api/account/orders/:id sopstvena | 200 order+items+editable=true | 200 {"order":{"id":"ord_9ChIKodq-9F9eh-8mgeOu9rgD_KoM4hG","order_number":"MM-20261104-9CHIKODQ","kind":"one_time","payment_status":"pending","fulfillment_status":"p editable=true | PASS | Srednje |
| A-101 | Kupac | IDOR: GET tudje porudzbine po ID-u | 404 ORDER_NOT_FOUND | 404 ORDER_NOT_FOUND: Porudžbina nije pronađena. | PASS | Kritično |
| A-102 | Kupac | IDOR: PATCH cancel tudje porudzbine | 404 | 404 ORDER_NOT_FOUND: Porudžbina nije pronađena. | PASS | Kritično |
| A-103 | Kupac | IDOR: GET refunds preview tudje porudzbine | 404 | 404 ORDER_NOT_FOUND: Porudžbina nije pronađena. | PASS | Kritično |
| A-104 | Kupac | GET porudzbine: SQL u ID-u, nepostojeci ID, bez sesije | 404/404/401 srpski | 404 ORDER_NOT_FOUND: Porudžbina nije pronađena. \| 404 ORDER_NOT_FOUND: Porudžbina nije pronađena. \| 401 AUTH_REQUIRED: A valid customer session is required. | FAIL | Srednje |
| A-105 | Kupac | PATCH customerNote | 200, napomena sacuvana | 200 {"order":{"id":"ord_9ChIKodq-9F9eh-8mgeOu9rgD_KoM4hG","order_number":"MM-20261104-9CHIKODQ","kind":"one_time","payment_status":"pending","fulfillment_status":"p note=TEST-A Zvonite na interfon 🥛 <b>x</b> | PASS | Srednje |
| A-106 | Kupac | PATCH sa starim expectedUpdatedAt (drugi tab) | 409 ORDER_VERSION_CONFLICT srpski | 409 ORDER_VERSION_CONFLICT: Porudžbina je u međuvremenu promenjena. Osvežite podatke. | PASS | Srednje |
| A-107 | Kupac | PATCH customerNote 501 znak | 422 srpski | 422 VALIDATION_ERROR: customerNote must contain 1-500 characters. | FAIL | Nisko |
| A-108 | Kupac | PATCH customerNote prazno (brisanje napomene) | 200, napomena obrisana | 200 {"order":{"id":"ord_9ChIKodq-9F9eh-8mgeOu9rgD_KoM4hG","order_number":"MM-20261104-9CHIKODQ","kind":"one_time","payment_status":"pending","fulfillment_status":"p note=null | PASS | Nisko |
| A-109-nepoznato polje | Kupac | PATCH nepoznato polje | 4xx srpski poruka | 422 VALIDATION_ERROR: Poslato je nepoznato polje. | PASS | Nisko |
| A-109-nepoznata akcija | Kupac | PATCH nepoznata akcija | 4xx srpski poruka | 422 VALIDATION_ERROR: Nepoznata izmena porudžbine. | PASS | Nisko |
| A-109-prazne stavke | Kupac | PATCH prazne stavke | 4xx srpski poruka | 422 VALIDATION_ERROR: items must contain 1-50 items. | FAIL | Nisko |
| A-109-neaktivan proizvod | Kupac | PATCH neaktivan proizvod | 4xx srpski poruka | 409 PRODUCT_UNAVAILABLE: Proizvod prod_jogurt_1l nije dostupan. | PASS | Nisko |
| A-109-qty 0 | Kupac | PATCH qty 0 | 4xx srpski poruka | 422 VALIDATION_ERROR: items[0].quantity must be a positive integer. | FAIL | Nisko |
| A-109-qty -2 | Kupac | PATCH qty -2 | 4xx srpski poruka | 422 VALIDATION_ERROR: items[0].quantity must be a positive integer. | FAIL | Nisko |
| A-109-qty 1.5 | Kupac | PATCH qty 1.5 | 4xx srpski poruka | 422 VALIDATION_ERROR: items[0].quantity must be a positive integer. | FAIL | Nisko |
| A-109-qty 101 | Kupac | PATCH qty 101 | 4xx srpski poruka | 422 VALIDATION_ERROR: items[0].quantity must be a positive integer. | FAIL | Nisko |
| A-109-items string | Kupac | PATCH items string | 4xx srpski poruka | 422 VALIDATION_ERROR: Stavke porudžbine nisu ispravne. | PASS | Nisko |
| A-110 | Kupac | PATCH items zamena (kozje x2 + kravlje x1, klijentska cena=1) | 200, total = 2*30000+25000+35000=120000 | 200 {"order":{"id":"ord_9ChIKodq-9F9eh-8mgeOu9rgD_KoM4hG","order_number":"MM-20261104-9CHIKODQ","kind":"one_time","payment_status":"pending","fulfillment_status":"p total=120000 | PASS | Visoko |
| A-111 | Kupac | PATCH action=cancel | 200, fulfillment_status=cancelled | 200 {"order":{"id":"ord_9ChIKodq-9F9eh-8mgeOu9rgD_KoM4hG","order_number":"MM-20261104-9CHIKODQ","kind":"one_time","payment_status":"pending","fulfillment_status":"c ful=cancelled | PASS | Visoko |
| A-112 | Kupac | PATCH cancel vec otkazane porudzbine | 409 sa porukom 'vec otkazana' | 409 ORDER_NOT_EDITABLE: Samostalna izmena je dostupna za nenaplaćene jednokratne porudžbine koje čekaju pripremu. Za plaćenu porudžbinu javite nam se radi korekcije ili povraćaja. | FAIL | Nisko |
| A-113 | Kupac | cancel porudzbine cija je dostava (11-06) zakljucana | 409 'Rok za izmenu...istekao' srpski | 409 ORDER_NOT_EDITABLE: Rok za izmenu i otkazivanje ove dostave je istekao. | PASS | Srednje |
| A-114 | Kupac | cancel placene porudzbine | 409 srpski poruka (obratite se nama) | 409 ORDER_NOT_EDITABLE: Samostalna izmena je dostupna za nenaplaćene jednokratne porudžbine koje čekaju pripremu. Za plaćenu porudžbinu javite nam se radi korekcije ili povraćaja. | PASS | Srednje |
| A-115 | Kupac | GET refunds preview placene porudzbine | 200 amount>0 | 200 {"order":{"id":"ord_fPZ9jhXbGipU7L44cfgIxnvJkCjEFN55"},"amountMinor":100000,"lines":[{"lineId":"7476b389-63e9-42b2-8a6f-a54d1e9ff473","productName":"Domaće krav {"order":{"id":"ord_fPZ9jhXbGipU7L44cfgIxnvJkCjEFN55"}, | PASS | Srednje |
| A-116 | Kupac | preview refunda za nenaplacenu porudzbinu | 409 REFUND_PAYMENT_REQUIRED srpski | 409 REFUND_PAYMENT_REQUIRED: Povraćaj je dostupan samo za naplaćenu porudžbinu. | PASS | Nisko |
| A-117 | Kupac | preview bez orderId | 404/422 srpski | 404 ORDER_NOT_FOUND: Porudžbina nije pronađena. | PASS | Nisko |
| A-118 | Kupac | POST refund zahtev | 201 status requested | 201 {"id":"06af97c0-2a61-443e-9a62-1be92a234dc1","order_id":"ord_fPZ9jhXbGipU7L44cfgIxnvJkCjEFN55","customer_id":"cus_bUpVjkf6RnHxQ9Rn1ALsj5Tr5BG_b0yC","status":"re {"id":"06af97c0-2a61-443e-9a62-1be92a234dc1","order_id" | PASS | Visoko |
| A-119 | Kupac | isti refund zahtev sa istim kljucem (replay) | 201 isti zahtev, 1 red u bazi | 201 {"id":"06af97c0-2a61-443e-9a62-1be92a234dc1","order_id":"ord_fPZ9jhXbGipU7L44cfgIxnvJkCjEFN55","customer_id":"cus_bUpVjkf6RnHxQ9Rn1ALsj5Tr5BG_b0yC","status":"re same=true | PASS | Srednje |
| A-120 | Kupac | drugi refund zahtev, drugi kljuc, dok prvi ceka | 409 srpski (vec postoji zahtev) | 500 INTERNAL_ERROR: Unexpected server error. | FAIL | Srednje |
| A-121-bez reason | Kupac | POST refund bez reason | 4xx srpski | 422 VALIDATION_ERROR: reason is required. | FAIL | Nisko |
| A-121-reason 501 | Kupac | POST refund reason 501 | 4xx srpski | 422 VALIDATION_ERROR: reason must contain 1-500 characters. | FAIL | Nisko |
| A-121-bez orderId | Kupac | POST refund bez orderId | 4xx srpski | 422 VALIDATION_ERROR: orderId is required. | FAIL | Nisko |
| A-121-bez idempotencyKey | Kupac | POST refund bez idempotencyKey | 4xx srpski | 422 VALIDATION_ERROR: idempotencyKey is required. | FAIL | Nisko |
| A-121-nenaplacena | Kupac | POST refund nenaplacena | 4xx srpski | 404 ORDER_NOT_FOUND: Porudžbina nije pronađena. | PASS | Nisko |
| A-122 | Kupac | IDOR: refund zahtev za tudju placenu porudzbinu | 404 | 404 ORDER_NOT_FOUND: Porudžbina nije pronađena. | PASS | Kritično |
| A-123 | Kupac | IDOR: tudji kupac koristi isti idempotencyKey (K) kao prvi refund | 409/404 bez curenja podataka | 409 IDEMPOTENCY_CONFLICT: Ključ je već upotrebljen. {"error":{"code":"IDEMPOTENCY_CONFLICT","message":"Ključ je već upotrebljen."},"requestId":"72c3d685-8d2b-4e5f-8313-b424 | PASS | Srednje |
| A-130 | Kupac (token iz checkout-a) | POST /api/orders/convert-to-subscription token+cadence=weekly | 201 pretplata sa 2 stavke, nextDeliveryDate=dostava+7 | 201 {"subscription":{"id":"sub_9_opz8JKzc-RDsXPhM1jmS2P4dwoIX9Z","status":"active","cadence":"weekly","nextDeliveryDate":"2026-11-17","itemCount":2}} {"id":"sub_9_opz8JKzc-RDsXPhM1jmS2P4dwoIX9Z","status":"active","cadenc | PASS | Visoko |
| A-131 | Kupac | ponovna upotreba tokena (replay) | 401 'iskoriscena' srpski | 401 INVALID_TOKEN: Ponuda je iskorišćena ili je istekla. | PASS | Visoko |
| A-131b | Kupac | broj pretplata posle replay-a | 1 | [{"c":1}] | PASS | Visoko |
| A-132 | Kupac | 3 paralelna zahteva sa istim tokenom | tacno 1 pretplata (ostali 401) | 201,401,401 subs=[{"c":1}] | PASS | Visoko |
| A-133 | Kupac | istekao token (48h) | 401 srpski | 401 INVALID_TOKEN: Ponuda je iskorišćena ili je istekla. | PASS | Srednje |
| A-133b | Kupac | istek tokena = createdAt + 48h | expiresAt-now ~ 48h | 2026-11-06T14:51:01.217Z | PASS | Nisko |
| A-134-kratak token | Gost | convert kratak token | 401 srpski | 401 INVALID_TOKEN: Ponuda za redovnu dostavu nije važeća. | PASS | Nisko |
| A-134-izmisljen | Gost | convert izmisljen | 401 srpski | 401 INVALID_TOKEN: Ponuda je iskorišćena ili je istekla. | PASS | Nisko |
| A-134-201 znak | Gost | convert 201 znak | 422 srpski | 422 VALIDATION_ERROR: token must contain 1-200 characters. | FAIL | Nisko |
| A-134-bez tokena | Gost | convert bez tokena | 422 srpski | 422 VALIDATION_ERROR: token is required. | FAIL | Nisko |
| A-134-cadence daily | Gost | convert cadence daily | 422 srpski | 422 VALIDATION_ERROR: cadence must be one of: weekly, biweekly. | FAIL | Nisko |
| A-134-token broj | Gost | convert token broj | 422 srpski | 422 VALIDATION_ERROR: token is required. | FAIL | Nisko |
| A-135 | Kupac | pretvaranje OTKAZANE porudzbine u pretplatu | 409/401 (ponuda ne vazi za otkazanu porudzbinu) | 201 {"subscription":{"id":"sub_7p2iE_1ZCKnehLIsdt8ST6NdCeuhppzR","status":"active","cadence":"weekly","nextDeliveryDate":"2026-11-17","itemCount":1}} | FAIL | Srednje |
| A-136 | Kupac | convert biweekly | 201 nextDeliveryDate=dostava+14 | 201 {"subscription":{"id":"sub_cHphFEYyec0zEjFYGTNuVLSw5qwwLKYS","status":"active","cadence":"biweekly","nextDeliveryDate":"2026-11-24","itemCount":1}} {"id":"sub_cHphFEYyec0zEjFYGTNuVLSw5qwwLKYS","status":"active","cade | PASS | Srednje |
| A-137 | Gost | subscriptionOffer.savingPerDeliveryMinor za proizvode gde je cena pretplate == jednokratna | ponuda ne obecava usteu 0 RSD | {"token":"oX1dW0mteyh7v9eJsw71FQTajSBrZlPhbkRkYw19L4s","eligibleItemCount":2,"savingPerDeliveryMinor":0,"expiresAt":"2026-11-06T14:51:01.051Z"} | FAIL | Nisko |
| A-140 | Kupac | PATCH /api/account promena svih polja (Novi Sad 21000) | 200, podaci sacuvani | 200 {"customer":{"fullName":"TEST-A Novo Ime","email":"test-a-140@example.test","phone":"+381641112223","addressLine1":"Bulevar 5","addressLine2":"sprat 3","city":"{"customer":{"fullName":"TEST-A Novo Ime","email":"test- | PASS | Srednje |
| A-141-ime prazno | Kupac | PATCH /api/account ime prazno | 200 | 422 VALIDATION_ERROR: fullName must contain 1-200 characters. | FAIL | Srednje |
| A-141-ime razmaci | Kupac | PATCH /api/account ime razmaci | 422 srpski | 422 VALIDATION_ERROR: fullName must contain 1-200 characters. | FAIL | Srednje |
| A-141-ime 201 | Kupac | PATCH /api/account ime 201 | 422 srpski | 422 VALIDATION_ERROR: fullName must contain 1-200 characters. | FAIL | Srednje |
| A-141-cirilica+emoji | Kupac | PATCH /api/account cirilica+emoji | 200 | 200 {"customer":{"fullName":"Љубица Ђорђевић 🥛","email":"test-a-140@example.test","phone":"+381641112223","addressLine1":"Bulevar 5","addressLine2":"sprat 3","city | PASS | Srednje |
| A-141-telefon slova | Kupac | PATCH /api/account telefon slova | 422 srpski | 200 {"customer":{"fullName":"TEST-A Novo Ime","email":"test-a-140@example.test","phone":"abc","addressLine1":"Bulevar 5","addressLine2":"sprat 3","city":"Novi Sad", | FAIL | Srednje |
| A-141-telefon 1 cifra | Kupac | PATCH /api/account telefon 1 cifra | 422 srpski | 200 {"customer":{"fullName":"TEST-A Novo Ime","email":"test-a-140@example.test","phone":"1","addressLine1":"Bulevar 5","addressLine2":"sprat 3","city":"Novi Sad","p | FAIL | Srednje |
| A-141-telefon 201 | Kupac | PATCH /api/account telefon 201 | 422 srpski | 422 VALIDATION_ERROR: phone must contain 1-200 characters. | FAIL | Srednje |
| A-141-PTT 99999 | Kupac | PATCH /api/account PTT 99999 | 422 srpski | 422 DELIVERY_AREA_UNAVAILABLE: Adresa nije u zoni dostave. | PASS | Srednje |
| A-141-grad izvan zone | Kupac | PATCH /api/account grad izvan zone | 422 srpski | 422 DELIVERY_AREA_UNAVAILABLE: Adresa nije u zoni dostave. | PASS | Srednje |
| A-141-grad Beograd + PTT 21000 | Kupac | PATCH /api/account grad Beograd + PTT 21000 | 422 srpski | 422 DELIVERY_AREA_UNAVAILABLE: Adresa nije u zoni dostave. | PASS | Srednje |
| A-141-PTT 4 cifre | Kupac | PATCH /api/account PTT 4 cifre | 422 srpski | 422 DELIVERY_AREA_UNAVAILABLE: Adresa nije u zoni dostave. | PASS | Srednje |
| A-141-adresa prazna | Kupac | PATCH /api/account adresa prazna | 200 | 422 VALIDATION_ERROR: addressLine1 must contain 1-200 characters. | FAIL | Srednje |
| A-141-addressLine2 501 | Kupac | PATCH /api/account addressLine2 501 | 422 srpski | 422 VALIDATION_ERROR: addressLine2 must contain 1-500 characters. | FAIL | Srednje |
| A-141-napomena 501 | Kupac | PATCH /api/account napomena 501 | 422 srpski | 422 VALIDATION_ERROR: deliveryNote must contain 1-500 characters. | FAIL | Srednje |
| A-141-napomena null | Kupac | PATCH /api/account napomena null | 200 | 200 {"customer":{"fullName":"TEST-A Novo Ime","email":"test-a-140@example.test","phone":"+381641112223","addressLine1":"Bulevar 5","addressLine2":"sprat 3","city":" | PASS | Srednje |
| A-141-izmena emaila (ne sme) | Kupac | PATCH /api/account izmena emaila (ne sme) | 200 | 200 {"customer":{"fullName":"TEST-A Novo Ime","email":"test-a-140@example.test","phone":"+381641112223","addressLine1":"Bulevar 5","addressLine2":"sprat 3","city":" | PASS | Srednje |
| A-141-izmena id | Kupac | PATCH /api/account izmena id | 200 | 200 {"customer":{"fullName":"TEST-A Novo Ime","email":"test-a-140@example.test","phone":"+381641112223","addressLine1":"Bulevar 5","addressLine2":"sprat 3","city":" | PASS | Srednje |
| A-141-sms bez potvrdjenog broja | Kupac | PATCH /api/account sms bez potvrdjenog broja | 409 srpski | 409 PHONE_NOT_VERIFIED: Najpre potvrdite broj u podešavanjima prijave. | PASS | Srednje |
| A-141-city broj | Kupac | PATCH /api/account city broj | 422 srpski | 422 VALIDATION_ERROR: city is required. | FAIL | Srednje |
| A-142 | Kupac | PATCH /api/account bez Origin | 403 | 403 CSRF_REJECTED: Zahtev nije poslat sa dozvoljenog porekla. | PASS | Visoko |
| A-143 | Gost | PATCH /api/account bez sesije | 401 srpski | 401 AUTH_REQUIRED: A valid customer session is required. | FAIL | Srednje |
| A-144 | Kupac | PATCH applyToSubscriptions=true bez pretplata | 200 | 200 {"customer":{"fullName":"TEST-A Novo Ime","email":"test-a-140@example.test","phone":"+381641112223","addressLine1":"Bulevar 5","addressLine2":"sprat 3","city":" | PASS | Nisko |
| A-145 | Kupac | GET login-settings | 200 registered:true | 200 {"registered":true,"email":"test-a-140@example.test","whatsappPhone":null,"whatsappVerified":false,"notifications":false,"whatsappAvailable":true}{"registered":true,"email":"test-a-140@example.test","whatsappPhone":n | PASS | Nisko |
| A-146 | Kupac | PATCH login-settings notifications=true bez povezanog broja | 409 srpski | 409 PHONE_NOT_VERIFIED: Prvo potvrdite WhatsApp broj. | PASS | Nisko |
| A-147 | Kupac | PATCH login-settings notifications='yes' | 422 srpski | 422 VALIDATION_ERROR: Izaberite podešavanje obaveštenja. | PASS | Nisko |
| A-148-bez consent | Kupac | POST /api/account/whatsapp bez consent | 422 | 422 CONSENT_REQUIRED: Potvrdite da želite kodove za prijavu na WhatsApp. code=false | PASS | Nisko |
| A-148-consent string | Kupac | POST /api/account/whatsapp consent string | 422 | 422 CONSENT_REQUIRED: Potvrdite da želite kodove za prijavu na WhatsApp. code=false | PASS | Nisko |
| A-148-los telefon | Kupac | POST /api/account/whatsapp los telefon | 422 | 422 INVALID_PHONE: Unesite broj sa pozivnim brojem države, npr. +381601234567. code=false | PASS | Nisko |
| A-148-lokalni format bez + | Kupac | POST /api/account/whatsapp lokalni format bez + | 422 | 422 INVALID_PHONE: Unesite broj sa pozivnim brojem države, npr. +381601234567. code=false | PASS | Nisko |
| A-148-prekratak | Kupac | POST /api/account/whatsapp prekratak | 422 | 422 INVALID_PHONE: Unesite broj sa pozivnim brojem države, npr. +381601234567. code=false | PASS | Nisko |
| A-148-predugacak | Kupac | POST /api/account/whatsapp predugacak | 422 | 422 INVALID_PHONE: Unesite broj sa pozivnim brojem države, npr. +381601234567. code=false | PASS | Nisko |
| A-148-00 prefiks | Kupac | POST /api/account/whatsapp 00 prefiks | 202 | 202 {"accepted":true,"challengeId":"YvgtLqTb91SCjz1D3B7u56njXVoUGWfucjIivupA4cA","expiresAt":"2026-11-04T14:56:33.363Z","channel":"whatsapp","retryAfter":60,"localD code=true | PASS | Nisko |
| A-148-bez phone | Kupac | POST /api/account/whatsapp bez phone | 422 | 422 INVALID_PHONE: Unesite broj sa pozivnim brojem države, npr. +381601234567. code=false | PASS | Nisko |
| A-149 | Kupac | potvrda WhatsApp koda (purpose=phone) uz sesiju | 200 phoneVerified:true | 200 {"phoneVerified":true}{"phoneVerified":true} | PASS | Srednje |
| A-150 | Gost | potvrda phone koda BEZ sesije | 401 srpski (poruka o prijavi) | 401 AUTH_REQUIRED: A valid customer session is required. | FAIL | Srednje |
| A-151 | Kupac | ukljucivanje WhatsApp notifikacija posle potvrde | 200 notifications:true | 200 {"registered":true,"email":"test-a-140@example.test","whatsappPhone":"+381601234567","whatsappVerified":true,"notifications":true,"whatsappAvailable":true}{"registered":true,"email":"test-a-140@example.test","whatsap | PASS | Nisko |
| A-152 | Kupac | povezivanje broja vec povezanog sa drugim nalogom | 409 PHONE_UNAVAILABLE srpski | 409 PHONE_UNAVAILABLE: Ovaj broj nije dostupan za povezivanje. Koristite drugi broj ili kontaktirajte podršku. | PASS | Srednje |
| A-153 | Kupac | tudji kupac potvrdjuje challenge (id+kod) iz tudje sesije | 401 'Kod ne pripada ovom nalogu' | 401 INVALID_CODE: Kod ne pripada ovom nalogu. | PASS | Srednje |
| A-154 | Kupac | disconnect WhatsApp | 200 whatsappPhone null | 200 {"registered":true,"email":"test-a-140@example.test","whatsappPhone":null,"whatsappVerified":false,"notifications":false,"whatsappAvailable":true}{"registered":true,"email":"test-a-140@example.test","whatsappPhone":n | PASS | Nisko |
| A-155 | Kupac | prijava preko WhatsApp kanala (queue mode) | 202; kod stize na whatsapp (lokalno prikazan) | 202 {"accepted":true,"challengeId":"UlwV3VcEp38Zi1_dsLM1FCbBH54zdlTvtXbODId7WOY","expiresAt":"2026-11-04T14:56:59.593Z","channel":"whatsapp","retryAfter":60,"localD code=true | PASS | Nisko |
| A-160 | Gost | POST /api/contact ispravna poruka (QA okruzenje bez CONTACT_EMAIL_TO) | 200 {sent:true} ili 503 CONTACT_UNAVAILABLE srpski | 503 CONTACT_UNAVAILABLE: Slanje preko forme trenutno nije dostupno. Tvoja poruka nije poslata. | PASS | Srednje |
| A-161-ime prazno | Gost | POST /api/contact ime prazno | 422 srpski | 422 VALIDATION_ERROR: Ime treba da sadrži od 1 do 100 znakova. | PASS | Nisko |
| A-161-ime 101 | Gost | POST /api/contact ime 101 | 422 srpski | 422 VALIDATION_ERROR: Ime treba da sadrži od 1 do 100 znakova. | PASS | Nisko |
| A-161-email los | Gost | POST /api/contact email los | 422 srpski | 422 VALIDATION_ERROR: Unesi ispravnu email adresu. | PASS | Nisko |
| A-161-email sa <> | Gost | POST /api/contact email sa <> | 422 srpski | 422 VALIDATION_ERROR: Unesi ispravnu email adresu. | PASS | Nisko |
| A-161-nepoznata tema | Gost | POST /api/contact nepoznata tema | 422 srpski | 422 VALIDATION_ERROR: Izaberi temu poruke. | PASS | Nisko |
| A-161-tema prazna | Gost | POST /api/contact tema prazna | 422 srpski | 422 VALIDATION_ERROR: Tema treba da sadrži od 1 do 50 znakova. | PASS | Nisko |
| A-161-poruka < 10 | Gost | POST /api/contact poruka < 10 | 422 srpski | 422 VALIDATION_ERROR: Poruka treba da sadrži od 10 do 5000 znakova. | PASS | Nisko |
| A-161-poruka 5001 | Gost | POST /api/contact poruka 5001 | 422 srpski | 422 VALIDATION_ERROR: Poruka treba da sadrži od 10 do 5000 znakova. | PASS | Nisko |
| A-161-honeypot | Gost | POST /api/contact honeypot | 422 srpski | 422 INVALID_SUBMISSION: Poruka nije poslata. Pozovi nas ako se problem ponovi. | PASS | Nisko |
| A-161-orderNumber 81 | Gost | POST /api/contact orderNumber 81 | 422 srpski | 422 VALIDATION_ERROR: Broj porudžbine treba da sadrži od 1 do 80 znakova. | PASS | Nisko |
| A-161-ime broj | Gost | POST /api/contact ime broj | 422 srpski | 422 VALIDATION_ERROR: Popuni polje: Ime. | PASS | Nisko |
| A-161-cirilica+emoji | Gost | POST /api/contact cirilica+emoji | 200 srpski | 503 CONTACT_UNAVAILABLE: Slanje preko forme trenutno nije dostupno. Tvoja poruka nije poslata. | PASS | Nisko |
| A-161-XSS u imenu | Gost | POST /api/contact XSS u imenu | 200 srpski | 503 CONTACT_UNAVAILABLE: Slanje preko forme trenutno nije dostupno. Tvoja poruka nije poslata. | PASS | Nisko |
| A-162 | Gost | contact tudj Origin | 403 srpski | 403 INVALID_ORIGIN: Osveži stranicu i pokušaj ponovo. | PASS | Nisko |
| A-163 | Gost | contact content-type text/plain | 415 srpski | 415 INVALID_CONTENT_TYPE: Format poruke nije ispravan. | PASS | Nisko |
| A-164 | Gost | contact neispravan JSON | 400 srpski | 400 INVALID_JSON: Request body is not valid JSON. | FAIL | Nisko |
| A-165 | Gost | contact bez Origin | dozvoljeno (forma javna) | 503 CONTACT_UNAVAILABLE: Slanje preko forme trenutno nije dostupno. Tvoja poruka nije poslata. | PASS | Nisko |
| A-166 | Gost | 7 uzastopnih contact zahteva sa istog IP (limit 5/h) | BLOCKED: limit se naplacuje tek posle provere CONTACT_EMAIL_TO | 503 CONTACT_UNAVAILABLE: Slanje preko forme trenutno nije dostupno. Tvoja poruka nije poslata. | BLOCKED | Srednje |
| A-300 | Gost | UI /prijava: Napravi nalog -> pogresan kod | poruka na srpskom |  | FAIL | Srednje |
| A-301 | Gost | UI /prijava/kod: dugme 'Novi kod' odmah posle slanja | dugme je onemoguceno do isteka 60 s uz odbrojavanje | NOVI KOD ZA 60 S disabled=true | PASS | Nisko |
| A-302 | Kupac | UI: registracija kodom -> /nalog novi nalog bez porudzbina | /nalog prikazuje prazna stanja na srpskom | Preskoči na glavni sadržaj \| NAŠE MLEKO DAJE KAJMAK \| PRODAVNICA \| KAKO DOSTAVLJAMO \| NAŠE POREKLO \| ◎ \| SR \| MOJ NALOG \| Mleko i Mleko \| MOJ NALOG \| Moje dostave \| Istorija dostava \| Podešavanja \| ← Nazad u | PASS | Visoko |
| A-303 | Kupac | UI /nalog refresh zadrzava sesiju | ostaje prijavljen | ZDRAVO, KUPČE. | PASS | Srednje |
| A-304 | Kupac | UI odjava | prikazuje formu za prijavu | forma za prijavu prikazana | PASS | Visoko |
| A-310 | Gost | UI checkout dupli klik na 'Potvrdi porudzbinu' | jedan POST / jedna porudzbina | POST=1, orders=[{"c":1}] | PASS | Srednje |
| A-311 | Gost | UI: posle uspesne porudzbine refresh stranice /checkout | potvrda ostaje vidljiva / vodi na /checkout/rezultat | Posle reload-a: 'Nema stavki za plaćanje' - potvrda i broj porudžbine nestaju; URL ostaje /checkout | FAIL | Srednje |
| A-312 | Gost | UI: korpa/checkout prikazuju sledecu dostavu dok je 06.11 zakljucana | prikazan prvi slobodan termin | Korpa: 'Sledeća dostava petak, 06. novembar 2026.' (zakljucana); checkout posle unosa adrese nudi 10.11 (ispravno) - nekonzistentno | FAIL | Visoko |
| A-313 | Gost | UI: formatiranje datuma na checkout/rezultat stranicama | '10. novembar 2026.' | Prikazano 'utorak, 10. novembar 2026..' (dupla tacka) i u mejlovima | FAIL | Nisko |
| A-314 | Gost | UI: ponuda na stranici rezultata 'Neka ista porudzbina stize svake nedelje... sada nema nove naplate' pa klik na konverziju | tekst odgovara stvarnom ishodu | Konverzija kreira subscription_invoice na pun paket (npr. 4.600 RSD sa dostavom, pending gotovina) - tekst 'nema nove naplate' je obmanjujuc; ponuda pokazuje uštedu 0 RSD | FAIL | Visoko |
| A-315 | Kupac | UI /nalog: poruke gresaka pri izmeni pretplate/profila (account-view.tsx:184-190 prikazuje error.message API-ja doslovno) | srpska poruka | Kupac vidi engleske poruke (npr. 'Only a paused subscription can be resumed.', 'quantity must be a positive integer.') - potvrdjeno kroz API i kod; nije snimljeno u browseru | FAIL | Srednje |
| A-316 | Gost | UI /prijava odbrojavanje 'Novi kod za N s' i dugme onemoguceno | dugme onemoguceno do 0 | Ispravno; korisnik ne moze da ispravi pogresno unet email 60 s (dugme 'promeni podatke' je isto onemoguceno) | FAIL | Nisko |

## FAIL odeljci (grupisano po uzroku)

### F-01 Engleske/tehničke poruke vidljive kupcu — Srednje (A-002, A-054-*, A-055, A-066b, A-070, A-075-*, A-076-*, A-077, A-078, A-080, A-085-*, A-086, A-087, A-089, A-092, A-093, A-107, A-109-*, A-121-*, A-134-*, A-141-*, A-143, A-150, A-315, A-034-juce, A-049, A-004*)
- Reprodukcija: bez sesije `GET /api/account` → `AUTH_REQUIRED: "A valid customer session is required."`; istekla sesija → `"Customer session is invalid or expired."`; `PATCH /api/account/subscriptions/:id` sa pogrešnim stanjem → "Only a paused subscription can be resumed.", "A cancelled subscription is terminal and cannot be changed or resumed.", "This action requires an active subscription.", "Subscription was not found.", "Subscription item was not found.", "pauseUntil must be after the next delivery.", "Product is unavailable."; validacije: "email must contain 1-254 characters.", "Email address is invalid.", "quantity must be a positive integer.", "items must contain 1-50 items.", "action must be one of: …", "customer.fullName must contain 1-160 characters."; `DELIVERY_LOCKED`: "This delivery is past its change deadline…"; `IDEMPOTENCY_CONFLICT` na checkout-u i "Idempotency-Key is required."; `INTERNAL_ERROR`: "Unexpected server error."; PAYLOAD_TOO_LARGE/INVALID_JSON na engleskom (i na /api/contact).
- Očekivano: sve poruke na srpskom, bez imena polja/API termina. Stvarno: UI prikazuje `error.message` doslovno (app/nalog/account-view.tsx:184-190, app/prijava/code-entry.tsx:verify catch, app/lib/frontend.ts:295-305), pa kupac vidi engleski tekst.
- Kod: server/auth.ts:107,110; server/domain.ts:20,23,27,32-60,91; server/commerce.ts:48-58,132,185,186,208,454-455 (npr. 449+ blok mutateSubscription), server/time.ts:55; server/refunds.ts requiredString poruke.
- Predlog: u `requiredString/positiveInt/enumValue/emailAddress` prosleđivati srpske labele (mapa polje→naziv); prevesti sve DomainError poruke; u fetchJson mapirati `error.code` → srpska poruka sa podrazumevanom porukom za nepoznate kodove (nikad ne prikazivati `message` ako je ASCII-engleski/INTERNAL_ERROR).

### F-02 Zaključana dostava se i dalje nudi kao podrazumevani termin → kupac dobija englesku grešku 409 — Visoko (A-049, A-312)
- Reprodukcija: admin zaključa dostavu 2026-11-06 (deliveries.status=locked) dok formalni cutoff još nije prošao. `POST /api/cart` bez deliveryDate vraća `deliveryDate:"2026-11-06"`; `POST /api/checkout` bez deliveryDate → 409 DELIVERY_LOCKED (engleski). Korpa u UI prikazuje "Sledeća dostava petak, 06. novembar". `/api/delivery-options` već preskače zaključani datum (nekonzistentno).
- Kod: server/settings.ts:119-127 (getNextDeliveryWindow gleda samo cutoffForDelivery, ne deliveries.locked_at), server/commerce.ts:123 i 217.
- Predlog: u getNextDeliveryWindow preskakati datume sa deliveries.locked_at/status!='open' (isto kao delivery-options); u quoteCart pozivati assertDeliveryEditable.

### F-03 Dupli zahtev za povraćaj sa drugim ključem → 500 INTERNAL_ERROR — Visoko (A-120)
- Koraci: kupac sa plaćenom porudžbinom pošalje `POST /api/account/refunds` {orderId, reason, idempotencyKey:K1} (201), zatim isto sa K2 (npr. dupli klik posle refresh-a).
- Očekivano: 409 sa srpskom porukom ("Zahtev za povraćaj već postoji"). Stvarno: 500 "Unexpected server error." (CHECK constraint mutation_guards.allowed=1 iz mutationGuard-a nije preveden u DomainError). U bazi ostaje 1 zahtev (podaci ispravni).
- Kod: server/refunds.ts:24-25 (batch bez hvatanja greške; poređenje sa server/commerce.ts:323-327 koji hvata). Predlog: try/catch oko batch-a → ponovo proveriti postojeći otvoren zahtev i baciti DomainError("REFUND_ALREADY_REQUESTED", …, 409).

### F-04 Pretvaranje OTKAZANE porudžbine u pretplatu uspeva — Srednje (A-135)
- Koraci: gost poruči (dobije subscriptionOffer.token), otkaže porudžbinu iz naloga (PATCH action=cancel), pozove `POST /api/orders/convert-to-subscription` sa tokenom → 201, kreira aktivnu pretplatu i fakturu paketa.
- Očekivano: 409 (ponuda ne važi za otkazanu/isporučenu/zaključanu porudžbinu). Kod: server/commerce.ts:349-354 ne proverava orders.fulfillment_status, a ni datum isporuke izvorne porudžbine. Predlog: dodati `o.fulfillment_status='planned'` u upit i invalidirati token pri otkazivanju porudžbine.

### F-05 Ponuda "nema nove naplate / uštedite" obmanjuje — Visoko (A-314, A-137)
- Rezultat checkout-a prikazuje "Uključujemo 1 proizvod u nedeljni ritam… sada nema nove naplate", a konverzija pravi `subscription_invoice` na pun paket (4 isporuke + 4× dostava, npr. 4.600 RSD, status pending, gotovina) i `payment.cash_due`. `savingPerDeliveryMinor` je 0 jer je cena pretplate = jednokratna cena (kravlje/kozje).
- Predlog: prikazati stvarni iznos paketa pre potvrde; sakriti ponudu ako je ušteda 0; ispraviti tekst.

### F-06 Telefon se ne validira (checkout i profil) — Srednje (A-030-telefon slova/kratak, A-141-telefon slova/1 cifra)
- `phone:"abc"` i `"1"` prihvaćeni i sačuvani (kurir ne može da pozove kupca). Dužina: checkout max 40, profil max 200 (nekonzistentno). Kod: server/commerce.ts:197, server/profile.ts (requiredString(...,200)). Predlog: isti normalizePhone kao u server/customer-login.ts:108-123 (opseg +381…/0…), srpska poruka.

### F-07 Neusklađene poruke/stanja u izmeni porudžbine — Nisko (A-112)
- Ponovno otkazivanje već otkazane porudžbine vraća "Samostalna izmena je dostupna za nenaplaćene jednokratne porudžbine… Za plaćenu porudžbinu javite nam se…" — pogrešan razlog. Kod: server/order-detail.ts (editReason) i app/api/account/orders/[id]/route.ts. Predlog: posebna poruka "Porudžbina je već otkazana."

### F-08 Nedostaju notifikacije / sadržaj mejlova — Nisko/Srednje (A-170…)
- Zahtev za povraćaj (`POST /api/account/refunds`) ne pravi nijedan outbox događaj: ni potvrda kupcu, ni obaveštenje administratoru (refund.requested postoji samo u audit_log).
- Posle konverzije u pretplatu šalju se `subscription.activated`, ali `billing.invoice_created`, `payment.cash_due` i `email.invoice.requested` ostaju `pending` do cron-a (kupac dobija "aktivirana" bez obračuna).
- Dupla tačka: "Sledeća dostava: 10. novembar 2026.." (server/notifications.ts, formatDeliveryDate + "."), "Pauza traje do 4. februar 2027.." (i padež: "4. februara"); potvrda porudžbine prikazuje sirovi ISO "Planirana dostava: 2026-11-10." (nelokalizovano) dok ostali mejlovi koriste lokalizovan datum; jednokratna gotovinska potvrda ne kaže da se plaća pri dostavi (samo za pretplatu); mejl o otkazanoj pretplati ima dugme "Uredi pretplatu"; pozdrav je uvek "Poštovani," (fullName postoji u podacima); svaka izmena napomene šalje novi mejl "Porudžbina je ažurirana" (4 PATCH-a = 4 mejla).
- message_deliveries.body je prazan u console modu (čuva se samo subject) pa se sadržaj ne može proveriti iz baze — renderovano ručno preko server/notifications.ts (HTML je ispravno escape-ovan: XSS test prošao).

### F-09 Sitni API detalji — Nisko
- 429 RATE_LIMITED nema `Retry-After` zaglavlje (details.retryAfter postoji u telu) — A-007.
- Datum dostave bez gornje granice (deliveryDate 2030-11-05 prihvaćen, A-034-2030).
- Greška PRODUCT_UNAVAILABLE otkriva interni ID proizvoda ("Proizvod prod_jogurt_1l nije dostupan.", A-026).
- /api/auth/code i /register za `demo@example.invalid` izdaju pravi kod (lokalno); sesija ostaje read-only pa nije eksploatabilno, ali demo email ne bi trebalo da prolazi (server/customer-login.ts requestLoginCode/registerCustomer).
- Demo nalog prikazuje kozje mleko 350 RSD (demo-account.ts:48) dok je stvarna cena 300 RSD.
- Email sa cirilicom i emoji ("тест@пример.срб", "test-a-😀@…") prolazi emailAddress regex (server/domain.ts:55) i dobija kod; u produkciji bi slanje verovatno pukao.

## UX zapažanja (po uticaju)
1. Potvrda porudžbine nestaje na refresh (URL ostaje /checkout, a ne /checkout/rezultat) — kupac gubi broj porudžbine (A-311).
2. Engleske poruke u nalogu (F-01) — najvidljiviji kvalitet problem; posebno "A valid customer session is required." i poruke validacije.
3. Obmanjujuća ponuda za redovnu dostavu (F-05).
4. Korpa nudi zaključani termin (F-02).
5. Baner za kolačiće prekriva sadržaj naloga/prvu pretplatu na desktopu (screenshots/nalog-prazan.png); prvi prikaz /nalog ima velike prazne površine u full-page prikazu.
6. Dugme "Zatraži novi kod ili promeni podatke" je onemogućeno 60 s — kupac ne može da ispravi pogrešan email (A-316).
7. Mešanje obraćanja: auth/nalog koriste "Vi" (Unesite), kontakt i checkout "ti" (Unesi, Izaberi), uz "Saglasan/na".
8. Prazni nalog: "Zdravo, kupče." i prazna stanja su na srpskom i razumljiva (pozitivno); konfigurator nudi "2 L/4 L/8 L" i za proizvode koji nisu litarski (TEST-C kajmak 250 g) — proveriti u produkciji.
9. Dupla tačka u datumima ("2026..") na checkout/rezultat stranici.

## Verifikovano ispravno (kratko)
Registracija/potvrda koda (pogrešan, 5 pokušaja, istekao, ponovna upotreba, cooldown 60 s, IP limit), CSRF/Origin na svim kolačić-mutacijama, IDOR na porudžbine/pretplate/povraćaje (404), demo read-only (403 DEMO_READ_ONLY na svim mutacijama + checkout), magic link 410, server-side preračun (klijentske cene ignorisane), Idempotency replay/konflikt i 3 paralelna zahteva (1 porudžbina), promo kodovi (istek, minimum, limit, first-purchase, per-customer, fiksni popust ≤ subtotal), zona dostave/PTT, verzije pretplate (409, 3 paralelna skip_next → 1 uspeh), granica pauze (max / max+1), ponovna upotreba/istek konverzionog tokena (48 h) i 3 paralelna zahteva, optimistički updated_at na porudžbini, WhatsApp povezivanje (lokalno), duplikat broja (409), kontakt forma validacije (srpski).

## Nije pokriveno i zašto
- Minimalna porudžbina: minimumOrderMinor=0 u QA konfiguraciji; izmena podešavanja bi uticala na druge agente (NOT-TESTED).
- Rate limit kontakt forme (A-166 BLOCKED): CONTACT_EMAIL_TO nije podešen pa se limit naplaćuje tek posle provere (uvek 503 CONTACT_UNAVAILABLE) — i sama poruka znači da kontakt forma u ovom okruženju ne radi.
- Post-cutoff izmene pretplate/porudžbine: nisam mogao da pomerim sat; testirano samo za zaključanu dostavu 06.11 (A-113 i checkout A-034-juce); cutoff granica ±1 s nije testirana.
- Plaćanje karticom (nedostupno), webhook uplate (PAYMENT_MODE=disabled), izvršenje povraćaja (execute zahteva mock) i fiskalizacija — van mog obima.
- Playwright pokriven samo: /prijava, /nalog (prazno), korpa/checkout (desktop, dupli klik, refresh, back). Nisu snimljeni u browseru: izmena profila, pretplata, izmena/otkazivanje porudžbine, povraćaj, mobilni prikaz (provereno API-jem i čitanjem koda); dva taba simulirana API-jem (dve sesije/stari expectedVersion).
- Stvarno slanje mejlova/WhatsApp (EMAIL_MODE=console): sadržaj proveren renderovanjem server/notifications.ts, ne kroz dostavu.
- Loading stanja i mrežne greške (offline) nisu emulirani.
- Skripte: /private/tmp/claude-501/-Users-luka-Documents-ChatGPT-mleko-mleko-v2--claude-worktrees-saas-fiscalization-testing-b99bd3/80cef03a-d713-4019-be9b-6fdbce271876/scratchpad/agent-a/ (t1–t11, ui1–ui5, shots/).
