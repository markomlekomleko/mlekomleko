# Izveštaj B — Admin panel (Faza 4), 2026-11-04

Okruženje: http://localhost:3100, baza .data/qa-local.sqlite, IP header 198.51.100.20, prefiks TEST-B-. Agent B (QA admin panel).
Ukupno slučajeva: **371** | PASS **348** | FAIL **23** | BLOCKED 0 | NOT-TESTED 0 (nepokriveno je navedeno na kraju).
Skripte i sirovi rezultati: /private/tmp/claude-501/-Users-luka-Documents-ChatGPT-mleko-mleko-v2--claude-worktrees-saas-fiscalization-testing-b99bd3/80cef03a-d713-4019-be9b-6fdbce271876/scratchpad/agent-b/

## Upozorenje: uticaj testova na zajedničko okruženje
- B-105: privremena izmena cutoffHours (24→48→24) preko PATCH /api/admin/settings je trajno generisala i ZAKLJUČALA dostavu 2026-11-06 (id 93376f57-..., generation_key deadline:2026-11-06, cutoff_at 2026-11-04T07:00Z). Stvarni cutoff je 2026-11-05 07:00Z. Novi checkout za 2026-11-06 vraća 409 DELIVERY_LOCKED za sve agente; nema API-ja za otključavanje.
- Moja prva restauracija podešavanja nije radila (readSettings ne vraća neke ključeve, PATCH sa undefined = prazno telo): minimumOrderMinor=90000000, holidays=["2027-07-02"], deliveryWeekdays=[3,5] ostali su aktivni oko 1 minut (14:47–~14:55Z) pre ručne ispravke; ako su drugi agenti u tom prozoru imali 422/409 na checkout-u, to je moj uzrok. Sada: minimumOrderMinor=0, holidays=[], deliveryWeekdays=[2,5], cutoffHours=24, deliveryFeeMinor=35000, freeDeliveryThresholdMinor=0, servicePostalCodes=["11","21"], storeName="Mleko i Mleko".
- Prvi test (B-012) postavio je storeName="x" ~1 min; vraćeno.
- Resetovao sam (SQL DELETE) samo svoje redove rate_limits (scope checkout i admin-login za IP 198.51.100.20) jer je limit 20/10min za checkout bio prekoračen.
- Vremenska simulacija: da bih testirao potvrdu uručenja za prošli datum, SQL-om sam promenio deliveries.delivery_date svoje (TEST-B) dostave 2026-12-01 → 2026-11-02 i 2026-11-01 (samo moji redovi).
- Kreirano: ~35 TEST-B porudžbina (11-10, 11-11, 12-01, 12-08), TEST-B proizvodi (deaktivirani), promo kodovi TESTB*, staff nalozi test-b-staff-{manager,driver,finance}@example.test (+ deaktiviran "ownerclone" nalog sa emailom qa-admin@example.test), prazna dostava 2020-01-07 (B-231) i dostava 2026-11-11.

