# Mleko i Mleko - backend contract

This is the backend contract for the local MVP. All amounts are integer minor units (RSD para): `22000` means RSD 220.00. Floating-point money is never accepted or stored. UTC timestamps are ISO-8601 strings; `deliveryDate`, `pauseUntil`, and billing cadence dates are `YYYY-MM-DD` calendar dates interpreted in `Europe/Belgrade`.

## Lokalna baza i tajne

Initialize or update the persisted SQLite database used by Next.js:

```sh
npm run db:migrate:local
```

The migration seeds four clearly marked demo products and the business defaults (Friday delivery at 08:00 Europe/Belgrade, 24-hour cutoff). Replace product data through the admin API.

Production admin requests use `X-Admin-Secret` and fail closed unless `ADMIN_SECRET`
is configured. Only a development build on direct loopback permits local admin access
without a key. Cross-origin requests and remote forwarded clients cannot use this mode.
There is no default shared secret. This shared-secret route is suitable
for local/staging operations only; production launch requires an identity provider,
server-side role/allowlist checks and MFA. Payment webhooks similarly require an
explicit `PAYMENT_WEBHOOK_SECRET`.

Useful local environment variables are `APP_ENV=local`, `APP_ORIGIN`, `ADMIN_SECRET`,
`PAYMENT_WEBHOOK_SECRET`, and `LOCAL_AUTH_EXPOSE_TOKEN=true`. The last setting exposes a
raw magic-link token only outside `APP_ENV=production` and must only be used for local
development.

## Public catalog and cart

- `GET /api/products` -> `{ products }`, active products only.
- `GET /api/products/:slug` -> `{ product }` or `PRODUCT_NOT_FOUND`.
- `POST /api/cart` validates and prices a cart server-side. Body: `{ items, deliveryDate? }`.

An item is:

```json
{
  "productId": "prod_kravlje_1l",
  "quantity": 2,
  "purchaseType": "subscription",
  "cadence": "weekly"
}
```

`purchaseType` is `one_time` or `subscription`. Subscription cadence is item-level and is `weekly` or `biweekly`.

## Checkout

`POST /api/checkout` requires an `Idempotency-Key` header (8-200 characters). A key replay with the same body returns the original result; reuse with a different body returns `IDEMPOTENCY_CONFLICT`.

```json
{
  "customer": {
    "email": "kupac@example.com",
    "fullName": "Ime Prezime",
    "phone": "+381...",
    "addressLine1": "Ulica 1",
    "addressLine2": null,
    "city": "Beograd",
    "postalCode": "11000",
    "deliveryNote": "Pozvati"
  },
  "items": [
    { "productId": "prod_kravlje_1l", "quantity": 3, "purchaseType": "subscription", "cadence": "weekly" },
    { "productId": "prod_sir_500g", "quantity": 1, "purchaseType": "one_time" }
  ],
  "paymentMethod": "card",
  "paymentToken": "opaque-provider-token",
  "deliveryDate": "2027-09-03",
  "attribution": {
    "firstTouch": { "landingPath": "/prodavnica", "parameters": { "utm_source": "instagram" } },
    "lastTouch": { "landingPath": "/checkout", "parameters": { "utm_source": "newsletter" } }
  },
  "analyticsConsent": true
}
```

The server ignores client prices and snapshots current product prices. Card checkout accepts only an opaque provider token/reference. Keys resembling PAN/card-number, CVC/CVV, or expiry data are rejected. No real card data is stored. Attribution persistence is allowlisted to UTM fields, `gclid`, `fbclid`, a referrer hostname, and a safe landing path.

Subscription lines are charged for their actual remaining weekly/biweekly occurrences in that calendar month. Local mock card payments become `paid`; cash remains `pending`. Payment, email, and fiscal providers are behind interfaces in `server/integrations.ts`; current adapters are safe local mocks.

## Passwordless customer account

- `POST /api/auth/magic-link` with `{ "email": "..." }` always returns
  `202 { accepted: true }`. Outside production, a loopback request may also receive a
  local test URL/token.
- `POST /api/auth/magic-link/exchange` with `{ "token": "..." }` consumes the
  15-minute, SHA-256-hashed, one-time token and sets a 30-day `HttpOnly`, `SameSite=Lax`
  session cookie (`Secure` and `__Host-` on HTTPS). The raw session token is never in
  JSON, browser storage or a URL.
- `POST /api/auth/logout` revokes the current session and expires both possible cookie
  names.
- `GET /api/account` and `PATCH /api/account/subscriptions/:id` use the session cookie.
  Cookie-authenticated write requests require an exact `Origin` match.

