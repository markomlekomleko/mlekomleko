# Izveštaj Agent D — bezbednosno testiranje (Faza 6), 2026-11-04

Okruženje: `http://localhost:3100` (next dev 16.3.4, sluša samo na `[::1]`), baza `.data/qa-local.sqlite`, `.env.local` iz worktree-a. IP header `cf-connecting-ip: 198.51.100.40`; za rate-limit testove .41–.49. Podaci imaju prefiks `TEST-D-` / `test-d-<n>@example.test`. Kod aplikacije nije menjan. Skripte: scratchpad `agent-d/` (`h.py`, `idor.py`, `sqli.py`, `xss.py`, `csv.py`, `csrf.py`, `mass.py`, `staff.py`, `auth.py`, `rl.py`, `leak.py`, `biz.py`, `biz2.py`, `wh.py`, `demo.py`, `svix-test.cjs`).

U curl primerima `$ADMIN` je Bearer token iz `POST /api/admin/access`, a `$COOKIE_A` je `mm_session` kupca A. Vrednosti tokena nisu u izveštaju.

## Rezime
Ukupno 84 slučaja: PASS 63, FAIL 19, NOT-TESTED 2, BLOCKED 0. FAIL po ozbiljnosti: Kritično 0, Visoko 1, Srednje 5, Nisko 13.

| FAIL | Ozbiljnost | Kratko |
| --- | --- | --- |
| D-047 | Visoko | Klijent zaobilazi IP rate limit tako što sam pošalje `cf-connecting-ip` |
| D-036 | Srednje | Neposoljen SHA-256 od `[email, lozinka]` za owner-a u `admin_sessions.credential_hash` |
| D-063 | Srednje | Gost checkout sa tuđim email-om kači porudžbinu na postojeći nalog žrtve |
| D-041 | Srednje | Provera hostname-a u `localAuth()` ne štiti; kod se vraća i uz lažni `Host` |
| D-057 | Srednje | CSP `script-src 'unsafe-inline'`; CSP i HSTS samo u produkciji |
| D-054 | Srednje | Limit tela od 64 KB se zaobilazi chunked prenosom |
| D-055 | Nisko | Duboko ugnežđen JSON daje 500 `RangeError` |
| D-049 | Nisko | 429 bez `Retry-After` headera |
| D-051 | Nisko | Nema rate limita na `/api/cart`, `/api/cart/recovery`, convert-to-subscription |
| D-024 | Nisko | Admin mutacije bez `Origin` provere (suprotno APP-MAP) |
| D-071 | Nisko | 500 umesto 4xx (upload bez multipart-a, dupli staff email, dupli promo kod) |
| D-066 | Nisko | Sirov conversion token u outbox-u i u `idempotency_keys` |
| D-067 | Nisko | Globalni Idempotency-Key: replay vraća tuđi odgovor, ključ se vidi u admin API-ju i audit-u |
| D-058 | Nisko | `X-Powered-By: Next.js` |
| D-073 | Nisko | Payment webhook dozvoljava vraćanje statusa unazad (paid → failed/refunded) |
| D-075 | Nisko | Truthy placeholderi u `.env.example` |
| D-076 | Nisko | CMS audit sa fiksnim actor-om `admin-session` |
| D-077 | Nisko | Registracija demo email-a daje sesiju od 30 dana |
| D-078 | Nisko | Query string u logu se ne rediguje |

## Tabela slučajeva

