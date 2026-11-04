# Mleko i Mleko — mapa aplikacije za QA (2026-11-04)

## Stack i okruženje
- Next.js 16 (App Router, route handlers u `app/api/**`), React 19, TypeScript; domen u `server/*.ts`; provider-neutralni helperi u `integrations/*.mjs`.
- Baza: SQLite/libSQL lokalno (`db/node.ts`), PostgreSQL/Supabase u produkciji. Migracije: `migrations/*.sql` (+ `migrations/postgres/`). Šema: `db/schema.ts`.
- Svi iznosi su integer **pare** (`total_minor`), datumi `YYYY-MM-DD` u `Europe/Belgrade`.
- **QA okruženje (samo ovo koristiti):** dev server `http://localhost:3100`, baza `.data/qa-local.sqlite` u worktree-u, `.env.local` u worktree-u (APP_ENV=local, AUTH_MODE=local, FISCAL_PROVIDER=fiscomm, FISCOMM_MODE=mock, BADI_MODE=mock, PAYMENT_MODE=disabled, EMAIL_MODE=console, WHATSAPP_MODE=queue, LOCAL_AUTH_EXPOSE_TOKEN=true, CRON_SECRET=qa-cron-secret-0123456789, PAYMENT_WEBHOOK_SECRET=qa-webhook-secret-0123456789).
- **ZABRANJENO:** glavni checkout `/Users/luka/Documents/ChatGPT/mleko mleko v2/.env.local` (udaljena Postgres + pravi FISCOMM ključ) — ne čitati ga, ne pokretati ništa iz glavnog checkout-a, ne zvati `api.fiscomm.rs`. SQL upiti nad QA bazom: `sqlite3 .data/qa-local.sqlite` (ako nema sqlite3, koristiti `node -e` sa `@libsql/client`).

## Test nalozi
- Admin (owner): `qa-admin@example.test` / `qa-admin-password-2026` → `POST /api/admin/access` {email,password} uz `Origin: http://localhost:3100` → `sessionToken` → `Authorization: Bearer <token>` (8h, token se ne čuva u browseru; refresh /admin traži novu prijavu).
- Admin limit prijave: **10 pokušaja po IP / 15 min**. Rate limit koristi header `cf-connecting-ip` → svaki agent šalje SVOJ IP header (A: 198.51.100.10, B: .20, C: .30, D: .40, E: .50, F: .60, recenzent: .70) i ponovo koristi sesiju.
- Staff uloge (`admin_users`: owner/manager/driver/finance): kreira ih owner preko `POST /api/admin/staff` {email, fullName, role, password≥12}. Matrica dozvola u `server/staff.ts` `authorizeStaff`.
- Kupac: bez lozinke. Registracija `POST /api/auth/register` {email} → 202 sa `challengeId` i lokalno izloženim 6-cifrenim kodom (localhost + AUTH_MODE=local) → `POST /api/auth/code/verify` {challengeId, code} → HttpOnly cookie `mm_session` (30 dana). UI: `/prijava`, `/nalog`. Prijava: `POST /api/auth/code` {email, channel:"email"}. Gost koji je poručio dobija nalog istim emailom. Magic link (`/api/auth/magic-link`) je penzionisan → 410 kad je AUTH_MODE podešen.
- Demo nalog: `POST /api/auth/demo` → read-only sesija kupca `mm-public-demo-customer` (`demo@example.invalid`), sve mutacije 403 `DEMO_READ_ONLY`.
- Mock webhook naplate `POST /api/webhooks/payments` (header `x-webhook-secret`) radi SAMO uz PAYMENT_MODE=mock (trenutno disabled → 503). Uplatu evidentira admin: `PATCH /api/admin/orders` {id, paymentStatus:"paid", expectedUpdatedAt} ili bulk `POST /api/admin/orders/bulk-payment`.
- Cron: `GET /api/jobs/scheduled` sa `Authorization: Bearer qa-cron-secret-0123456789`. Admin obrada outbox-a: `GET|POST /api/admin/integrations` (process/retry/reminders).

## Uloge i dozvole
| Uloga | Pristup |
| --- | --- |
| Gost | katalog, korpa, checkout (gotovina), kontakt, /prijava |
| Kupac (cookie sesija) | `/nalog`, `GET /api/account`, `PATCH /api/account/subscriptions/:id` (expectedVersion obavezan), `GET|PATCH /api/account/orders/:id` (items/customerNote/cancel), `POST|GET /api/account/refunds`, `/api/account/login-settings`, `/api/account/whatsapp`, `POST /api/orders/convert-to-subscription` |
| Demo kupac | samo GET |
| owner | sve `/api/admin/*` |
| manager | sve osim `/api/admin/staff` |
| driver | samo `deliveries`, `delivery-calendar`, `delivery-preview` |
| finance | `integrations, fiscomm, refunds, payments, messages, commerce-readiness` + GET `orders`, `dashboard` |
- Sve cookie-autentikovane i admin mutacije traže tačan `Origin` (`assertSameOrigin`, 403 CSRF_REJECTED). Admin UI: jedna stranica `/admin` sa karticama: Početna, Porudžbine, Dostave, Kupci, Izveštaji, Podešavanja (Dostava i naplata, Proizvodi, Paketi, Popusti, Sadržaj sajta, Poslovanje, Fiskalizacija, Provera prodavnice, Tehničke operacije).