Every subscription mutation requires the current positive integer `expectedVersion`.
Accepted responses return the incremented `version`; stale/concurrent writes return
`409 SUBSCRIPTION_VERSION_CONFLICT` with expected/current details.

```json
{ "action": "update_item", "expectedVersion": 3, "itemId": "...", "quantity": 2, "cadence": "biweekly" }
{ "action": "remove_item", "expectedVersion": 3, "itemId": "..." }
{ "action": "add_next_only", "expectedVersion": 3, "productId": "...", "quantity": 1 }
{ "action": "skip_next", "expectedVersion": 3 }
{ "action": "pause", "expectedVersion": 3, "pauseUntil": "2027-10-01" }
{ "action": "resume", "expectedVersion": 3 }
{ "action": "cancel", "expectedVersion": 3 }
```

Locked/cutoff delivery snapshots cannot be changed. Every accepted pre-cutoff mutation automatically rebuilds any affected open delivery projection, so admin preparation totals and Spoke CSV stay current without a manual refresh. Cancel is terminal; resume is valid only for paused subscriptions and is moved to the next mutable configured delivery day without changing an already locked snapshot. Changes to an already paid month create signed credit/adjustment ledger entries. Positive balances carry into the next invoice.

## Admin

Every admin data route requires `X-Admin-Secret`, except direct loopback development
as described above. `GET /api/admin/access` returns only authentication/configuration
status; it does not read business data. The UI validates access before loading data
and never sends requests while a key is being typed.

- `GET /api/admin/dashboard` - counts, paid revenue in minor RSD, upcoming delivery summary.
- `GET|POST /api/admin/products`; `PATCH /api/admin/products/:id` - catalog and price operations.
- `GET /api/admin/customers` - customer list.
- `GET /api/admin/subscriptions` - active, paused, and cancelled subscriptions.
- `GET /api/admin/orders?date=YYYY-MM-DD`; `PATCH /api/admin/orders` - list and update payment/fulfillment state or note. PATCH body includes `id` and changed fields.
- `GET /api/admin/settings`; `PATCH /api/admin/settings` - `cutoffHours`, `deliveryWeekday`, `deliveryLocalTime`, `storeName`.
- `GET /api/admin/deliveries` or `?date=YYYY-MM-DD` - delivery list or a full customer/item snapshot plus aggregate preparation quantities.
- If the selected date has not been generated, `GET /api/admin/deliveries?date=...`
  returns `200 { "delivery": null, "preparation": [], "orders": [], "canGenerate": true }`.
- `POST /api/admin/deliveries` - `{ "action": "generate|lock", "date": "YYYY-MM-DD", "force": false }`, with `Idempotency-Key`. `force=true` is an explicit admin override for pre-cutoff locking.
- `GET /api/admin/deliveries/export?date=YYYY-MM-DD` - UTF-8 BOM CSV shaped for Spoke (name, address, phone, email, products, quantities, note, order ID). Every CSV cell is formula-injection neutralized.

An open delivery can be regenerated with a new idempotency key so pre-cutoff customer changes appear. Reusing its generation key is a no-op. Locking fixes the snapshot, consumes next-only add-ons, locks source orders, and advances each subscription to its next actual due cadence date.

## Local jobs and webhook

- `POST /api/jobs/deliveries`, admin-authenticated, uses `{ "action": "generate|lock", "date": "YYYY-MM-DD" }` plus `Idempotency-Key`.
- `POST /api/jobs/billing`, admin-authenticated, uses `{ "month": "YYYY-MM" }` plus `Idempotency-Key`. It counts actual item cadence dates, snapshots prices, creates at most one subscription invoice per subscription/month, applies open signed credits atomically, carries excess credit forward, invokes the idempotent local payment adapter using only a stored provider reference, and enqueues payment/fiscal/email events.
- `POST /api/webhooks/payments`, webhook-secret authenticated, uses `{ "eventId", "orderId", "status": "paid|failed|refunded" }`. Provider event IDs are unique/idempotent.

## Errors and invariants

Errors have `{ "error": { "code", "message", "details?" }, "requestId": "UUID" }`,
an `X-Request-Id` header and meaningful 4xx/5xx status codes. Request JSON is
size-limited and domain fields are bounded. Login, checkout and webhook routes are rate
limited. Each `prepare()` contains exactly one SQL statement. Checkout, webhook,
delivery and billing job boundaries use idempotency records or unique event keys.
Business mutations append audit records and integration requests to the outbox in the
same atomic libSQL batch (D1 in legacy tests). `purchase` is created only by a server-side, consent-gated outbox job
after confirmed payment; `/api/events` rejects revenue events. `audit_log` cannot be
updated or deleted; outbox events cannot be deleted.