| ID | Uloga | Koraci | Očekivano | Stvarno | Status | Ozbiljnost |
| --- | --- | --- | --- | --- | --- | --- |
| D-001 | pregled koda | grep template literala u SQL (`server`, `app`, `db`, `integrations`) | bez korisničkog unosa u SQL stringu | Sve interpolacije su `?` placeholderi, allowlist kolone, enum za `orderBy`, env schema (`db/postgres.ts:36`) | PASS | — |
| D-002 | admin | `GET /api/admin/orders?q=' OR 1=1--` | 0 rezultata | 200, total=0 | PASS | — |
| D-003 | admin | `?q=') UNION SELECT sqlite_version()--` | 0 rezultata | 200, total=0 | PASS | — |
| D-004 | admin | `?q=%`, `?q=_` | wildcard doslovno | `%` → 0; `_` → 24 (doslovan pogodak, id-jevi sadrže `_`) | PASS | — |
| D-005 | admin | `?sort=total_desc; DROP TABLE orders`, `?sort=(SELECT 1)` | 422 | 422 | PASS | — |
| D-006 | admin | `?date=' OR 1=1--`, `?from=2026-01-01 OR 1=1`, `?dateField=o.id` | 422 | 422 | PASS | — |
| D-007 | admin | `?pageSize=100000`, `?page=-1` | 422 | 422 | PASS | — |
| D-008 | admin | `customerId`, `customers?q`, `customers?status` sa SQL payload-om | 0 / 422 | 0 / 0 / 0 / 422 | PASS | — |
| D-009 | admin | SQL payload kao ID u ruti: `customers/:id`, `orders/:id`, `legacy?orderId` | 404 | 404 | PASS | — |
| D-010 | admin | deliveries, deliveries/export, insights, calendar sa SQL payload-om | 422 | 422 | PASS | — |
| D-011 | gost | products/:slug, storefront, delivery-options, cart/recovery, product-images sa SQL payload-om | 404/422 | 404 / 422 / 200 javni podaci | PASS | — |
| D-012 | gost | Idempotency-Key i promo kod sa SQL payload-om | parametrizovano/odbijeno | ključ kroz `?`; promo regex `^[A-Z0-9_-]{1,40}$` → 422 | PASS | — |
| D-013 | gost→admin | `<script>` / `<img onerror>` u imenu i napomeni pri checkout-u | tekst | tekst; React escapuje | PASS | — |
| D-014 | admin CMS | CMS stranica sa `<script>` objavljena, `GET /informacije/test-d-xss` | escapovano | `&lt;script&gt;`; vraćena u draft | PASS | — |
| D-015 | pregled koda | `dangerouslySetInnerHTML` | samo JSON-LD sa escape-om | 6 mesta, sva kroz `serializeJsonLd` | PASS | — |
| D-016 | pregled koda | Email šabloni (`notifications.ts:7-18`, `contact.ts`) | escapeHtml | escapuje se | PASS | — |
| D-017 | gost | Reflected XSS na `/prodavnica?q`, `/checkout/rezultat`, `/prijava?email`, `/proizvodi/<x>`, `/informacije/<x>`, 404, `/en/…` | bez sirovog `<script>` | 0 pojava | PASS | — |
| D-018 | admin | `javascript:` u URL podešavanjima i slikama | odbijeno | samo `/…` ili `https://` (`assetUrl` prihvata i `//host`) | PASS | — |
| D-019 | admin | CSV export: `=…`, `@…`, `\t=…` | prefiks `'` | `'=…`, `'@…`, `'+381…` | PASS | — |
| D-020 | admin | XLSX export istih podataka | inlineStr | inlineStr, 0 `<f>` | PASS | — |
| D-021 | kupac | `PATCH /api/account`: bez Origin / evil / null / Referer / Origin sa `/` / 127.0.0.1 / `localhost:3100.evil.test` | 403 | 403 ×7 | PASS | — |
| D-022 | kupac | Ostale cookie mutacije sa lošim Origin | 403 | 403 CSRF_REJECTED | PASS | — |
| D-023 | gost | demo, code, verify, register, admin/access loš Origin; contact text/plain | 403 / 415 | 403; contact 403 INVALID_ORIGIN; 415 | PASS | — |
| D-024 | admin | `PATCH /api/admin/orders` sa Bearer, bez Origin | po APP-MAP 403 | 404: handler izvršen, nema `assertSameOrigin` | FAIL | Nisko |
| D-025 | kupac | Atributi kolačića | HttpOnly, SameSite, Secure na HTTPS | `HttpOnly; SameSite=Lax`; HTTPS `__Host-` + `Secure` | PASS | — |
| D-026 | gost | CORS: OPTIONS i GET sa evil Origin | bez ACAO | nema `Access-Control-*` | PASS | — |
| D-027 | kupac A | `GET` porudžbine kupca B | 404 | 404 | PASS | — |
| D-028 | kupac A | `PATCH` cancel porudžbine kupca B | 404 | 404 | PASS | — |
| D-029 | kupac A | `PATCH` pretplate kupca B | 404 | 404 | PASS | — |
| D-030 | kupac A | refunds preview/POST za porudžbinu B | 404 | 404 | PASS | — |
| D-031 | gost/kupac | admin orders, export, legacy bez admina / sa cookie-jem | 403 | 403 | PASS | — |
| D-032 | driver | orders, detalj, export, customers, staff, settings, legacy, jobs/billing | 403 | 403; deliveries i calendar 200 | PASS | — |
| D-033 | driver | `deliveries/../orders`, `//orders`, `/orders/`, `/Orders` | 403 / redirect | 403 / 308 / 404 | PASS | — |
| D-034 | finance/manager | matrica dozvola | po matrici | tačno | PASS | — |
| D-035 | owner | staff sa `role: "owner"` | 422 | 422 | PASS | — |
| D-036 | DB | `admin_sessions.credential_hash` za owner sesiju | bez materijala za lozinku | sha256(JSON[email, lozinka]) bez soli; 5 redova | FAIL | Srednje |
| D-037 | staff | deaktivacija / promena lozinke / logout, pa stari token | 403 | 403 | PASS | — |
| D-038 | admin | lažni Bearer tokeni | 403 | 403 | PASS | — |
| D-039 | kupac | 5 pogrešnih kodova, pa tačan | odbijeno | 5× 401, tačan → 401 | PASS | — |
| D-040 | kupac | ponovna upotreba koda | 401 | 401 | PASS | — |
| D-041 | gost | `POST /api/auth/code` sa `Host: shop.example.test` | bez koda | `localDevelopment.code` vraćen | FAIL | Srednje |
| D-042 | DB | entropija tokena, hash u bazi | ≥128 bita, hash | 256 bita; SHA-256; kod HMAC; staff scrypt | PASS | — |
| D-043 | kupac | logout, pa `GET /api/account` | 401 | 401 | PASS | — |
| D-044 | DB | rokovi sesija | 30 d / 8 h / 5 min | tačno | PASS | — |
| D-045 | pregled koda | constant-time poređenje | timing-safe | `constantTimeEqual`; `timingSafeEqual` | PASS | — |
| D-046 | gost | cron: bez auth / pogrešan / admin Bearer / HEAD / POST | 401/405 | 401 / 401 / 401 / 405 / 405 | PASS | — |
| D-047 | gost | 11 admin prijava sa `.44` (429), 12. sa `.45` | 429 | 403 — limit zaobiđen; isto za XFF | FAIL | Visoko |
| D-048 | gost | admin-login 10/15 min | 11. → 429 | 429, retryAfter=900 | PASS | — |
| D-049 | gost | `Retry-After` na 429 | prisutan | nema; samo u `details` | FAIL | Nisko |
| D-050 | gost | checkout 20/10, demo 20/15, code-ip 12/15, verify 30/15, exchange 10/15 | 429 | tačno | PASS | — |
| D-051 | gost | limit na cart quote, cart/recovery, convert | ograničeno | nema limita | FAIL | Nisko |
| D-052 | gost | isti email sa dva IP-ja | 2. → 429 | 202, pa 429 (po identitetu) | PASS | — |
| D-053 | gost | nevalidan JSON / niz / `Content-Length` 300 KB | 400 / 400 / 413 | tačno | PASS | — |
| D-054 | gost | 300 KB sa `Transfer-Encoding: chunked` | 413 | 200 | FAIL | Srednje |
| D-055 | gost | JSON 5000 nivoa na checkout | 4xx | 500 RangeError | FAIL | Nisko |
| D-056 | gost | error odgovori | bez stack trace-a | generička poruka + requestId | PASS | — |
| D-057 | gost | headeri u dev-u + `next.config.ts` | strog CSP, HSTS | dev: nema; prod CSP `unsafe-inline` | FAIL | Srednje |
| D-058 | gost | `X-Powered-By` | odsutan | `Next.js` | FAIL | Nisko |
| D-059 | gost | nosniff, XFO, Referrer-Policy, Permissions-Policy, COOP, API `no-store` | prisutni | prisutni | PASS | — |
| D-060 | owner | upload: SVG / exe kao PNG / 2,1 MB / 3,1 MB / bez auth | 422/422/422/413/403 | tačno | PASS | — |
| D-061 | owner | poliglot PNG + path traversal | serviran bezbedno | UUID ime; `image/png`, nosniff, CSP none | PASS | — |
| D-062 | gost | checkout sa `unitPriceMinor`, `totalMinor`, `paymentStatus`, `isAdmin`, `customerId` | ignorisano | pending, iznosi sa servera | PASS | — |
| D-063 | gost | checkout sa email-om postojećeg kupca B | potvrda vlasništva | porudžbina na nalogu B sa napadačevom adresom; email potvrde poslat | FAIL | Srednje |
| D-064 | kupac | PATCH porudžbine sa `paymentStatus` / `totalMinor` / `action: "deliver"` / cenom | 422 / ignorisano | tačno | PASS | — |
| D-065 | kupac/admin | dodatna polja u profilu, register-u, admin PATCH-u | ignorisano | ignorisano | PASS | — |
| D-066 | DB | sirov conversion token van hash tabele | samo hash | sirov u outbox i `idempotency_keys` | FAIL | Nisko |
| D-067 | gost | isti Idempotency-Key: drugo telo, pa isto telo | 409; bez tuđih podataka | 409 otkriva postojanje; replay vraća offer token; finance vidi ključ | FAIL | Nisko |
| D-068 | gost | količine 0 / -1 / 1,5 / 101 / 10^12 / "4" / null / true; 51 stavka; prošli datum | 422 | 422; max 500.140.000 para bez overflow-a | PASS | — |
| D-069 | gost | 100% + fiksni promo | total ≥ 0 | total = dostava | PASS | — |
| D-070 | gost | perCustomerLimit, 3 paralelna checkout-a, isti kod 3× | limit | 422; trka [201, 422, 422]; dedup | PASS | — |
| D-071 | owner | upload JSON-om / dupli staff email / dupli promo kod | 4xx | 500 ×3 | FAIL | Nisko |
| D-072 | gost | convert: loš / tuđi bez sesije / ponovo | 401 / 201 / 401 | tačno (bearer token 256 bita, po dizajnu) | PASS | — |
| D-073 | pregled koda | payment webhook monotonost | sve | 401 / 503 / replay OK; `paid → failed/refunded` dozvoljeno (`route.ts:28-34`) | FAIL | Nisko |
| D-074 | gost | email webhook HTTP + svix offline | potpis obavezan | 503 nije konfigurisan; offline: samo validan potpis | PASS | — |
| D-075 | pregled | `.env.example` | prazni `KEY=` | `SESSION_SECRET=replace…`, `MAGIC_LINK_SECRET=replace…`, `PAYMENT_PROVIDER=raiaccept` | FAIL | Nisko |
| D-076 | pregled koda | CMS audit actor (`content-pages.ts:51`) | operater | fiksno `admin-session` | FAIL | Nisko |
| D-077 | gost | register + verify za `demo@example.invalid` | odbijeno | sesija 30 dana (mutacije 403) | FAIL | Nisko |
| D-078 | log | `.data/qa-dev.log` | bez tajni | pun URL sa `?token=` logovan | FAIL | Nisko |
| D-079 | frontend | `.next/dev/static` i HTML: tajne | ništa | 0 | PASS | — |
| D-080 | API | osetljiva polja u odgovorima | bez hash/tokena | nema; `idempotency_key` i `payment_provider_ref` u admin listama | PASS | — |
| D-081 | DB | audit i outbox: lozinke/kodovi | bez tajni | nema (osim D-066) | PASS | — |
| D-082 | demo | demo nalog mutacije | 403 | 403 DEMO_READ_ONLY | PASS | — |
| D-083 | pregled | `npm audit --omit=dev` | — | nema interneta; next 16.3.4, react 19.2.6, svix 2.8.0, pg 8.23.0, @libsql/client 0.18.0, drizzle-orm 0.45.2 | NOT-TESTED | — |
| D-084 | gost | contact limit 5/h | 6. → 429 | 503 CONTACT_UNAVAILABLE pre limita | NOT-TESTED | — |