## Javne stranice
`/`, `/prodavnica`, `/proizvodi/[slug]`, `/korpa`, `/checkout`, `/checkout/rezultat`, `/prijava`, `/prijava/potvrda`, `/nalog`, `/kontakt`, `/faq`, `/dostava`, `/dostava-mleka/beograd|novi-sad`, `/farme`, `/gde-kupiti`, `/kako-funkcionise`, `/o-nama`, `/informacije/[slug]`, `/pravila-pretplate`, `/privatnost`, `/reklamacije`, `/uslovi-kupovine`, `/admin`, `sitemap.xml`, `robots.txt`. i18n prebacivanje jezika (`app/lib/i18n`).

## API (javni)
`GET /api/products`, `GET /api/products/:slug`, `POST /api/cart` (quote), `POST /api/cart/recovery`, `POST /api/checkout` (header `Idempotency-Key` 8–200; `paymentMethod` cash|card; card trenutno nedostupan; odbija PAN/CVV polja; rate limit 20/10min), `GET /api/delivery-options`, `POST /api/contact`, `POST /api/events` (analitika; odbija revenue), `GET /api/storefront`, `GET /api/product-images/:id`, `POST /api/webhooks/email` (Resend svix potpis).

## API (admin, Bearer)
access, dashboard, products(+/:id), product-images, bundles(+/:id), promos(+/:id), customers(+/:id), subscriptions(+/:id), orders (GET list ?date/?q, PATCH {id, paymentStatus|fulfillmentStatus|items|customerNote|deliveryDate, expectedUpdatedAt}), orders/:id (detalj), orders/:id/export?format=xlsx|csv, orders/quote, orders/bulk-payment, deliveries (GET ?date, POST {action:generate|lock, date, force}+Idempotency-Key), deliveries/export?date&format, deliveries/bulk-complete, delivery-calendar, delivery-preview, settings, staff, refunds (GET ?orderId preview / lista; POST {action:request|approve|reject|execute}), payments, fiscomm (GET → zove api.fiscomm.rs — NE ZVATI bez ključa; vraća 503 FISCAL_NOT_CONFIGURED), integrations, inventory, insights, legacy, messages, packages, reminders, commerce-readiness, content-pages. Poslovi: `POST /api/jobs/deliveries`, `POST /api/jobs/billing` (admin), `GET /api/jobs/scheduled` (cron).

## Entiteti i stanja
- **orders**: `payment_status` pending → paid → refunded | failed; `fulfillment_status` planned → delivered | cancelled. `kind` one_time | subscription_invoice. `payment_method` cash|card. Iznosi: subtotal, discount, delivery_fee, credit_applied, total (pare). `billing_json.taxId` → kupac sa PIB-om (buyerId `10:<PIB>`).
- **subscriptions**: active → paused → active; → cancelled (terminalno). `version` optimističko zaključavanje (409 SUBSCRIPTION_VERSION_CONFLICT). Stavke `subscription_items` (weekly/biweekly), `subscription_skips`, `next_delivery_addons`.
- **subscription_packages**: open → completed (paket = 4 nedeljne ili 2 dvonedeljne dostave plaćene unapred); `package_lines` (required_deliveries, cancelled_quantity, imported_delivered_quantity).
- **deliveries** (ruta po datumu): open → locked → completed; **delivery_orders**: pending/locked → delivered | failed | cancelled; `delivery_items.delivered_quantity`. Cutoff = DELIVERY_EDIT_CUTOFF_HOURS pre dostave; posle cutoff-a izmene odbijene.
- **fiscal_receipts**: pending → issued | failed | skipped; `kind` normal | advance | final | refund; `operation_key` = `receipt:<orderId>:sale|advance|delivery:<deliveryOrderId>|...:advance_refund`; provider `fiscomm` | `fiscomm-training` | `fiscomm-mock` | `badi`.
- **fiscal_dispatches** (dnevnik pre POST-a): sending → issued | rejected | unknown. `unknown`/`rejected` blokira nova izdavanja za porudžbinu (FISCAL_RECONCILIATION_REQUIRED). `fiscal_order_snapshots` (zamrznute količine, cene, poreske oznake), `fiscal_delivery_allocations` (nepreklapajući opsezi jedinica po isporuci).
- **outbox**: pending → sent | failed (fiskalni topici: terminalno `failed` osim safe-to-retry kodova; retry 2^n min, max 60). **audit_log** append-only. **webhook_events** idempotentni po provider_event_id. **idempotency_keys** (checkout, 7 dana). **rate_limits**. **refund_requests**: requested → approved → completed | rejected (execute radi samo uz PAYMENT_MODE=mock). **payment_attempts** pending/processing/paid/failed/unknown. **inventory_lots/reservations/movements**. **customer_credentials**, **auth_challenges** (kod 5 min, 5 pokušaja), **auth_tokens** (session), **admin_sessions**, **mutation_guards**, **message_deliveries**, **promo_codes/order_promotions**, **bundles**, **abandoned_carts**, **order_conversion_tokens**.