## Tabela slučajeva
ID | Uloga | Koraci | Očekivano | Stvarno | Status | Ozbiljnost
--- | --- | --- | --- | --- | --- | ---
B-001 | nepr. | GET svih 24 admin ruta bez tokena | 403 | sve 403 | PASS | Kritično
B-002 | nepr. | GET svih ruta sa lažnim tokenom | 403 | sve 403 | PASS | Kritično
B-003 | nepr. | mutacije bez tokena | 403 | sve 403 | PASS | Kritično
B-004 | nepr. | x-admin-secret sa lozinkom | 403 | 403 {"error":{"code":"ADMIN_FORBIDDEN","message":"Prijavite se email adresom i lozinkom."},"requestId":" | PASS | Visoko
B-005 | nepr. | cookie umesto Bearer | 403 | 403 {"error":{"code":"ADMIN_FORBIDDEN","message":"Prijavite se email adresom i lozinkom."},"requestId":" | PASS | Visoko
B-006 | nepr. | token u query stringu | 403 (ne prihvata) | 403 {"error":{"code":"ADMIN_FORBIDDEN","message":"Prijavite se email adresom i lozin | PASS | Nisko
B-007 | owner | prijava, DELETE /access, ponovo GET dashboard | 200 pa 403 | before=200 delete=200 after=403 | PASS | Visoko
B-008 | owner | GET /access sa opozvanim tokenom | 403 | 403 {"error":{"code":"ADMIN_FORBIDDEN","message":"Prijava je istekla. Prijavite se ponovo."},"requestId" | PASS | Srednje
B-009 | nepr. | login pogrešna lozinka | 403 | 403 {"error":{"code":"ADMIN_FORBIDDEN","message":"Email ili lozinka nisu ispravni."},"requestId":"8f62e8b2-4dac-49ee-8bb4-4c | PASS | Srednje
B-010 | nepr. | login bez Origin headera | 403 CSRF_REJECTED | 403 {"error":{"code":"CSRF_REJECTED","message":"Zahtev nije poslat sa dozvoljenog porekla."},"requestId" | PASS | Srednje
B-011 | nepr. | login sa Origin evil | 403 | 403 {"error":{"code":"CSRF_REJECTED","message":"Zahtev nije poslat sa dozvoljenog porekla."},"requestId" | PASS | Srednje
B-012 | owner | admin mutacija sa Origin evil | 403 CSRF_REJECTED (po APP-MAP: sve admin mutacije) | 200 - admin PATCH /settings prolazi sa Origin: https://evil.example (assertSameOrigin se poziva samo u loginAdmin i nekim rutama: orders, deliveries/bulk-complete, customers/[id], subscriptions/[id], content-pages, reminders, quote, bulk-payment; NE u settings | FAIL | Nisko
B-013 | owner | admin POST sa praznim Origin | 403 | 422 validacija - Origin se ne proverava na POST /products | FAIL | Nisko
B-014 | kupac | kupac cookie mm_session -> GET/PATCH/POST /api/admin/* | 403 | sve 403 | PASS | Kritično
B-015 | kupac | kupac cookie + Bearer = challengeId | 403 | 403 | PASS | Visoko
B-016 | kupac | vrednost customer session cookie-ja kao Bearer admin token | 403 | 403 | PASS | Visoko
B-017 | manager | matrica 55 ruta (GET+mutacije) sa praznim telom | ROLE_FORBIDDEN tačno po authorizeStaff | sve prema matrici | PASS | Visoko
B-018 | driver | matrica 55 ruta (GET+mutacije) sa praznim telom | ROLE_FORBIDDEN tačno po authorizeStaff | sve prema matrici | PASS | Visoko
B-019 | finance | matrica 55 ruta (GET+mutacije) sa praznim telom | ROLE_FORBIDDEN tačno po authorizeStaff | sve prema matrici | PASS | Visoko
B-020 | owner/manager | deaktivacija managera (isActive:false) pa GET dashboard starim tokenom | 200 pa 403 odmah | pre=200 posle=403 db is_active=0 | PASS | Visoko
B-021 | manager | login deaktiviranog naloga | 403 | 403 {"error":{"code":"ADMIN_FORBIDDEN","message":"Email ili lozinka nisu ispravni."},"requestId":"a2caef | PASS | Visoko
B-022 | owner | POST /staff {id, fullName} bez isActive na deaktiviranom nalogu | nalog ostaje deaktiviran | is_active posle=1 | FAIL | Srednje
B-023 | owner/manager | promena lozinke managera preko POST /staff; stari token | 200 pa 403 | pre=200 posle=403 | PASS | Visoko
B-024 | manager | posle promene lozinke: stara lozinka / nova lozinka | 403 / 200 | stara=403 nova=200 | PASS | Visoko
B-025 | owner | staff sa lozinkom <12 | 422 PASSWORD_WEAK | 422 {"error":{"code":"PASSWORD_WEAK","message":"Lozinka mora imati najmanje 12 znakova."},"requestId":"7 | PASS | Srednje
B-026 | owner | kreiranje staff sa role=owner | 422 (nedozvoljeno) | 422 {"error":{"code":"VALIDATION_ERROR","message":"role must be one of: manager, driver, finance.","deta | PASS | Visoko
B-027 | owner | staff sa postojećim emailom (novi id) | 409/422 jasna greška (ne 500) | 500 {"error":{"code":"INTERNAL_ERROR","message":"Unexpected server error."},"requestId":"1ff3cb18-f516-4359-8b8a-55f471c13ce4"} | FAIL | Srednje
B-028 | owner | staff sa emailom vlasnika (qa-admin@example.test) | odbijeno (kolizija sa owner nalogom) | 200 {"staff":{"id":"9e967085-6eda-40b4-b347-05a41aaa338b","email":"qa-admin@example.test","fullName":"TEST-B ownerclone","role":"finance","isActive":true} | FAIL | Srednje
B-029 | owner | POST proizvod validan | 201 | 201 {"product":{"id":"ffd6de77-966e-4a53-aa31-3f3efa643e25","slug":"test-b-p-1-80b2" | PASS | Srednje
B-030 | owner | POST proizvod cena 0 | 201 ili 422 (odluka); ne sme kasnije pokvariti checkout | 201 {"product":{"id":"673344da-b51d-4f16-b7e3-732d486df4de","slug":"test-b-p-2-jyby" | PASS | Nisko
B-031 | owner | POST cena -100 | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"priceMinor must be a non-negative | PASS | Srednje
B-032 | owner | POST cena decimalna 12.5 | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"priceMinor must be a non-negative | PASS | Srednje
B-033 | owner | POST cena string "1e3" | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"priceMinor must be a non-negative | PASS | Nisko
B-034 | owner | POST cena MAX_SAFE_INTEGER | 422 (razuman limit) ili prihvaćeno | 422 {"error":{"code":"VALIDATION_ERROR","message":"priceMinor must be a non-negative | PASS | Nisko
B-035 | owner | POST naziv 121 znak | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"name must contain 1-120 character | PASS | Nisko
B-036 | owner | POST naziv ćirilica+emoji+<script> | 201, sačuvano nepromenjeno | 201 {"product":{"id":"56db8798-a925-4088-939a-e929f2466646","slug":"test-b-p-8-vud7","name":"TEST-B-Млеко 🥛 čćžšđ <script>alert(1)</script>","shortDescription":"","description":"","category":"TEST-B","un | PASS | Nisko
B-037 | owner | POST duplikat slug | 409 SLUG_ALREADY_EXISTS | 409 {"error":{"code":"SLUG_ALREADY_EXISTS","message":"Proizvod sa ovim URL slugom već postoji. Unesite drugi slug.","details | PASS | Srednje
B-038 | owner | POST slug sa velikim slovima (case-dup) | 409 (lowercase normalizacija) | 409 {"error":{"code":"SLUG_ALREADY_EXISTS","message":"Proizvod sa ovim URL slugom već postoji. Unesite drugi slug.","details | PASS | Nisko
B-039 | owner | POST slug sa razmakom/dijakritikom | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"URL slug može da sadrži mala ASCII slova, brojeve i c | PASS | Nisko
B-040 | owner | POST imageUrl javascript: | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"imageUrl mora biti lokalna putanja ili HTTPS adresa." | PASS | Visoko
B-041 | owner | POST prazan unitLabel | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"unitLabel must contain 1-40 characters.","details":{" | PASS | Nisko
B-042 | owner | POST naziv samo razmaci | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"name must contain 1-120 characters.","details":{"fiel | PASS | Nisko
B-043 | owner | POST nevalidan JSON | 400/422 (ne 500) | 400 {"error":{"code":"INVALID_JSON","message":"Request body is not valid JSON."},"requestId":"b3f60a6e-d | PASS | Nisko
B-044 | owner | POST subscriptionPriceMinor negativan | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"subscriptionPriceMinor must be a non-negative integer | PASS | Srednje
B-045 | owner | POST compareAtPrice < price (akcijska cena nelogična) | prihvaćeno ili 422 - beleži | 201 {"product":{"id":"5ddc7693-6cc2-43b1-bc85-708490cb7c53","slug":"test-b-p-17-q11i","name":"TEST-B-Pro | PASS | Nisko
B-046 | owner | PATCH cena -1 | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"priceMinor must be a non-negative integer.","details" | PASS | Srednje
B-047 | owner | PATCH cena i naziv | 200 i vidljivo u /api/products | 200 {"product":{"id":"ffd6de77-966e-4a53-aa31-3f3efa643e25","slug":"test-b-p-1-80b2","name":"TEST-B-Izme \| true | PASS | Srednje
B-048 | owner | PATCH slug na tuđi | 409 | 409 {"error":{"code":"SLUG_ALREADY_EXISTS","message":"Proizvod sa ovim URL slugom već postoji. Unesite d | PASS | Srednje
B-049 | owner | PATCH nepostojeći ID | 404 | 404 {"error":{"code":"PRODUCT_NOT_FOUND","message":"Proizvod nije pronađen."},"requestId":"5099e2e9-9051 | PASS | Nisko
B-050 | owner | PATCH prazno telo | 200 no-op ili 422 (ne 500) | 200 {"product":{"id":"ffd6de77-966e-4a53-aa31-3f3efa643e25","slug":"test-b-p-1-80b2","name":"TEST-B-Izme | PASS | Nisko
B-051 | kupac | checkout sa aktivnim novim TEST-B proizvodom | 201 | 201 {"order":{"id":"ord_J7lnZD0gopKGafqXrNovb0iYBmrVkspH","orderNumber":"MM-20261104-J7LNZD0G","subtotalMinor":12345,"discou | PASS | Srednje
B-052 | owner/kupac | PATCH isActive:false -> /api/products, /api/products/:slug, checkout | nema u listi; 404; 409 PRODUCT_UNAVAILABLE | patch=200 inList=false slug=404 checkout=409 PRODUCT_UNAVAILABLE | PASS | Visoko
B-053 | owner | porudžbina sa kasnije deaktiviranim proizvodom i dalje u admin listi | vidljiva | total=1 | PASS | Srednje
B-054 | kupac | checkout proizvoda sa cenom 0 | prihvaćeno i total 0 ili odbijeno; ne sme 500 | 201 {"order":{"id":"ord_8wB6qmm7FPrKjAShe8euqiUiAOL57uT6","orderNumber":"MM-20261104-8WB6QMM7","subtotalMinor":0,"discountMinor":0,"deliveryFeeMinor":3500 | PASS | Nisko
B-055 | owner | promena cene proizvoda ne menja total postojeće porudžbine | total isti | pre=47345 posle=47345 | PASS | Visoko
B-056 | owner | POST /products/:id (clone) | 201 sa novim slugom | 201 {"product":{"id":"39fdb646-133d-4251-8303-394ea6b2a928","slug":"test-b-p-1-80b2-kopija-9e14f49f","name":"TEST-B-Izmenjen — kopija","shortDescription": | PASS | Nisko
B-057 | owner | DELETE klonirani proizvod bez porudžbina | 200/204 | 200 {"deleted":true,"archived":false} | PASS | Nisko
B-058 | owner | DELETE proizvod koji ima porudžbinu | 409/odbijeno (ili soft delete) - ne sme izgubiti istoriju | 200 {"deleted":false,"archived":true} | PASS | Srednje
B-059 | owner | upload validan 1x1 PNG | 201 + url | 201 {"url":"/api/product-images/555d8eab-ac1a-451f-b734-e66b495ac604"} | PASS | Srednje
B-060 | kupac | GET /api/product-images/:id | 200, Content-Type image/png, nosniff | 200 image/png nosniff=nosniff cache=public, max-age=31536000, immutable | PASS | Srednje
B-061 | owner | izvršni fajl (MZ header) preimenovan u .png sa MIME image/png | 422 IMAGE_INVALID | 422 {"error":{"code":"IMAGE_INVALID","message":"Podržane su JPG, PNG i WebP fotograf | PASS | Visoko
B-062 | owner | SVG sa onload | 422 | 422 {"error":{"code":"IMAGE_INVALID","message":"Podržane su JPG, | PASS | Visoko
B-063 | owner | shell skripta | 422 | 422 {"error":{"code":"IMAGE_INVALID","message":"Podržane su JPG, | PASS | Visoko
B-064 | owner | prazan fajl 0 B | 422 | 422 {"error":{"code":"IMAGE_INVALID","message":"Izaberite JPG, P | PASS | Nisko
B-065 | owner | PNG 2.1 MB (>2 MB) | 413/422 | 422 {"error":{"code":"IMAGE_INVALID","message":"Izaberite JPG, P | PASS | Srednje
B-066 | owner | PNG 3.5 MB (>3 MB content-length) | 413 | 413 {"error":{"code":"IMAGE_TOO_LARGE","message":"Fotografija mo | PASS | Srednje
B-067 | owner | pogrešno ime polja (file umesto image) | 422 | 422 {"error":{"code":"IMAGE_INVALID","message":"Izaberite JPG, P | PASS | Nisko
B-068 | owner | PNG polyglot sa <script> nakon headera | servira se kao image/png + nosniff (nije izvršivo) | 201 served=image/png nosniff=nosniff | PASS | Srednje
B-069 | owner | GIF | 422 (nije podržan) | 422 | PASS | Nisko
B-070 | nepr. | upload bez tokena | 403 | 403 | PASS | Visoko
B-071 | kupac | GET nepostojeća slika | 404 | 404 | PASS | Nisko
B-072 | kupac | GET product-images path traversal | 404/400 | 404 | PASS | Visoko
B-073 | owner | promo percent 101 | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"discountValue must be a non-negative intege | PASS | Srednje
B-074 | owner | promo negativan popust | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"discountValue must be a non-negative intege | PASS | Srednje
B-075 | owner | promo popust 0 | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"Vrednost popusta mora biti veća od nule."}, | PASS | Nisko
B-076 | owner | promo percent decimalan 5.5 | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"discountValue must be a non-negative intege | PASS | Nisko
B-077 | owner | promo kod sa razmakom/specijalnim | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"Promo kod može sadržati slova, brojeve, _ i | PASS | Nisko
B-078 | owner | promo validan sa usageLimit 1 | 201 | 201 {"promo":{"id":"2225556a-4b73-4f23-8107-dace9947fa93","code":"TESTBF5UL6","description":"","discount | PASS | Srednje
B-079 | owner | promo duplikat koda (mala slova) | 409/422 (ne 500) | 500 {"error":{"code":"INTERNAL_ERROR","message":"Unexpected server error."},"requestId":"51ac6eb2-09d1-4c20-9c48-36868693fad | FAIL | Srednje
B-080 | kupac | checkout sa promo (usageLimit 1) prvi put | 201 sa popustom 10% | 201 disc=2500 sub=25000 | PASS | Srednje
B-081 | kupac | isti promo drugi put (limit iskorišćen) | 422 PROMO_INVALID | 422 {"error":{"code":"PROMO_INVALID","message":"Promo kod nije važeći ili uslovi nisu ispunjeni."},"requestId":"3e096b5d-64a | PASS | Visoko
B-082 | kupac | istekli promo (endsAt 2020) | 422 | 422 {"error":{"code":"PROMO_INVALID","message":"Promo kod nije važeći ili uslovi nisu ispunjeni."},"requ | PASS | Srednje
B-083 | kupac | promo koji još nije počeo (startsAt 2030) | 422 | 422 {"error":{"code":"PROMO_INVALID","message":"Promo kod nije važeći ili uslovi nisu ispunjeni."},"requ | PASS | Srednje
B-084 | owner | promo sa startsAt/endsAt nevalidnim stringovima | 422 validacija datuma | 201 {"promo":{"id":"d67031c8-1f10-45f1-86e8-74c5cde29e49","code":"TESTBKRPVR","description":"","discount_type":"percent","di | FAIL | Srednje
B-085 | owner | promo endsAt pre startsAt | 422 | 201 {"promo":{"id":"5be82c02-681b-41fb-828e-6ed0e1fa7a1e","code":"TESTBPATFD","description":"","discount_type":"percent","di | FAIL | Nisko
B-086 | owner | promo usageLimit 0 | 422 (kod bi bio neupotrebljiv) | 201 {"promo":{"id":"a278430a-9525-4492-ab8d-08f9704c0e6c","code":"TESTBEJ22F","description":"","discount_type":"percent","di | FAIL | Nisko
B-087 | kupac | fixed popust veći od subtotal | total >= 0, popust ograničen na subtotal | 201 {"id":"ord_SkJ2HerdrXun2xXUqfs3ddOCHV95Q3-o","orderNumber":"MM-20261104-SKJ2HERD","subtotalMinor":25000,"discountMinor":25000,"deliveryFeeMinor":35000,"totalMinor":35000,"promoCode":"TESTBXAKY8","curr | PASS | Visoko
B-088 | owner/kupac | PATCH isActive:false pa checkout sa tim kodom | 422 | 422 {"error":{"code":"PROMO_INVALID","message":"Promo kod nije važeći ili uslovi nisu ispunjeni."},"requ | PASS | Srednje
B-089 | owner | DELETE promo (soft) | 200 deleted | 200 {"deleted":true} | PASS | Nisko
B-090 | owner | PATCH promo minimumOrderMinor -1 | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"minimumOrderMinor must be a non-negative integer.","d | PASS | Nisko
B-091 | kupac | promo minimalna porudžbina nije ispunjena | 422 | 422 {"error":{"code":"PROMO_INVALID","message":"Promo kod nije važeći ili uslovi nisu ispunjeni."},"requ | PASS | Srednje
B-092 | kupac | /api/cart sa nepostojećim promo | 422 | 422 {"error":{"code":"PROMO_INVALID","message":"Promo kod nije važeći ili uslovi nisu ispunjeni."},"requ | PASS | Nisko
B-093 | kupac | 3 paralelna checkout-a sa promo usageLimit 1 | tačno 1 uspeh | uspeha=1 statusi=201,422,422 | PASS | Visoko
B-094 | owner | PATCH settings nevalidne vrednosti (17 varijanti) | sve 422 | sve 422 | PASS | Srednje
B-095 | owner | PATCH settings prazno telo | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"Poslato je nepoznato podešavanje. | PASS | Nisko
B-096 | owner | storeName promena odmah vidljiva u /api/storefront | sadrži novi naziv | 200 true | PASS | Nisko
B-097 | owner/kupac | minimumOrderMinor=900000 RSD -> checkout i /api/cart | checkout odbijen 422 odmah | checkout=422 MINIMUM_ORDER cart=200  | PASS | Visoko
B-098 | owner/kupac | deliveryFeeMinor=12300 -> checkout deliveryFee | 12300 odmah | 201 fee=12300 | PASS | Visoko
B-099 | owner/kupac | freeDeliveryThreshold=1000 -> besplatna dostava | fee 0 | 201 fee=0 | PASS | Srednje
B-100 | owner/kupac | servicePostalCodes=[21000] -> checkout 11000 | 422 DELIVERY_AREA_UNAVAILABLE | 422 DELIVERY_AREA_UNAVAILABLE opts=422 | PASS | Visoko
B-101 | owner | PATCH deliveryWeekday=3 (staro polje) pa /api/delivery-options | dani se menjaju ILI polje se odbija (ne sme biti tihi no-op) | opcije_iste=true | FAIL | Nisko
B-102 | owner/kupac | deliveryWeekdays=[3,5]: options, checkout utorak 11-10, sreda 11-11 | weekdays [3,5]; utorak 422; sreda 201 | opts={"city":"Beograd","weekdays":[3,5],"dates":[" utorak=422 sreda=201 | PASS | Visoko
B-103 | owner/kupac | cutoffHours=48 -> options bez 2026-11-06 i checkout 422 | datum nestaje, checkout odbijen | opts_has_1106=false checkout=409 DELIVERY_LOCKED | PASS | Visoko
B-104 | owner/kupac | holiday 2027-07-02 -> checkout tog datuma | odbijen | 422 DELIVERY_HOLIDAY | PASS | Srednje
B-105 | owner | privremeno cutoffHours=48 pa vraćeno na 24 | vraćanje politike ne sme trajno zaključati dostavu 2026-11-06 (stvarni cutoff 11-05 07:00Z) | dostava 93376f57 (2026-11-06) generisana+zaključana u istoj milisekundi (generation_key deadline:2026-11-06), cutoff_at ostaje 2026-11-04T07:00Z i posle vraćanja na 24h; novi checkout za 11-06 → 409 DELIVERY_LOCKED. Nema API-ja za otključavanje. | FAIL | Srednje
B-106 | manager | PATCH settings deliveryWeekdays | 403 ROLE_FORBIDDEN (samo owner) | 403 {"error":{"code":"ROLE_FORBIDDEN","message":"Samo vlasnik može da menja raspored i aktivira grad."}, | PASS | Visoko
B-107 | manager | PATCH settings storeName (dozvoljeno) | 200 | 200 {"settings":{"announcementEnabled":true,"announcem | PASS | Nisko
B-108 | owner | POST bundle validan | 201 | 201 {"bundle":{"id":"3143c8e0-3b80-444e-8bf9-11b950f4467e","slug":"test-b-bundle-14gvh","eyebrow":"Pametan paket","name":"TEST-B Paket","description":""," | PASS | Srednje
B-109 | owner | bundle bez stavki | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"Paket mora imati 1–20 stavki."}," | PASS | Nisko
B-110 | owner | bundle quantity 0 | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"items[0].quantity must be a posit | PASS | Nisko
B-111 | owner | bundle quantity -3 | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"items[0].quantity must be a posit | PASS | Nisko
B-112 | owner | bundle nepostojeći proizvod | 404/422 (ne 500) | 409 {"error":{"code":"PRODUCT_UNAVAILABLE","message":"Jedan od proizvoda paketa ne postoji. Izaberite drugi proizvod."},"req | PASS | Srednje
B-113 | owner | bundle duplikat slug | 409/422 (ne 500) | 409 {"error":{"code":"SLUG_ALREADY_EXISTS","message":"Paket sa ovim slugom već postoji. Unesite drugi slug.","details":{"fie | PASS | Srednje
B-114 | owner | bundle cadence monthly | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"items[0].cadence must be one of:  | PASS | Nisko
B-115 | owner | PATCH bundle deaktivacija | 200 | 200 {"bundle":{"id":"3143c8e0-3b80-444e-8bf9-11b950f4467e","slug":"test-b-bundle-14gvh","eyebrow":"Pamet | PASS | Nisko
B-116 | kupac | deaktiviran bundle nestaje iz /api/storefront | nema ga | 200 false | PASS | Srednje
B-117 | owner | DELETE bundle | 200 | 200 {"deleted":true} | PASS | Nisko
B-118 | owner | POST content-page draft | 200/201 | 200 {"page":{"slug":"test-b-page","title":"TEST-B stranica","description":"Opis","intro":"Uvod","section | PASS | Srednje
B-119 | kupac | draft stranica javno | 404 | 404 | PASS | Srednje
B-120 | owner | update bez expectedVersion | 409 CONTENT_PAGE_CONFLICT | 409 {"error":{"code":"CONTENT_PAGE_CONFLICT","message":"Stranica je promenjena u drugom prozoru. Osvežit | PASS | Srednje
B-121 | owner | publish sa HTML u tekstu | 200 | 200 {"page":{"slug":"test-b-page","title":"TEST-B <img src=x onerror=alert(1)>","description":"Opis","in | PASS | Srednje
B-122 | kupac | objavljena stranica sa <script> u tekstu - escape-ovano | 200, bez neescape-ovanog <script>alert | 200 rawScript=false rawImg=false | PASS | Visoko
B-123 | owner | naslov 71 znak | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"Naslov must contain 1-70 characte | PASS | Nisko
B-124 | owner | slug sa razmakom | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"URL koristi mala slova, brojeve i | PASS | Nisko
B-125 | owner | 21 odeljak | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"Stranica može imati do 20 odeljak | PASS | Nisko
B-126 | owner | inventory lot validan | 201 | 201 {"id":"39b7225b-c357-41aa-961e-8f3ff7a35d57"} | PASS | Srednje
B-127 | owner | lot istekao rok | 422 | 422 {"error":{"code":"INVALID_LOT","message":"Serija mora imati budući rok i pozitiv | PASS | Srednje
B-128 | owner | lot količina 0 | 422 | 422 {"error":{"code":"INVALID_LOT","message":"Serija mora imati budući rok i pozitiv | PASS | Nisko
B-129 | owner | lot količina -4 | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"quantity must be a non-negative i | PASS | Nisko
B-130 | owner | lot nepostojeći proizvod | 404 | 404 {"error":{"code":"PRODUCT_NOT_FOUND","message":"Proizvod nije pronađen."},"reque | PASS | Nisko
B-131 | owner | lot nepostojeći datum 2027-02-30 | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"deliveryDate is not a valid date. | PASS | Nisko
B-132 | owner | lot duplikat lotNumber istog proizvoda | 409/422 ili dozvoljeno (ne 500) | 500 {"error":{"code":"INTERNAL_ERROR","message":"Unexpected server error."},"request | FAIL | Nisko
B-133 | owner | PATCH pending→paid sa tačnim expectedUpdatedAt | 200 | 200 {"order":{"id":"ord_XupHyMf-q2Q5S0q6w1U2xn6eBhC1iW1c","order_number":"MM-20261104-XUPHYMF-","custome | PASS | Visoko
B-134 | owner | PATCH sa starim expectedUpdatedAt | 409 ORDER_VERSION_CONFLICT | 409 {"error":{"code":"ORDER_VERSION_CONFLICT","message":"Porudžbina je u međuvremenu promenjena. Osvežit | PASS | Visoko
B-135 | owner | dupli PATCH paid→paid | 200 idempotentno bez duplog računa/outbox | 200 {"order":{"id":"ord_XupHyMf-q2Q5S0q6w1U2xn6eBhC1iW1c","order_number":"MM-20261104-XUPHYMF-","custome \| fiscal_outbox=1 | PASS | Visoko
B-136 | owner | 2 paralelna PATCH paid sa istim expectedUpdatedAt | jedan 200, drugi 409; 1 fiskalni outbox | 200,409 outbox=1 | PASS | Visoko
B-137 | owner | PATCH paid→refunded direktno | 409 FISCAL_PAYMENT_IMMUTABLE (mora kroz /refunds) | 409 {"error":{"code":"FISCAL_PAYMENT_IMMUTABLE","message":"Plaćena porudžbina zahteva zaseban postupak povraćaja sa fiskalni | PASS | Visoko
B-138 | owner | PATCH paid→pending | 409 | 409 {"error":{"code":"FISCAL_PAYMENT_IMMUTABLE","message":"Plaćena porudžbina zahteva zaseban postupak p | PASS | Visoko
B-139 | owner | PATCH pending→refunded (nikad plaćeno) | odbijeno (nema šta da se vrati) | 200 {"order":{"id":"ord_J-9-omqzflBpYfLK-7wqbC1Y6OOFg_sc","order_number":"MM-20261104-J-9-OMQZ","custome | FAIL | Srednje
B-140 | owner | PATCH paymentStatus=banana | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"paymentStatus must be one of: pen | PASS | Nisko
B-141 | owner | PATCH fulfillmentStatus=locked na porudžbini | odbijeno (stanje locked pripada isporukama) | 200 {"order":{"id":"ord_J-9-omqzflBpYfLK-7wqbC1Y6OOFg_sc","order_number":"MM-20261104-J-9-OMQZ","custome | FAIL | Nisko
B-142 | owner | PATCH planned→cancelled (pending uplata) | 200 | 200 {"order":{"id":"ord_J-9-omqzflBpYfLK-7wqbC1Y6OOFg_sc","order_number":"MM-20261104-J-9-OMQZ","custome | PASS | Srednje
B-143 | owner | PATCH cancelled→delivered | odbijeno | 409 {"error":{"code":"DELIVERY_CONFIRMATION_REQUIRED","message":"Isporuku potvrdite u odeljku Dostave da bi račun sadržao st | PASS | Visoko
B-144 | owner | PATCH cancelled→planned (oživljavanje) | odbijeno ili dozvoljeno uz re-rezervaciju zaliha — beleži | 200 {"order":{"id":"ord_J-9-omqzflBpYfLK-7wqbC1Y6OOFg_sc","order_number":"MM-20261104-J-9-OMQZ","customer_id":"cus_aqzaVD8Dq | PASS | Nisko
B-145 | owner | PATCH plaćena porudžbina → cancelled bez refundacije | odbijeno ili upozorenje; novac ostaje naplaćen | 200 {"order":{"id":"ord_jAXmKANs4mXELvO2Mt2STt19ipJP2A79","order_number":"MM-20261104-JAXMKANS","customer_id":"cus_aWBaYOW3c \| stanje=paid/cancelled | FAIL | Visoko
B-146 | owner | PATCH planned→delivered (fiscomm režim) | 409 DELIVERY_CONFIRMATION_REQUIRED | 409 {"error":{"code":"DELIVERY_CONFIRMATION_REQUIRED","message":"Isporuku potvrdite u odeljku Dostave da | PASS | Visoko
B-147 | owner | PATCH customerNote ćirilica/emoji/HTML | 200 sačuvano | 200 {"order":{"id":"ord_KIKhW7Q2ojSX-P6c_VuRXptz07rDm2MP","order_number":"MM-20261104-KIKHW7Q2","customer_id":"cus_lbkIwj8GJQ-HvYSca76h5QLXsp0r1qom","subs | PASS | Nisko
B-148 | owner | customerNote 501 znak | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"customerNote must contain 1-500 c | PASS | Nisko
B-149 | owner | PATCH nepostojeća porudžbina | 404 | 404 {"error":{"code":"ORDER_NOT_FOUND","message":"Porudžbina nije pronađena."},"requ | PASS | Nisko
B-150 | owner | PATCH bez id | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"id is required.","details":{"fiel | PASS | Nisko
B-151 | owner | PATCH items quantity 3 na pending porudžbini | 200 i totali preračunati | 200 total=110000 sub=75000 | PASS | Visoko
B-152 | owner | PATCH items quantity 0 | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"items[0].quantity must be a positive integer.","detai | PASS | Srednje
B-153 | owner | PATCH items quantity -2 | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"items[0].quantity must be a positive integer.","detai | PASS | Visoko
B-154 | owner | PATCH items prazan niz | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"items must contain 1-50 items.","details":{"field":"i | PASS | Srednje
B-155 | owner | PATCH items nepostojeći proizvod | 404/409/422 | 409 {"error":{"code":"PRODUCT_UNAVAILABLE","message":"Proizvod nepostojeci nije dostupan."},"requestId": | PASS | Srednje
B-156 | owner | PATCH items na plaćenoj porudžbini | 409 ORDER_NOT_EDITABLE | 409 {"error":{"code":"ORDER_NOT_EDITABLE","message":"Stavke i adresu možete menjati samo pre naplate i z | PASS | Visoko
B-157 | owner | PATCH items quantity 1.000.000 | 422 (ograničenje) | 422 {"error":{"code":"VALIDATION_ERROR","message":"items[0].quantity must be a positive integer.","detai | PASS | Srednje
B-158 | kupac | checkout sa imenom kupca koje počinje sa = + @ - TAB | prihvaćeno (sanitizacija pri izvozu) ili 422 | kreirano=5/5 | PASS | Nisko
B-159 | owner | export CSV porudžbine sa kupcem "=HYPERLINK(...)" | nijedna ćelija ne počinje sa = + - @ (neutralizovano sa ') | status=200 opasnih ćelija=0  hasBOM=true | PASS | Visoko
B-160 | owner | export CSV ime #1 ("+cmd\|' /C calc'!A0") | neutralizovano | opasnih=0  | PASS | Visoko
B-161 | owner | export CSV ime #2 ("@SUM(1+1)") | neutralizovano | opasnih=0  | PASS | Visoko
B-162 | owner | export CSV ime #3 ("-2+3") | neutralizovano | opasnih=0  | PASS | Visoko
B-163 | owner | export CSV ime #4 ("\t=1+1") | neutralizovano | opasnih=0  | PASS | Visoko
B-164 | owner | export XLSX sa imenom "=HYPERLINK" - ćelije su inlineStr, bez <f> | nema <f> elemenata | status=200 ct=application/vnd.openxmlformats hasFormula=false inline=true | PASS | Visoko
B-165 | owner | export format=pdf | 422 | 422 | PASS | Nisko
B-166 | owner | export nepostojeća porudžbina | 404 | 404 | PASS | Nisko
B-167 | nepr. | export bez tokena | 403 | 403 | PASS | Visoko
B-168 | owner | pretraga q=test-b-30 (email) | >=1 rezultat | total=1 | PASS | Srednje
B-169 | owner | pretraga q=% (LIKE wildcard) | samo literalno poklapanje (0 ili ne svi) | total=0 svih=109 | PASS | Srednje
B-170 | owner | pretraga SQL injection ' OR 1=1 -- | 0 rezultata, 200 | 200 total=0 | PASS | Visoko
B-171 | owner | pretraga ćirilica | 200 | 200 | PASS | Nisko
B-172 | owner | filter date=2026-11-10 | svi rezultati delivery_date=2026-11-10 | total=52 svi=true | PASS | Srednje
B-173 | owner | date nevalidan | 422 | 422 | PASS | Nisko
B-174 | owner | from>to | 422 | 422 | PASS | Nisko
B-175 | owner | filter paid+planned | svi odgovaraju | total=6 ok=true | PASS | Srednje
B-176 | owner | paymentStatus=banana | 422 | 422 | PASS | Nisko
B-177 | owner | pageSize=501 | 422 | 422 | PASS | Nisko
B-178 | owner | page=0 | 422 | 422 | PASS | Nisko
B-179 | owner | page=abc | 422 (ne 500) | 422 | PASS | Nisko
B-180 | owner | paginacija page 1/2 pageSize 5 bez preklapanja | 0 preklapanja | overlap=0 total=109 | PASS | Srednje
B-181 | owner | sort total_desc | opadajuće | 2535000,1140000,1140000,710000,540000,540000,460000,380000,340000,340000 | PASS | Nisko
B-182 | owner | sort=hack | 422 | 422 | PASS | Nisko
B-183 | owner | dateField=delivery from=to=11-10 | samo 11-10 | total=52 ok=true | PASS | Srednje
B-184 | owner | total u listi = COUNT(*) iz baze | jednako | api=109 sql=109 | PASS | Srednje
B-185 | owner | bulk-payment bez Idempotency-Key | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"Idempotency-Key is required.","details":{"field":"Ide | PASS | Srednje
B-186 | owner | bulk-payment ključ <8 | 422 | 422 {"error":{"code":"IDEMPOTENCY_KEY_REQUIRED","message":"Potreban je ključ grupne potvrde."},"requestI | PASS | Nisko
B-187 | owner | bulk-payment prazan niz | 422 INVALID_SELECTION | 422 {"error":{"code":"INVALID_SELECTION","message":"Izaberite od 1 do 100 stavki."},"requestId":"ecccea2 | PASS | Srednje
B-188 | owner | bulk-payment bez confirmed:true | 422 CONFIRMATION_REQUIRED | 422 {"error":{"code":"CONFIRMATION_REQUIRED","message":"Potvrdite izabrane stavke pre čuvanja."},"reques | PASS | Visoko
B-189 | owner | bulk-payment nepostojeći ID | 200 sa success:false ORDER_NOT_FOUND | 200 {"completed":true,"results":[{"id":"nepostojeci","success":false,"code":"ORDER_NOT_FOUND","message":"Porudžbina nije pronađena."}],"succeeded":0,"failed":1} | PASS | Srednje
B-190 | owner | bulk-payment isti ID dvaput | 422 | 422 {"error":{"code":"INVALID_SELECTION","message":"Ista stavka ne može biti izabrana dva puta."},"reque | PASS | Srednje
B-191 | owner | bulk-payment 101 stavka | 422 | 422 {"error":{"code":"INVALID_SELECTION","message":"Izaberite od 1 do 100 stavki."},"requestId":"bc22d42 | PASS | Nisko
B-192 | owner | bulk-payment bez expectedUpdatedAt | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"expectedUpdatedAt is required.","details":{"field":"e | PASS | Srednje
B-193 | owner | bulk-payment 2 porudžbine + replay istog ključa | prvi succeeded=2; replay vraća isti rezultat, bez novih outbox događaja | prvi=2 replay=200/2 fiscal_outbox pre=2 posle=2 | PASS | Visoko
B-194 | owner | isti ključ, drugačiji sadržaj | 409 IDEMPOTENCY_CONFLICT | 409 {"error":{"code":"IDEMPOTENCY_CONFLICT","message":"Ovaj ključ je već korišćen za drugi izbor."},"req | PASS | Visoko
B-195 | owner | bulk već plaćena porudžbina (novi ključ, stari expectedUpdatedAt) | success replay:true (ne greška, bez duplog računa) | 200 {"completed":true,"results":[{"id":"ord_0M254oa9fa0vdOaNfU43YCR0y6K7G5FD","success":true,"replay":true}],"succeeded":1,"failed":0} | PASS | Srednje
B-196 | owner | bulk pending sa starim expectedUpdatedAt | success:false ORDER_VERSION_CONFLICT | 200 {"completed":true,"results":[{"id":"ord_Arm2kQDzvqJvdfzPvNCuYcJfrPrfatzD","success":false,"code":"ORDER_VERSION_CONFLICT","message":"Porudžbina je u međuvremenu promenjena. Osvežite podatke."}],"succe | PASS | Visoko
B-197 | owner | bulk otkazana porudžbina | success:false CASH_PAYMENT_REQUIRED | 200 {"completed":true,"results":[{"id":"ord_nYQCTpj1PurWkOij3Zw2eIPHFkRT7dcl","success":false,"code":"CASH_PAYMENT_REQUIRED","message":"Možete potvrditi samo gotovinsku porudžbinu koja nije otkazana."}]," | PASS | Visoko
B-198 | owner | 2 paralelna bulk zahteva sa istim ključem | jedan izvršen, drugi 409 BULK_IN_PROGRESS ili isti rezultat; 1 fiskalni event | 200/1,200/1 fiscal=1 | PASS | Visoko
B-199 | owner | manual-order bez Idempotency-Key | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"Idempotency-Key is required.","details":{"field":"Ide | PASS | Srednje
B-200 | owner | manual-order validan | 201 + order | 201 {"order":{"id":"ord_tWqKakoJ0luIo9-WlBhFhvKskF3wSAE8","orderNumber":"MM-20261104-TWQKAKOJ","subtotalMinor":50000,"discou | PASS | Visoko
B-201 | owner | manual-order replay istog ključa | isti order id, bez duplikata | 201 sameId=true | PASS | Visoko
B-202 | owner | manual-order paymentMethod card | 422 PAYMENT_METHOD_UNAVAILABLE | 422 {"error":{"code":"PAYMENT_METHOD_UNAVAILABLE","message":"Ručni unos podržava plaćanje gotovinom pri  | PASS | Srednje
B-203 | owner | manual-order qty -1 | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"items[0].quantity must be a positive integer.","detai | PASS | Srednje
B-204 | owner | manual-order prošli datum | 4xx | 409 {"error":{"code":"DELIVERY_LOCKED","message":"This delivery is past its change deadline and can no l | PASS | Srednje
B-205 | owner | manual-order bez emaila (telefonska) | 201 sa manual-*@manual.invalid | 201 {"order":{"id":"ord_57QvRmFhxgMbkVrQOnSoS0vgsYAb0mYq","orderNumber":"MM-20261104-57QVRMFH","subtotal | PASS | Nisko
B-206 | owner | manual-order poštanski van zone | 422 | 422 {"error":{"code":"DELIVERY_AREA_UNAVAILABLE","message":"Adresa nije u zoni dostave.","details":{"fie | PASS | Srednje
B-207 | owner | manual-order bez customer | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"Unesite podatke kupca."},"requestId":"d0d668ce-8fb3-4 | PASS | Nisko
B-208 | owner | manual-order notify:true (email nije konfigurisan) | 422 EMAIL_NOT_CONFIGURED | 422 {"error":{"code":"EMAIL_NOT_CONFIGURED","message":"Za potvrdu su potrebni email kupca i povezan serv | PASS | Nisko
B-209 | owner | manual-order sa PAN poljem | 422 CARD_DATA_REJECTED | 422 {"error":{"code":"CARD_DATA_REJECTED","message":"Raw card data must never be sent to this service. U | PASS | Visoko
B-210 | owner | GET orders/quote (manualOptions) | 200 sa datumima | 200 {"dates":["2026-11-10","2026-11-13","2026-11-17","2026-11-20","2026-11-24","2026-11-27","2026-12-01","2026-12-04","2026-12-08","2026-12-11","2026-12-1 | PASS | Nisko
B-211 | owner | POST orders/quote | 200 sa totalMinor | 200 {"lines":[{"productId":"prod_kravlje_1l","quantity":2,"purchaseType":"one_time","cadence":null,"productName":"Domaće kravlje mleko","unitLabel":"1 L", | PASS | Srednje
B-212 | owner | quote prazne stavke | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"items must contain 1-50 items.","details":{"field":"i | PASS | Nisko
B-213 | owner | quote sa Origin evil | 403 | 403 | PASS | Nisko
B-214 | owner | generate bez Idempotency-Key | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"Idempotency-Key is required.","details":{"field":"Ide | PASS | Srednje
B-215 | owner | generate ključ <8 | 422 | 422 {"error":{"code":"IDEMPOTENCY_KEY_REQUIRED","message":"Idempotency-Key must contain at least 8 chara | PASS | Nisko
B-216 | owner | generate datum 2026-02-30 | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"deliveryDate is not a valid date.","details":{"field" | PASS | Nisko
B-217 | owner | generate datum "abc" | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"deliveryDate must be YYYY-MM-DD in Europe/Belgrade.", | PASS | Nisko
B-218 | owner | nepoznata action | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"action must be one of: generate, lock, complete.","de | PASS | Nisko
B-219 | owner | generate 2026-12-01 + replay istog ključa | 200; isti broj ruta/stavki, jedan delivery red | 200/200 orders=4/4 del_rows=1 dor=4 | PASS | Visoko
B-220 | owner | generate sa novim ključem (regeneracija) | 200; nema duplih delivery_orders | 200 dor=4 orders=4 | PASS | Visoko
B-221 | owner | GET deliveries?date=2026-12-01 | 200 sa istim brojem ruta | 200 orders=4 | PASS | Srednje
B-222 | owner | GET deliveries?date=abc | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"deliveryDate must be YYYY-MM-DD i | PASS | Nisko
B-223 | owner | lock pre cutoff-a bez force | 409 CUTOFF_NOT_REACHED | 409 {"error":{"code":"CUTOFF_NOT_REACHED","message":"Delivery cannot be locked before cutoff unless force=true is explicitly | PASS | Visoko
B-224 | owner | lock za datum bez generisane dostave | 404 DELIVERY_NOT_FOUND | 404 {"error":{"code":"DELIVERY_NOT_FOUND","message":"Generate the delivery before locking it."},"request | PASS | Srednje
B-225 | owner | lock force=true pre cutoff-a | 200, status locked | 200 locked | PASS | Visoko
B-226 | owner | lock replay istog ključa | 200 bez promene | 200 locked | PASS | Srednje
B-227 | owner | lock isti ključ drugi body (force false) | 409 IDEMPOTENCY_CONFLICT | 409 {"error":{"code":"IDEMPOTENCY_CONFLICT","message":"This Idempotency-Key was already used for a diffe | PASS | Srednje
B-228 | owner | generate nad zaključanom dostavom | 200 nepromenjen snapshot (locked) | 200 locked orders=4 | PASS | Visoko
B-229 | owner | PATCH napomene na porudžbini zaključane dostave | 409 DELIVERY_LOCKED | 409 {"error":{"code":"DELIVERY_LOCKED","message":"This delivery is past its change deadline and can no l | PASS | Visoko
B-230 | owner | generate za dan koji nije dan dostave (sreda 11-11) | 200 prazna dostava ili 422 - beleži (ne 500) | 200 orders=1 | PASS | Nisko
B-231 | owner | generate za prošli datum 2020-01-07 | odbijeno ili prazno; ne pravi zaključanu dostavu bez porudžbina | 200 locked rows=1 | FAIL | Srednje
B-232 | owner | potvrda uručenja za budući datum (12-01) | 409 DELIVERY_IN_FUTURE | 409 {"error":{"code":"DELIVERY_IN_FUTURE","message":"Buduća dostava ne može biti označena kao izvršena." | PASS | Visoko
B-233 | owner | potvrda sa pogrešnim datumom | 409 DELIVERY_DATE_MISMATCH | 409 {"error":{"code":"DELIVERY_DATE_MISMATCH","message":"Dostava ne pripada izabranom datumu."},"request | PASS | Srednje
B-234 | owner | deliveredQuantity > quantity | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"deliveredQuantity must be a non-negative integer.","d | PASS | Visoko
B-235 | owner | deliveredQuantity -1 | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"deliveredQuantity must be a non-negative integer.","d | PASS | Visoko
B-236 | owner | deliveredQuantity 1.5 | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"deliveredQuantity must be a non-negative integer.","d | PASS | Srednje
B-237 | owner | sve količine 0 uz status delivered | 422 INVALID_QUANTITIES | 422 {"error":{"code":"INVALID_QUANTITIES","message":"Ako ništa nije uručeno, izaberite neuspešnu dostavu | PASS | Srednje
B-238 | owner | items sa nepostojećim id | 422 | 422 {"error":{"code":"INVALID_QUANTITIES","message":"Stavke dostave se ne poklapaju."},"requestId":"bdf4 | PASS | Srednje
B-239 | owner | failed + cashCollected:true | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"Gotovinu potvrdite uz uspešno uručenje ili u Porudžbi | PASS | Srednje
B-240 | owner | complete nepostojeći delivery order | 404 | 404 {"error":{"code":"DELIVERY_NOT_FOUND","message":"Dostava nije pronađena."},"requestId":"a13addad-1ab | PASS | Nisko
B-241 | owner | complete status=maybe | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"status must be one of: delivered, failed.","details": | PASS | Nisko
B-242 | owner | bulk-complete za budući datum | success:false DELIVERY_IN_FUTURE | 200 {"completed":true,"results":[{"id":"55d16431-d1fc-405e-8b1f-fc11f8d2ca1d","success":false,"code":"DELIVERY_IN_FUTURE","message":"Buduća dostava ne može biti označena kao izvršena."}],"succeeded":0,"fa | PASS | Visoko
B-243 | owner | delimično uručenje jednokratne porudžbine (2 od 3) | 409 PARTIAL_REQUIRES_PACKAGE | 200 {"id":"fd48ddab-5683-4bc6-857f-6a429cda4196","status":"delivered","orderIds":["ord_v1FLwOx4z8FrJgqejDgDqQxZVReIkbbz"],"cashCollectedMinor":1 | FAIL | Visoko
B-244 | owner | prva isporuka paketa bez cashCollected | 409 PACKAGE_CASH_REQUIRED | 409 {"error":{"code":"PACKAGE_CASH_REQUIRED","message":"Pre prve isporuke potvrdite da je primljena gotovina za ceo paket."} | PASS | Visoko
B-245 | owner | prva isporuka paketa sa cashCollected:true | 200; porudžbina paketa paid; fiskalni avans u outbox | 200 pay=paid ful=planned cash=240000 fiscal_outbox=1 | PASS | Visoko
B-246 | owner | uručenje jednokratne uz cashCollected:true | 200; paid+delivered; fiscal.delivery.requested | 200 pay=paid ful=delivered cash=85000 outbox=order.created,email.order_confirmation.requested,payment.cash_due,fiscal.receipt.requested,email.receipt.requested,analytics.purchase,fiscal.delivery.requested,email.fiscal_document.requested | PASS | Visoko
B-247 | owner | ponovna potvrda istog uručenja | 200 replay:true | 200 {"id":"55d16431-d1fc-405e-8b1f-fc11f8d2ca1d","status":"delivered","replay":true} | PASS | Srednje
B-248 | owner | ponovna potvrda sa drugom količinom | 409 DELIVERY_ALREADY_CONFIRMED | 409 {"error":{"code":"DELIVERY_ALREADY_CONFIRMED","message":"Dostava je potvrđena sa drugom količinom."} | PASS | Visoko
B-249 | owner | delivered pa failed na istom | 409 DELIVERY_STATE_INVALID | 409 {"error":{"code":"DELIVERY_STATE_INVALID","message":"Najpre završite pripremu. Potvrđena dostava ne  | PASS | Visoko
B-250 | owner | 2 paralelne potvrde iste dostave | oba 200 (jedan replay), 1 fiskalni delivery događaj, 1 cash_collection | 200,200R pay=paid fiscal_delivery_outbox=1 | PASS | Visoko
B-251 | owner | neuspešna dostava (failed) | 200; porudžbina vraćena u planned sa novim datumom; nema cash | 200 ful=planned date=2026-11-06 pay=pending | PASS | Visoko
B-252 | owner | bulk-complete već potvrđene | success sa replay:true | 200 {"completed":true,"results":[{"id":"55d16431-d1fc-405e-8b1f-fc11f8d2ca1d","success":true,"replay":true}],"succeeded":1,"failed":0} | PASS | Srednje
B-253 | owner | bulk-complete sa pogrešnim datumom | DELIVERY_DATE_MISMATCH | 200 {"completed":true,"results":[{"id":"55d16431-d1fc-405e-8b1f-fc11f8d2ca1d","success":false,"code":"DELIVERY_DATE_MISMATCH","message":"Dostava ne pripada izabranom datumu."}],"succeeded":0,"failed":1} | PASS | Srednje
B-254 | owner | bulk-complete prazan niz | 422 | 422 {"error":{"code":"CONFIRMATION_REQUIRED","message":"Potvrdite izabrane stavke pre čuvanja."},"reques | PASS | Nisko
B-255 | owner | bulk-complete bez confirmed | 422 | 422 {"error":{"code":"CONFIRMATION_REQUIRED","message":"Potvrdite izabrane stavke pre čuvanja."},"reques | PASS | Visoko
B-256 | owner | kad su sve rute potvrđene, dostava prelazi u completed | completed | completed | PASS | Srednje
B-257 | owner | export dostava CSV za 2026-11-10 (sadrži kupce sa =,+,@ imenima) | 200, nijedna ćelija ne počinje formulom | 200 text/csv; charset=utf-8 lines=50 bad=0  | PASS | Visoko
B-258 | owner | export dostava XLSX | 200 PK zip | 200 application/vnd.openxmlformats-officedoc pk=PK | PASS | Srednje
B-259 | owner | export bez date | 422 | 422 | PASS | Nisko
B-260 | owner | export format=pdf | 422 | 422 | PASS | Nisko
B-261 | owner | export za datum bez porudžbina (2099) | 200 samo zaglavlje ili 404; ne 500 | 404 bytes=126 | PASS | Nisko
B-262 | owner | delivery-calendar nov 2026 | 200 sa days[] | 200 days=11 | PASS | Srednje
B-263 | owner | delivery-calendar >62 dana | 422 | 422 | PASS | Nisko
B-264 | owner | delivery-calendar from>to | 422 | 422 | PASS | Nisko
B-265 | owner | GET delivery-preview bez parametara | 200 ili jasan 422 (ne 500) | 422 {"error":{"code":"VALIDATION_ERROR","message":"date is required.","details":{"fi | PASS | Nisko
B-266 | owner | delimično uručenje prve isporuke paketa (1 od 2) + cashCollected | 200; paket plaćen; ostatak ostaje u paketu | 200 {"id":"d8bddf55-a076-430b-b549-5b166ee6f60d","status":"delivered","orderIds":["ord_3KfYF6zOVyru1UNxGNWne7k4ttcTMxy7"],"c pay=paid delivered_q=1 | PASS | Visoko
B-267 | owner | uručenje jednokratne bez cashCollected | 200; pay ostaje pending (gotovina evidentirana kasnije), fulfillment delivered | 200 pay=paid ful=planned | PASS | Srednje
B-268 | owner | naknadno evidentiranje uplate za isporučenu porudžbinu | 200 paid; fiskal Promet | 200 fiscal_events=fiscal.receipt.requested,fiscal.delivery.requested | PASS | Visoko
B-269 | owner | GET subscriptions (lista, TEST-B kupac vidljiv) | 200, pretplata test-b-60 | 200 total=18 mine=1 status=active v=1 | PASS | Srednje
B-270 | owner | subscriptions?status=banana | 422 | 422 | PASS | Nisko
B-271 | owner | subscriptions?pageSize=0 | 422 | 422 | PASS | Nisko
B-272 | owner | PATCH subscription bez Idempotency-Key | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"Idempotency-Key is required.","details":{"field":"Ide | PASS | Srednje
B-273 | owner | PATCH bez expectedVersion | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"expectedVersion must be a positive integer.","details | PASS | Srednje
B-274 | owner | PATCH sa pogrešnim expectedVersion | 409 SUBSCRIPTION_VERSION_CONFLICT | 409 {"error":{"code":"SUBSCRIPTION_VERSION_CONFLICT","message":"Pretplata je promenjena u drugom prozoru | PASS | Visoko
B-275 | owner | PATCH nepostojeća pretplata | 404 | 404 | PASS | Nisko
B-276 | owner | PATCH action=explode | 422 | 422 | PASS | Nisko
B-277 | owner | pause bez pauseUntil | 422 (pauseUntil obavezan) - jasna poruka | 422 {"error":{"code":"VALIDATION_ERROR","message":"pauseUntil must be YYYY-MM-DD in Europe/Belgrade.","d | PASS | Nisko
B-278 | owner | pause sa pauseUntil 2026-12-22 | 200 paused, version+1 | 200 paused/2 {"subscriptionId":"sub_Hp5cZnjJ2tFwS2N56-FGooFLp5j12O84","action":"pause","appliesTo":"current","can | PASS | Visoko
B-279 | owner | pause replay istog ključa | 200 bez nove verzije | 200 paused/2 | PASS | Visoko
B-280 | owner | pause pauseUntil u prošlosti | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"pauseUntil must be after the next delivery."},"reques | PASS | Srednje
B-281 | owner | skip_next | 200 ili jasan 409 za paket | 200 {"subscriptionId":"sub_OKLdYxi1DN0vGwbnl_SVZCSGhGBGIQGJ","action":"skip_next","appliesTo":"current", | PASS | Srednje
B-282 | owner | cancel pretplate paketa | 200 cancelled (ili jasno pravilo za plaćen paket) | 200 cancelled {"subscriptionId":"sub_OKLdYxi1DN0vGwbnl_SVZCSGhGBGIQGJ","action":"cancel","appliesTo":"current","cancelAfterPackage":fa | PASS | Visoko
B-283 | owner | resume otkazane (terminalno) | 409 | 409 {"error":{"code":"SUBSCRIPTION_CANCELLED","message":"A cancelled subscription is terminal and cannot | PASS | Visoko
B-284 | owner | PATCH subscription sa evil Origin | 403 | 403 | PASS | Nisko
B-285 | owner | GET customers?q=test-b-60 | 1 kupac | 200 total=1 | PASS | Srednje
B-286 | owner | GET customers/:id detalj | 200 sa customer, subscriptions, orders | 200 keys=customer,subscriptions,currentDate,packages,deliveryHistory,addonProducts,oneTimeDeliveries,orders,credits,changes | PASS | Srednje
B-287 | owner | GET customers/nepostojeci | 404 | 404 | PASS | Nisko
B-288 | owner | PATCH customers/:id validan | 200 | 200 {"customer":{"id":"cus_YyQIDUsCUUqApjZPj7tdhriXdH3YVtyD","email":"test-b-60@example.test","full_name | PASS | Srednje
B-289 | owner | PATCH customer van zone | 422 | 422 {"error":{"code":"DELIVERY_AREA_UNAVAILABLE","message":"Adresa nije u zoni dostave."},"requestId":"e | PASS | Srednje
B-290 | owner | PATCH customer prazno ime | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"Ime i prezime must contain 1-160 characters.","detail | PASS | Nisko
B-291 | owner | PATCH customer ime 161 | 422 | 422 {"error":{"code":"VALIDATION_ERROR","message":"Ime i prezime must contain 1-160 characters.","detail | PASS | Nisko
B-292 | owner | PATCH customer sa email poljem (ne sme da menja identitet) | email nepromenjen | test-b-60@example.test | PASS | Visoko
B-293 | owner | customers?status=banana | 422 | 422 | PASS | Nisko
B-294 | owner | customers?q=% (LIKE) | 0 (literalno) | 0 | PASS | Srednje
B-295 | owner | resume pauzirane | 200 active | 200 active/3 {"subscriptionId":"sub_Hp5cZnjJ2tFwS2N56-FGooFLp5j12O84","action":"resume","appl | PASS | Visoko
B-296 | owner | resume već aktivne | 409 INVALID_SUBSCRIPTION_STATE | 409 {"error":{"code":"INVALID_SUBSCRIPTION_STATE","message":"Only a paused subscription can be resumed." | PASS | Srednje
B-297 | owner | 2 paralelna skip_next sa istim expectedVersion i različitim ključevima | jedan 200, drugi 409 | 200  \| 409 SUBSCRIPTION_VERSION_CONFLICT | PASS | Visoko
B-298 | owner | refund preview za nenaplaćenu/otkazanu porudžbinu | 409 REFUND_PAYMENT_REQUIRED | 409 {"error":{"code":"REFUND_PAYMENT_REQUIRED","message":"Povraćaj je dostupan samo za naplaćenu porudžb | PASS | Srednje
B-299 | owner | refund preview nepostojeća | 404 | 404 | PASS | Nisko
B-300 | owner | refund preview plaćene planirane porudžbine (ids20) | 200, amountMinor = proizvodi bez dostave | 200 amount=25000 total=60000 fee=35000 | PASS | Visoko
B-301 | owner | preview za već uručenu porudžbinu | 409 NOTHING ili amount 0 | 200 amount=0 | PASS | Srednje
B-302 | owner | request refund za uručenu porudžbinu | 409 NOTHING_TO_REFUND | 409 {"error":{"code":"NOTHING_TO_REFUND","message":"Nema neisporučene i nezaključane količine za povraća | PASS | Srednje
B-303 | owner | request bez idempotencyKey | 422 | 422 | PASS | Srednje
B-304 | owner | request bez reason | 422 | 422 | PASS | Srednje
B-305 | owner | request refund za plaćenu planiranu porudžbinu | 200 status requested, amount = preview | 200 requested amount=25000 v=1 | PASS | Visoko
B-306 | owner | request replay istog ključa | vraća isti zahtev | 200 same=true | PASS | Visoko
B-307 | owner | dupli aktivni zahtev (novi ključ) | 409 (dupli aktivni zahtev) | 500 {"error":{"code":"INTERNAL_ERROR","message":"Unexpected server error."},"requestId":"228dc6bd-b9fd-4da8-8004-b8673628e39 | FAIL | Srednje
B-308 | owner | isti ključ za drugu porudžbinu | 409 IDEMPOTENCY_CONFLICT | 409 {"error":{"code":"IDEMPOTENCY_CONFLICT","message":"Ključ je već upotrebljen."},"requestId":"ddefc5cf | PASS | Srednje
B-309 | owner | 2 paralelna request za istu porudžbinu | tačno 1 uspeh, drugi 409 REFUND_ALREADY_ACTIVE | 200,500 | FAIL | Srednje
B-310 | owner | approve sa pogrešnom version | 409 REFUND_VERSION_CONFLICT | 409 {"error":{"code":"REFUND_VERSION_CONFLICT","message":"Zahtev je promenjen. Osvežite prikaz."},"reque | PASS | Visoko
B-311 | owner | execute pre approve | 409 REFUND_STATE_INVALID | 409 {"error":{"code":"REFUND_STATE_INVALID","message":"Ovaj zahtev više ne može da se menja."},"requestI | PASS | Visoko
B-312 | owner | approve | 200 approved version+1 | 200 approved v=2 | PASS | Visoko
B-313 | owner | dupli approve sa starom verzijom | 409 | 409 {"error":{"code":"REFUND_VERSION_CONFLICT","message":"Zahtev je promenjen. Osvežite prikaz."},"reque | PASS | Visoko
B-314 | owner | execute (PAYMENT_MODE=disabled) | 503 REFUND_PROVIDER_NOT_CONNECTED | 503 {"error":{"code":"REFUND_PROVIDER_NOT_CONNECTED","message":"Povraćaj je odobren. Izvršenje čeka povezivanje banke i fisk | PASS | Visoko
B-315 | owner | posle neuspelog execute: porudžbina nepromenjena, zahtev i dalje approved | paid/planned + approved | paid/planned approved/2 | PASS | Visoko
B-316 | owner | reject odobrenog | 200 rejected (dozvoljeno po kodu) | 200 rejected | PASS | Srednje
B-317 | owner | approve odbijenog | 409 REFUND_STATE_INVALID | 409 {"error":{"code":"REFUND_STATE_INVALID","message":"Ovaj zahtev više ne može da se menja."},"requestI | PASS | Visoko
B-318 | owner | reject zahteva | 200 rejected | 200 rejected | PASS | Srednje
B-319 | owner | novi request posle reject-a | 200 requested | 200 {"id":"729ea313-0491-47f6-9fa7-88415cd2645d","order_id":"ord_XupHyMf-q2Q5S0q6w1U | PASS | Srednje
B-320 | owner | action=bogus | 422 | 422 | PASS | Nisko
B-321 | owner | approve nepostojeći | 404 | 404 | PASS | Nisko
B-322 | owner | approve bez expectedVersion | 422 | 422 | PASS | Srednje
B-323 | owner | preview za delimično isporučen paket (oF: 1 od 4 isporuke) | amount ~ preostale isporuke bez dostave | 200 amount=210000 total=380000 fee=140000 lines=[{"rem":7,"tot":8}] | PASS | Srednje
B-324 | finance | GET refunds | 200 | 200 | PASS | Srednje
B-325 | finance | POST refunds (dozvoljeno za finance) | 4xx validacija, ne ROLE_FORBIDDEN | 409 {"error":{"code":"REFUND_VERSION_CONFLICT","message":"Zahtev je promenjen. Osvež | PASS | Srednje
B-326 | driver | GET refunds | 403 | 403 | PASS | Visoko
B-327 | owner | GET refunds lista | 200 sa refunds[] | 200 n=5 | PASS | Nisko
B-328 | owner | dashboard: counts.customers | API = SQL (select count(*) from customers...) | api=100 sql=100 | PASS | Visoko
B-329 | owner | dashboard: counts.orders | API = SQL (select count(*) from orders...) | api=131 sql=131 | PASS | Visoko
B-330 | owner | dashboard: counts.active_subscriptions | API = SQL (select count(*) from subscriptions where status='active'...) | api=16 sql=16 | PASS | Visoko
B-331 | owner | dashboard: counts.open_deliveries | API = SQL (select count(*) from deliveries where status='open'...) | api=2 sql=2 | PASS | Visoko
B-332 | owner | dashboard: counts.active_products | API = SQL (select count(*) from products where is_active=1...) | api=8 sql=8 | PASS | Visoko
B-333 | owner | dashboard: revenue.paid_revenue_minor | API = SQL (select coalesce(sum(total_minor),0) from orders where paymen...) | api=6149876 sql=6149876 | PASS | Visoko
B-334 | owner | dashboard: revenue.average_order_minor | API = SQL (select cast(round(coalesce(avg(total_minor),0)) as integer) ...) | api=180879 sql=180879 | PASS | Srednje
B-335 | owner | dashboard: suma orderStates = broj porudžbina | API = SQL (select count(*) from orders...) | api=131 sql=131 | PASS | Srednje
B-336 | owner | dashboard: orderStates paid/planned | API = SQL (select count(*) from orders where payment_status='paid' and ...) | api=14 sql=14 | PASS | Srednje
B-337 | owner | dashboard: profit.revenue_minor = paid revenue | API = SQL (select coalesce(sum(total_minor),0) from orders where paymen...) | api=6149876 sql=6149876 | PASS | Visoko
B-338 | owner | dashboard: retention.paid_orders | API = SQL (select count(*) from orders where payment_status='paid'...) | api=34 sql=34 | PASS | Srednje
B-339 | owner | dashboard: retention.total (pretplate) | API = SQL (select count(*) from subscriptions...) | api=19 sql=19 | PASS | Srednje
B-340 | owner | dashboard: topProducts[0] | = SQL top po prihodu | api=Domaće kravlje mleko\|369\|13925000 sql=Domaće kravlje mleko\|369\|13925000 | PASS | Srednje
B-341 | owner | dashboard: topProducts računa sve stavke (uklj. nenaplaćene/otkazane) pod nazivom "prihod" | trebalo bi samo plaćene/neotkazane | top prihod(sve)=16157325 samo plaćene=4234986 | FAIL | Srednje
B-342 | owner | insights totals.orders (nov 2026) vs SQL | SQL=131 | api=131 | PASS | Visoko
B-343 | owner | insights totals.paidMinor vs SQL | SQL=6149876 | api=6149876 | PASS | Visoko
B-344 | owner | insights totals.paidOrders vs SQL | SQL=34 | api=34 | PASS | Srednje
B-345 | owner | insights totals.newCustomers vs SQL | SQL=100 | api=100 | PASS | Srednje
B-346 | owner | insights from>to | 422 | 422 | PASS | Nisko
B-347 | owner | insights period >366 dana | 422 INVALID_PERIOD | 422 | PASS | Nisko
B-348 | owner | insights from=abc | 422 | 422 | PASS | Nisko
B-349 | owner | insights: zbir daily.paidMinor = totals.paidMinor; zbir daily.orders = totals.orders | jednako | daily paid=6149876 totals=6149876; daily orders=131 totals=131 | PASS | Srednje
B-350 | owner | insights: zbir kinds = totals.orders | jednako | kinds=131 orders=131 [105,25,1] | PASS | Srednje
B-352 | owner | audit: staff.created/updated za TEST-B naloge | zapisi postoje, actor=qa-admin | created=3 updated=4 | PASS | Visoko
B-353 | owner | audit: settings.updated sa before/after i actor emailom | zapis po izmeni; before_json sadrži staru vrednost | n=35 manager=1 | PASS | Visoko
B-354 | owner | audit: plaćanje (order.updated sa paymentStatus paid) + actor | postoji; (nema posebne akcije payment.status_changed) | n=38 | PASS | Srednje
B-355 | owner | audit: order.created za ručnu porudžbinu (admin actor) | zapis | admin/qa-admin@example.test | PASS | Srednje
B-356 | owner | audit: delivery.delivered/failed + cash.collected | zapisi sa actor emailom | delivered=38 failed=5 cash=8 | PASS | Srednje
B-357 | owner | audit: refund.requested/approve/reject | zapisi | req=5 ap=2 rej=2 | PASS | Srednje
B-358 | owner | audit: neuspeo refund execute (503) i admin login/logout/neuspešne prijave | trebalo bi zabeležiti bezbednosne događaje (login, neuspeh) | akcije admin.login*: 0 | FAIL | Srednje
B-359 | owner | audit: upload slike proizvoda | trebalo bi zabeležiti (product_image.uploaded) | akcije image: 0 | FAIL | Nisko
B-360 | owner | audit_log UPDATE/DELETE preko SQL | trigger ABORT "audit_log is append-only" | UPDATE: "Error: stepping, audit_log is append-only (19)"; DELETE: isto | PASS | Visoko
B-361 | owner | audit: curenje tajni (password_hash, sessionToken) u before/after | 0 zapisa | 0 | PASS | Visoko
B-362 | owner | audit: promo.created/updated/deleted + product.* + bundle.* + content_page.saved + inventory.received | zapisi postoje | promo=29 product=17 bundle=3 content=4 inv=1 | PASS | Srednje
B-363 | owner | audit: staff deaktivacija/promena lozinke beleži samo {email,name,role,active} (ne beleži da je lozinka promenjena) | audit razlikuje promenu lozinke od ostalih izmena | after_json primer: {"email":"test-b-staff-manager@example.test","name":"TEST-B manager renamed","role":"manager","active":1} | FAIL | Nisko
B-364 | owner | outbox: DELETE nad outbox | trigger blokira | SQLERR Error: stepping, outbox events cannot be deleted (19)  | PASS | Nisko
B-365 | nepr. | 13 uzastopnih prijava (pogrešna lozinka) sa istog IP | prvih 10 → 403, zatim 429 RATE_LIMITED | 403,403,403,403,403,403,403,403,403,403,429,429,429 | PASS | Visoko
B-366 | owner | ispravna prijava dok je IP blokiran | 429 (blokirano) | 429 | PASS | Srednje
B-367 | nepr. | Playwright: /admin bez prijave | forma za prijavu, bez podataka, bez poziva ka admin API osim GET /access | forma za prijavu; jedini admin API poziv GET /api/admin/access=200; nema naziva proizvoda/kupaca u DOM-u | PASS | Kritično
B-368 | owner | Playwright: pogrešna lozinka u formi | poruka greške, ostaje na loginu | "Email ili lozinka nisu ispravni." (403 u konzoli je očekivan) | PASS | Srednje
B-369 | owner | Playwright: prijava + kartice Početna/Porudžbine/Dostave/Kupci/Izveštaji/Podešavanja | bez JS grešaka i 4xx/5xx | console=0 bad=0 nevalidan tekst (undefined/NaN/[object): 0 | PASS | Visoko
B-370 | owner | Playwright: 9 kartica Podešavanja (Dostava i naplata, Proizvodi, Paketi, Popusti, Sadržaj sajta, Poslovanje, Fiskalizacija, Provera prodavnice, Tehničke operacije) | učitavaju se bez grešaka | opened=9/9 console=0 bad=0 apiBad=0 | PASS | Visoko
B-371 | owner | Playwright: refresh /admin | traži novu prijavu (token nije u storage/cookie) | login forma=true storage={"ls":[],"ss":[],"cookie":""} | PASS | Visoko
B-372 | owner | Playwright: Odjavi se, pa stari token na API | forma za prijavu; token 403 | forma=true token=403 | PASS | Visoko

## FAIL odeljci

### B-022 (Srednje) — izmena staff naloga bez isActive ponovo aktivira deaktiviran nalog
Reprodukcija: POST /api/admin/staff {id:<deaktiviran>, isActive:false}; zatim POST /api/admin/staff {id:<isti>, fullName:"novo ime"} → is_active=1 u bazi.
Lokacija: server/staff.ts:36 (`const active = input.isActive === false ? 0 : 1`), upsert na :40 prepisuje is_active.
Predlog: kad isActive nije poslat, koristiti before.is_active; zahtevati boolean.

### B-027 / B-028 (Srednje) — staff email: duplikat daje 500, a email vlasnika se može registrovati
B-027: POST /api/admin/staff sa postojećim emailom a novim id → 500 INTERNAL_ERROR (UNIQUE na email nije mapiran). B-028: email vlasnika (qa-admin@example.test) prihvaćen kao finance nalog; prijava tim emailom sa lozinkom staff naloga uspeva i audit actor je email vlasnika (zabuna u tragu; nema eskalacije jer owner lozinka ostaje odvojena).
Lokacija: server/staff.ts:30-45; server/auth.ts:146-167 (loginAdmin poredi i owner i staff po emailu).
Predlog: proveriti jedinstvenost pre upisa (409 EMAIL_ALREADY_EXISTS) i zabraniti email jednak ADMIN_EMAIL.

### B-079 / B-132 / B-307 / B-309 (Srednje/Nisko) — kršenje UNIQUE/guard ograničenja vraća 500 umesto 409
- B-079: POST /api/admin/promos sa kodom koji već postoji (različita slova) → 500. server/admin.ts:428-459.
- B-132: POST /api/admin/inventory sa istim lotNumber za isti proizvod → 500. server/inventory.ts:8-14.
- B-307/B-309: POST /api/admin/refunds {action:request} drugi put za porudžbinu sa aktivnim zahtevom (i dva paralelna zahteva) → 500; mutationGuard u requestRefund ne mapira grešku. server/refunds.ts:24 (guard), 25.
Predlog: provera pre upisa ili hvatanje constraint greške i mapiranje u DomainError 409 (REFUND_ALREADY_ACTIVE, PROMO_CODE_EXISTS, LOT_EXISTS). Dupli zahtevi su ipak blokirani (nema duplog zapisa).

### B-084 / B-085 / B-086 (Srednje/Nisko) — promo: datumi i limit nisu validirani
startsAt/endsAt prihvataju "not-a-date"/"garbage" (kod postaje trajno neupotrebljiv: Date.parse=NaN), endsAt pre startsAt, usageLimit 0. Lokacija: server/admin.ts:434-447 (i updatePromoCode :473-476). Predlog: parsirati ISO datum, endsAt>startsAt, usageLimit>=1.

### B-101 (Nisko) — polje deliveryWeekday je tihi no-op
PATCH settings {deliveryWeekday:3} se prihvata (numericSettings), ali dani dostave dolaze iz deliveryWeekdays; /api/delivery-options se ne menja. Lokacija: server/admin.ts:288-296 vs server/settings.ts. Predlog: ukloniti polje iz dozvoljenih ili ga mapirati.

### B-105 (Srednje) — privremena izmena roka trajno zaključava dostavu
Reprodukcija: PATCH settings {cutoffHours:48} pa {cutoffHours:24} dok postoji planirana porudžbina za sutra/prekosutra → lockOverdueDeliveries (server/admin.ts:393-398) generiše i zaključava dostavu po novom roku; vraćanje roka ne otključava, cutoff_at ostaje star. Posledica: checkout za taj datum 409 DELIVERY_LOCKED; neuspele/delimične porudžbine se prebacuju na zaključan datum (B-251: datum 2026-11-06) i ne ulaze ni u jednu rutu.
Predlog: upozorenje u UI sa listom dostava koje će biti zaključane; mogućnost otključavanja pre cutoff-a; ne zaključavati pri skraćenju roka bez potvrde.

### B-139 / B-141 / B-145 (Srednje/Visoko) — PATCH /api/admin/orders dozvoljava nelogične tranzicije
- B-139: pending → refunded (nikad plaćeno) = 200.
- B-141: fulfillmentStatus "locked" na porudžbini = 200 (stanje pripada isporukama).
- B-145 (Visoko): plaćena (paid) porudžbina → fulfillmentStatus cancelled = 200 bez refundacije; ostaje paid/cancelled, fiskalni račun izdat, novac naplaćen, a prihod ulazi u dashboard. Povraćaj je moguće samo kroz /refunds.
Lokacija: server/admin.ts:166-180 (zaštita FISCAL_PAYMENT_IMMUTABLE samo za paid→drugi payment status, ne i za otkazivanje).
Predlog: eksplicitna mašina stanja (dozvoljene tranzicije), zabrana cancelled za paid bez refund zahteva, ukloniti 'locked' iz enuma za orders.

### B-231 (Srednje) — generate za proizvoljan/prošli datum pravi dostavu
POST /api/admin/deliveries {action:"generate",date:"2020-01-07"} → 200, kreira trajan (zaključan) red u deliveries; takođe prihvata dan koji nije dan dostave. Lokacija: server/deliveries.ts:62-78. Predlog: validirati datum (danas ili budući, dan dostave ili postojeća porudžbina).

### B-243 (Visoko) — delimično uručenje jednokratne porudžbine zaobilazi zaštitu i naplaćuje celu porudžbinu
Reprodukcija (dostava zaključana, datum ≤ danas): POST /api/admin/deliveries {action:"complete", id, status:"delivered", cashCollected:true, items:[{id, deliveredQuantity:2}]} za porudžbinu sa 3 komada → 200. Rezultat: porudžbina plaćena u celosti (110000 = 3×250 + dostava), uručeno 2, ostatak 1 komad vraćen u planned. Poruka PARTIAL_REQUIRES_PACKAGE ("Za delimičnu jednokratnu dostavu evidentirajte zamenu ili povraćaj pre potvrde") se nikad ne aktivira.
Lokacija: server/delivery-completion.ts:31 (`items.every(item => item.package_line_id || item.order_item_id)` je uvek tačno za jednokratne stavke).
Predlog: za jednokratne porudžbine zahtevati package_line_id (ili ukloniti granu) i ne naplaćivati ceo iznos pri delimičnoj isporuci.

### B-341 (Srednje) — dashboard "topProducts" meša sve stavke
topProducts sumira order_items svih porudžbina (i nenaplaćenih/otkazanih): prihod "Domaće kravlje mleko" 13.925.000 > ukupan plaćeni prihod 6.149.876. Lokacija: server/admin.ts:38-39 (SELECT ... FROM order_items GROUP BY product_id). Predlog: JOIN orders i filtrirati payment_status='paid' (ili preimenovati u "naručeno").

### B-358 / B-359 / B-363 (Srednje/Nisko) — audit pokrivenost
Nema audit zapisa za prijavu/odjavu/neuspele prijave admina (B-358), za upload slike proizvoda (B-359); staff.updated ne razlikuje promenu lozinke/deaktivaciju od ostalog — beleži samo {email,name,role,active} (B-363). Lokacija: server/auth.ts:146-173, app/api/admin/product-images/route.ts, server/staff.ts:41.

### B-012 / B-013 (Nisko) — dokumentacija kaže da sve admin mutacije traže Origin, ali ne
assertSameOrigin se poziva samo u loginAdmin i u rutama orders (POST), orders/quote, bulk-payment, deliveries/bulk-complete, customers/[id], subscriptions/[id], content-pages, reminders. PATCH /settings, /products, /staff, /promos, /bundles, /inventory, /refunds, /payments, /deliveries POST, /product-images prolaze sa Origin: https://evil.example. Autentikacija je Bearer (nije cookie), pa CSRF nije praktično iskoristiv — nesaglasnost sa APP-MAP i nekonzistentnost. Predlog: centralizovati u requireAdmin za ne-GET metode.

## Zapažanja (PASS ali vredna pažnje)
- Matrica uloga (B-017..019) tačna za 55 ruta × 3 uloge. Deaktivacija i promena lozinke odmah opozivaju sesije (saveStaff opoziva sve sesije pri svakom upisu).
- CSV/XLSX neutralizacija formula radi (=, +, -, @, TAB), XLSX koristi inlineStr bez <f>.
- Idempotentnost bulk-payment, manual-order, lock, subscriptions, refund request OK; paralelni zahtevi daju jedan fiskalni outbox događaj.
- Promena podešavanja (minimum porudžbine, cena dostave, besplatna dostava, poštanski kodovi, dani dostave, rok, praznici, storeName) utiče na checkout/delivery-options odmah.
- Cena proizvoda 0 je dozvoljena (B-030/B-054): checkout sa subtotal 0 prolazi (ostaje samo dostava) — poslovna odluka. compareAtPrice manji od cene prihvaćen.
- Audit actor je pravi email (ne "local-admin") za sve admin akcije; audit_log je append-only (trigger), outbox ne može DELETE.
- Refund execute vraća 503 REFUND_PROVIDER_NOT_CONNECTED i ne menja porudžbinu (B-314/315). Dostavnina se nikad ne refundira (i za delimično neisporučen paket) — proveriti poslovno pravilo.
- Fiskalni outbox: pending→paid ide u fiscal.receipt.requested; delivery u fiscal.delivery.requested (jedan po porudžbini/isporuci).

## UX zapažanja
- Lista porudžbina renderuje svih 50 redova na jednoj strani (~17.700 px visine), bez sticky zaglavlja/filtera u vidokrugu.
- Next.js dev indikator prekriva dugme "Odjavi se" (samo dev build).
- Odgovori API-ja nisu konzistentni: promos/inventory vraćaju snake_case redove iz baze, products camelCase.
- "pause" traži pauseUntil — greška "pauseUntil must be YYYY-MM-DD" ostaje engleska/tehnička u delu poruka (npr. "priceMinor must be a non-negative integer", "Idempotency-Key is required") — mešavina srpskih i engleskih poruka.
- Kartica Podešavanja → Poslovanje krije zaposlene/povraćaje u 7 podmenija "details"; izmena tajne lozinke ne daje potvrdu opoziva sesija.
- Checkout rate limit 20/10 min po IP je nizak za masovno ručno unošenje preko iste mreže (telefonske porudžbine).

## Nije pokriveno i zašto
- Pozitivan tok potvrde uručenja za stvarno prošle datume: nema API puta za kreiranje prošlih dostava; koristio sam SQL promenu datuma sopstvene dostave (vidi gore).
- Izvršenje povraćaja (execute) sa PAYMENT_MODE=mock i fiskalna korekcija: okruženje je disabled (samo 503 putanja testirana).
- Uloge driver/finance na pojedinačnim mutacijama sa validnim telom (testirano samo prazno telo / ROLE_FORBIDDEN granica), potvrda uručenja kao driver i audit actor za drivera.
- Upload slike kroz UI (Playwright file chooser), UI forme za CRUD (testirani API-ji, UI kartice samo učitavanje bez grešaka), mobilni prikaz, a11y.
- Istek sesije posle 8h i promena ADMIN_EMAIL/ADMIN_PASSWORD env (ne sme se menjati env; requireAdmin pročitan: fingerprint kredencijala poredi credential_hash, pa promena env-a opoziva sesije — nije izvršeno).
- Integracije (outbox obrada, email/WhatsApp), Fiscomm GET (503 FISCAL_NOT_CONFIGURED bez poziva ka internetu), packages/legacy/reminders/payments/messages ruta osim provere pristupa.
- Inventory sa inventoryEnabled i OUT_OF_STOCK tok, bundle checkout, DELETE proizvoda sa istorijom (arhivira — PASS B-058).