## Detalji FAIL nalaza

**D-047 (Visoko): zaobilaženje IP rate limita**
- Fajl: `server/rate-limit.ts:7-12`. `clientAddress` uzima redom `cf-connecting-ip`, `x-real-ip`, prvu vrednost iz XFF.
- Reprodukcija: 11× `POST /api/admin/access` sa `cf-connecting-ip: 198.51.100.44` i pogrešnom lozinkom → poslednji 429. Isti zahtev sa `cf-connecting-ip: 198.51.100.45` → 403, ne 429.
- Uticaj: na Vercelu header ne postavlja niko pouzdan; brute-force admin/staff lozinki neograničen (nema zaključavanja po nalogu); isto za checkout, demo, code-ip, verify. Identity limiti i 5 pokušaja po kodu i dalje važe.
- Predlog: na Vercelu `x-vercel-forwarded-for` / `x-real-ip`; `cf-connecting-ip` samo uz `TRUSTED_PROXY=cloudflare`; identity limit za admin prijavu i progresivno kašnjenje.

**D-036 (Srednje): neposoljen SHA-256 owner kredencijala**
- Fajl: `server/auth.ts:142-143`, upis `:164`, provera `:188`.
- Reprodukcija: `sha256(JSON.stringify([email, lozinka]))` base64url → `select count(*) from admin_sessions where credential_hash='<izlaz>'` → 5.
- Uticaj: ko ima bazu/backup može offline brute-force owner lozinke.
- Predlog: HMAC(serverSecret, lozinka) ili verzija kredencijala; owner u `admin_users` sa scrypt; `ADMIN_PASSWORD_HASH`, MFA.

