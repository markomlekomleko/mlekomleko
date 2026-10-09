# Storefront languages

Serbian Latin retains the existing URLs. Serbian Cyrillic, English and Russian use
`/sr-cyrl`, `/en` and `/ru`. `proxy.ts` rewrites these URLs to the existing App Router
pages and sets trusted request headers. `/sr-latn` redirects to the unprefixed URL.
Admin, API endpoints and assets stay unprefixed; administration always uses Serbian
Latin. Do not infer a language from the browser or automatically redirect crawlers.

`app/lib/i18n/catalog.ts` maps Serbian Latin interface messages to English and
Russian. Cyrillic uses deterministic Serbian transliteration of known messages.
Unknown names, customer input, IDs and form values stay unchanged. Wrap displayed
customer text in `data-no-translate` if it could coincide with interface copy.
When adding or editing public copy (including product descriptions), update the
catalogue. Custom content entered later in administration needs corresponding
translations; arbitrary English/Russian translations are never invented at runtime.
`scripts/i18n/extract.mjs` produces candidate message lists in the system temp folder
for an editorial audit; it is intentionally not an automatic translator.

Public components use `useLocalize()` around their returned React tree. Server pages
use `getLocalize()`. This translates rendered labels, accessibility text and links,
without changing commerce payloads. Use `useLocale()` with date/money formatters.
Translate individual words before joining them into a sentence. `localizedPath()`
is idempotent and excludes external URLs, APIs, administration and assets.

Language switching uses a full navigation, preserving the path, query, hash and
local basket. It updates the root document language and provider together. Keep
programmatic navigation localized too (including authentication callbacks).

Metadata is generated per language: self-canonical, reciprocal `hreflang` including
`x-default`, translated titles/descriptions/social cards, and localized JSON-LD.
The sitemap contains all four versions. Account, login, cart and checkout remain
`noindex`. Slugs stay stable across languages.

The announcement is a single message. Administration has four message fields;
Cyrillic falls back to transliteration, and the existing announcement has built-in
English/Russian translations. An empty URL renders plain text. An internal URL is
localized, while an HTTPS URL opens safely in a new tab. Empty or disabled messages
hide the bar. New custom announcements should include English/Russian copy.

Validation: `tests/e2e/i18n.spec.ts` covers all four languages, SEO, switching with a
filled basket, translated delivery calendars, real local orders, invalid and valid
login codes, admin isolation and announcement settings across three viewports.
`tests/vercel/runtime.test.mjs` also checks localization in a production Next build.
