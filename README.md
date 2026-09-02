# Mleko i Mleko - lokalni webshop MVP

Lokalni full-stack MVP za katalog, mešovitu korpu, jednokratne porudžbine, mesečne
pretplate po stavci, korisnički magic-link nalog, rok za izmene, admin i pripremu
dostave. Frontend je namerno osnovan; backend i poslovna pravila su glavni fokus.

Spoljne integracije još nisu aktivne: kartice i fiskalizacija rade kroz lokalne
adaptere/mock modove. OTP i RaiAccept su pripremljeni kao alternativni provider izbori,
ali production adapter se ne sme napraviti bez dokumentacije i test parametara izabrane
banke.

## Lokalni start

Preduslov: Node.js `>=22.13.0`.

```bash
npm install
cp .env.example .env.local
npm run db:migrate:local
npm run dev
```

Otvorite [http://localhost:3000](http://localhost:3000). Lokalni admin je na
[http://localhost:3000/admin](http://localhost:3000/admin); development ključ iz
`.env.example` je `local-dev-change-me`. Taj fallback je samo za loopback razvoj i ne
sme se koristiti u produkciji.

Prva migracija ubacuje četiri jasno označena demo proizvoda i podrazumevanu petak/08:00
dostavu sa rokom od 24 sata, pa prodavnica odmah ima lokalne test podatke.

Migracije su idempotentne; `npm run db:migrate:local` pokrenite nakon novih migration
fajlova. Nemojte pokretati drugi dev server ako jedan već radi.

## Provera

```bash
npm run lint
npm test
```

`npm test` pravi build i zatim izvršava rendered HTML/API smoke testove i izolovane
integration contract testove. Testovi ne koriste mrežu, prave kartice, email ili Badi.

Za bržu proveru samo provider-neutralnih modula:

```bash
node --test tests/integrations.test.mjs
```

## Šta je implementirano

- katalog proizvoda sa RSD cenama, dostupnošću i SEO poljima;
- korpa u kojoj svaki proizvod zasebno bira jednokratno, weekly ili biweekly;
- checkout sa server-side ponovnim obračunom, idempotency key-em i odbijanjem raw
  kartičnih polja;
- customers, orders, subscription items, skip/pause/resume/cancel, next-only dodatak i
  kreditni ledger;
- kalendarski obračun broja isporuka i cutoff u `Europe/Belgrade`;
- jednokratni email magic link i lokalna session razmena;
- admin proizvodi/kupci/porudžbine/pretplate/isporuke/podešavanja;
- idempotent delivery projekcija, zbir za pripremu i CSV izvoz;
- audit, webhook inbox i outbox granice;
- mock payment/email/fiscal adapteri bez produkcionih poziva;
- config ugovori za OTP ili RaiAccept, Badi, email, WhatsApp-ready queue i analytics;
- consent-gated GA4/GTM/Meta helper i first/last-touch UTM allowlist;
- sitemap/robots i osnovni mobile-first frontend.

## Važne lokalne vrednosti

`.env.example` je dokumentacija svih opcija. Lokalno zadržite:

```dotenv
APP_ENV=local
PAYMENT_PROVIDER=disabled
PAYMENT_MODE=disabled
BADI_MODE=mock
EMAIL_MODE=console
WHATSAPP_MODE=queue
ALLOW_PRODUCTION_INTEGRATIONS=false
```

`integrations/config.mjs` odbija remote payment bez eksplicitnog `otp` ili `raiaccept`
izbora, zahteva HTTPS i ne dozvoljava production mode bez dodatnog latch-a. Badi local
mode prihvata samo loopback URL jer taj Badi režim nema autentikaciju.

Nikada ne stavljajte tajne u `NEXT_PUBLIC_*`, git, browser payload ili log. Aplikacija ne
sme da primi PAN/CVV; kartica se ubuduće obrađuje na hosted stranici banke, a backend
čuva samo provider token/reference.

## Glavne rute

Javni tok: `/`, `/prodavnica`, `/proizvodi/:slug`, `/korpa`, `/checkout`, `/prijava` i
`/nalog`. Admin je `/admin`.

API je pod `/api`:

- `GET /api/products`, `GET /api/products/:slug`;
- `POST /api/checkout` sa `Idempotency-Key` headerom;
- `POST /api/auth/magic-link`, `GET /api/account` i
  `PATCH /api/account/subscriptions/:id`;
- `/api/admin/*` sa `x-admin-secret` u trenutnom lokalnom MVP-u;
- `POST /api/jobs/deliveries` za projekciju/zaključavanje i
  `POST /api/jobs/billing` za lokalni mesečni obračun;
- `POST /api/webhooks/payments` za lokalni mock callback.

API greške imaju `{ "error": { "code", "message", "details" } }` i `no-store` response.
Browser return sa payment stranice nije dokaz naplate; samo verifikovan provider webhook
ili lookup može promeniti payment status u production adapteru.

## Struktura

```text
app/             Next/vinext stranice, klijentski tokovi i API rute
db/              Drizzle D1 šema i binding
migrations/      Lokalna/production SQL istorija
server/          Domen, autentikacija, obračun, delivery i adapter interfejsi
integrations/    Provider-neutralni config/ugovori/CSV/attribution helperi
tests/           Rendered/API i integration testovi
docs/            Arhitektura, integracije, threat model, operacije i acceptance lista
```

Detalji:

- [Arhitektura](docs/architecture.md)
- [Integracije i activation checklist](docs/integrations.md)
- [Threat model](docs/threat-model.md)
- [Lokalna operativa i incidenti](docs/operations.md)
- [Acceptance kriterijumi](docs/acceptance.md)

## Pre production-a

Ovaj repozitorijum nije production-ready samo zato što lokalni testovi prolaze. Potrebni
su: lista proizvoda/cene/fotografije i pravila dostave, tačno izabran payment provider,
sandbox acceptance, knjigovodstveno potvrđen Badi tok, transakcioni email domen,
privacy/terms/refund/delivery sadržaj, consent/tag QA, backup/restore proba i pravi admin
identity/MFA model. Kompletna lista je u `docs/operations.md` i `docs/acceptance.md`.