**D-063 (Srednje): checkout sa tuđim email-om**
- Fajl: `server/commerce.ts:250-252`, `:277` (`ON CONFLICT(email) DO NOTHING`), `:308`.
- Reprodukcija: `POST /api/checkout` sa `customer.email` postojećeg kupca B i napadačevom adresom → kupac B vidi porudžbinu u `GET /api/account`; `shipping_json` sadrži napadačevu adresu; poslat `email.order_confirmation`.
- Uticaj: lažne gotovinske porudžbine na tuđem nalogu (do ~5 M RSD), uznemiravanje, potrošnja promo limita; uz D-047 masovno.
- Predlog: za email sa `customer_credentials` tražiti sesiju ili potvrdu kodom; inače nepotvrđena guest porudžbina; generičan odgovor.

**D-041 (Srednje): `localAuth` hostname provera**
- Fajl: `server/customer-login.ts:40-46`, `:215`; isti obrazac `server/auth.ts:62-63`.
- Reprodukcija: `POST /api/auth/code` sa `Host: shop.example.test` → odgovor sadrži `localDevelopment.code`.
- Uticaj: u `next dev` `request.url` uvek ima `localhost`; izložen dev/preview server (tunel, `0.0.0.0`, self-host sa podrazumevanim `APP_ENV=local` iz `server/runtime.ts:4`) → preuzimanje bilo kog naloga. Na Vercelu štite samo `!VERCEL` i `APP_ENV=production`.
- Predlog: kod izlagati samo uz eksplicitni flag i loopback socket; AUTH_MODE=local na produkciji fail-closed; podrazumevani `APP_ENV` van Vercela `production`.