## Fiskalni tok (server/fiscomm.ts, server/fiscal-receipts.ts, integrations/fiscal-*.mjs)
1. Uplata evidentirana (admin PATCH paid / bulk / webhook mock) → outbox `fiscal.receipt.requested` → `issueFiscomm(orderId)`: paket ili unapred plaćeno → **Avans** (`receipt:<id>:advance`, `POST /receipt/advance/sale`); jednokratno plaćeno pri/nakon uručenja (COD) → **Promet** (`receipt:<id>:sale`, `/receipt/normal/sale`).
2. Potvrda uručenja (`completeDeliveryOrder`, admin Dostave) → `fiscal_delivery_allocations` + outbox `fiscal.delivery.requested` → `issueFiscomm(orderId, deliveryOrderId)` → **Konačni** (`/receipt/advance/finalize`, `skipAdvanceChainDerivation:true`, `referentDocumentNumber` = avans) + odgovor sadrži `finalReceipt` i `refundReceipt` (refundacija avansa) → oba se čuvaju (`...:advance_refund` kind refund).
3. Režimi: training (`/receipt/training/sale`, pravi API), mock (APP_ENV=local, `fiscommMode()==="mock"`, odgovor `MOCK-<key>`), live. Mešanje režima na istoj porudžbini → 409 FISCAL_MODE_MISMATCH.
4. Idempotentnost: `fiscal_dispatches.claim` INSERT … DO NOTHING pre POST-a; `unknown` ishod zahteva ručno usaglašavanje; `fiscal_receipts` UNIQUE operation_key; outbox `enqueueOnce` ključ `delivery-fiscal:<order>:<delivery>`.
5. Poreske oznake: `products.fiscal_tax_label` → `order_items.fiscal_tax_label`; dostava `FISCOMM_DELIVERY_TAX_LABEL`; mock preskače validaciju oznaka. Nema avansnog toka za delimične refundacije kroz Fiscomm (refund `execute` je mock i upisuje `MOCK-FISCAL-REFUND`).
6. Legacy Badi adapter (`fiscal-receipts.ts`) aktivan samo kad FISCAL_PROVIDER nije fiscomm.
7. Stari `fiscal.final.requested` → 409 FISCAL_LEGACY_REVIEW_REQUIRED.
8. NIJE podržano u kodu: kopija računa, predračun, vaučer/prenos kao fiskalni način plaćanja (samo cash|card), kombinovano plaćanje, JMBG identifikacija (samo PIB `10:`), QR/verification URL se čuva samo ako ga vrati Fiscomm (`verification_url`).

## Integracije
Fiscomm (fiskalizacija), Badi (legacy), RaiAccept/OTP (plaćanje, nije povezano), Resend/Infobip (email), Infobip WhatsApp (queue), SMS (disabled), GA4/Meta/Google Ads (consent-gated), Clarity, Spoke CSV/XLSX export, Vercel Cron.

## Pravila za sve agente
- Samo `http://localhost:3100` i `.data/qa-local.sqlite`. Nikakvi pozivi ka internetu, api.fiscomm.rs, pravim mejlovima.
- Ne menjati kod aplikacije (app/, server/, integrations/, db/, migrations/). Dozvoljeno: pisanje skripti u scratchpad i (samo Agent F) novih test fajlova u `tests/`.
- Prefiks podataka: TEST-A-, TEST-B-, TEST-C-, TEST-D-, TEST-E-, TEST-F- u imenima kupaca, emailovima (`test-a-<n>@example.test`) i napomenama. Nikad ne dirati tuđe prefikse.
- Rate limit: slati `cf-connecting-ip` header sa dodeljenim IP-jem.
- Ne pokretati `npm run test:e2e` (podiže drugi server i bazu) niti `npm run build` (gazi .next); dozvoljeno `node --test tests/<file>` i ad-hoc Playwright skripte (`node script.mjs` sa `playwright` paketom iz node_modules, `chromium.launch({channel:'chrome'})` ili bez channel-a).
- Format izveštaja: tabela `ID | Uloga | Koraci | Očekivano | Stvarno | Status (PASS/FAIL/BLOCKED/NOT-TESTED) | Ozbiljnost (Kritično/Visoko/Srednje/Nisko)`, plus za svaki FAIL: koraci reprodukcije, fajl:linija, predlog rešenja. Na kraju: šta nije pokriveno i zašto.
