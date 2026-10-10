# Raiffeisen / RaiAccept checkout

Status: 10 October 2026 — checkout preparation only; bank integration is not implemented or enabled.

The selected provider is Raiffeisen RaiAccept. The checkout now shows a disabled card option and explains the current availability. Cash remains usable. For subscription baskets it distinguishes payment of the full prepaid package from automatic card renewal. Neither card payment nor recurring charging is enabled by these changes.

The bank's official product page links to https://docs.raiaccept.com for integration and sandbox access:
https://www.raiffeisenbank.rs/sr/mala-privreda/prihvatanje-platnih-kartica/raiaccept.html

The documentation returned HTTP 403 from this environment. No bank credentials were configured. API endpoints, credentials, callback signatures, status values and recurring requests must be confirmed from the merchant documentation before implementing the adapter. The generic PAYMENT_* keys in the existing configuration are placeholders, not a verified RaiAccept contract.

## Required to continue

- Merchant sandbox access and the current API specification from the bank. Store secrets only in server environment settings.
- Confirmed hosted checkout/session API, authoritative payment status lookup and notification authentication. A success URL or browser-supplied token must never mark an order paid.
- Bank confirmation that the merchant account supports automatic recurring payments, with the exact tokenization/mandate contract. Saved-card one-click checkout alone does not establish recurring-payment support.
- Confirm renewal cadence: the current product is a prepaid package of four weekly or two fortnightly deliveries. Pauses and skipped deliveries preserve paid quantities, so a calendar-month charge must not be assumed.

## Remaining implementation

Persist a pending order and payment attempt before contacting the bank; support safe idempotent retries and reconciliation after ambiguous network outcomes. Redirect to the bank's hosted card form. Verify amount, RSD currency and order identity server-side before marking payment paid and triggering package activation, fiscalization and purchase analytics exactly once. Keep failed/cancelled payments recoverable and avoid duplicate orders on retry.

Recurring charging also needs explicit customer consent, a stored provider mandate distinct from a transaction reference, cancellation/revocation handling, and payment retry rules. The existing local mock gateway and webhook are local test infrastructure only.

Complete sandbox checks for successful, declined and cancelled checkout, forged/repeated/out-of-order notifications, timeouts, duplicate clicks, amount mismatches, renewal, cancellation and refunds before enabling production. No real card transaction has been attempted.