**D-057 (Srednje): CSP** — `next.config.ts:18-21`: `script-src 'self' 'unsafe-inline' …`; CSP i HSTS samo uz `NODE_ENV=production`. Predlog: nonce CSP preko `proxy.ts`, stroži CSP za `/admin`, Report-Only u dev-u.

**D-054 (Srednje): chunked telo** — `server/domain.ts:18-22`. 300 KB sa `Transfer-Encoding: chunked` na `/api/cart` → 200 (sa `Content-Length` 413). Predlog: streamovati telo sa brojačem bajtova i prekinuti posle 64.000.

**D-055 (Nisko): duboko ugnežđen JSON** — `server/domain.ts:64-73`, `server/crypto.ts:26-32`. 5000 nivoa → 500. Predlog: limit dubine, 422.

**D-049 (Nisko): `Retry-After`** — `server/rate-limit.ts:39-40`, `server/domain.ts:84-85`. Dodati header za RATE_LIMITED.

**D-051 (Nisko): endpoint-i bez limita** — `app/api/cart/route.ts`, `server/cart-recovery.ts:19,75`, `app/api/orders/convert-to-subscription/route.ts`. Quote otkriva postojanje promo koda bez limita; `DELETE /api/cart/recovery {"cartId":"<tuđi>"}` odjavljuje tuđu korpu; POST prepisuje email/telefon. Predlog: limit, Origin provera, cartId vezan za HMAC.

**D-024 (Nisko): admin mutacije bez Origin** — sve `app/api/admin/*/route.ts` mutacije i `jobs/*`. Predlog: `assertSameOrigin` centralno u `requireAdmin` za ne-GET.

**D-071 (Nisko): 500 umesto 4xx** — `app/api/admin/product-images/route.ts:8`, `server/staff.ts:40`, `server/admin.ts:452`. Predlog: 415 / 409.

**D-066 (Nisko): conversion token u outbox-u** — `server/commerce.ts:269,273-274,307-308`. Sirov token u `outbox.payload_json` i `idempotency_keys.response_json`. Predlog: izbaciti iz payload-a i replay odgovora.

**D-067 (Nisko): globalni Idempotency-Key** — `server/commerce.ts:183-188`, `server/admin.ts:153`, `audit_log.before_json`. Predlog: vezati ključ za klijenta; ukloniti iz admin listinga i audita.

**D-058 (Nisko):** `poweredByHeader: false`.

**D-073 (Nisko): payment webhook** — `app/api/webhooks/payments/route.ts:28-34`: `paid → failed/refunded` dozvoljeno za ne-pakete. Predlog: mašina stanja + `mutationGuard`.

**D-075 (Nisko):** `.env.example:6-7,46` prazni `KEY=`, `PAYMENT_PROVIDER=disabled`.

**D-076 (Nisko):** `server/content-pages.ts:51` → `actorContext.getStore()?.id`.

**D-077 (Nisko):** odbijati `DEMO_CUSTOMER_EMAIL` u `registerCustomer` i `requestLoginCode`.

**D-078 (Nisko):** redigovati query string u logovima; ukloniti `/prijava/potvrda?token=`.

## Ostala zapažanja
- Nema SQLi vektora.
- `/api/auth/magic-link/exchange` i dalje radi iako je magic link penzionisan (nizak rizik; može se ukloniti).
- `assetUrl` prihvata `//host`.
- Poliglot PNG prolazi magic-bajt proveru, ali se servira bezbedno.

## Nije pokriveno i zašto
- **npm audit:** nema interneta.
- **Contact limit:** 503 pre limita.
- **Payment webhook limit, replay i obrada:** zahtevaju PAYMENT_MODE=mock i restart (uticalo bi na druge agente); pokriveno pregledom koda.
- **Email webhook preko HTTP-a:** nema `RESEND_WEBHOOK_SECRET`; svix testiran offline.
- **`request.url` na `next start`/Vercelu:** build zabranjen.
- **Produkcioni CSP i HSTS uživo:** ocena iz `next.config.ts`.
- **`/api/admin/fiscomm`:** zabranjen spoljni poziv.
- **Brute-force/masovni zahtevi:** namerno nisu izvedeni; zaobilaženje dokazano sa 12 zahteva.

## Test podaci Agenta D u QA bazi
Kupci `test-d-1…9@example.test`; porudžbine `TEST-D-` (uklj. XSS/CSV payload-e); pretplate `test-d-2`, `test-d-1`; staff `test-d-driver` (deaktiviran), `test-d-finance`, `test-d-manager`; promo `TEST-D-PCT100`, `TEST-D-FIX` (deaktivirani); CMS `test-d-xss` (draft); jedna poliglot PNG u `product_images`; `customer_credentials` red za demo nalog (D-077).
