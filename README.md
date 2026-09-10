# Mleko i Mleko - produkciono ojačan webshop

Lokalni full-stack MVP za katalog, mešovitu korpu, jednokratne porudžbine, mesečne
pretplate po stavci, korisnički magic-link nalog, rok za izmene, admin i pripremu
dostave. Poslovno vreme, obračun, autentikacija, analitika i isporuke koriste server kao
jedini autoritet.

Checkout trenutno prima gotovinske porudžbine. Kartice nisu ponuđene dok se ne
poveže bankarski adapter; simulirana naplata je moguća samo uz APP_ENV=local i
PAYMENT_MODE=mock. Spoljne integracije podrazumevano nisu aktivne: fiskalizacija
koristi Badi mock, a email console režim. Badi HTTP i Resend adapteri su
implementirani, ali ostaju isključeni dok se ne unesu kredencijali, SKU mapa i ne prođe
sandbox provera. OTP i RaiAccept su pripremljeni kao alternativni config izbori; konkretan
bankarski adapter se povezuje tek uz dokumentaciju i test parametre izabrane banke.

## Lokalni start

Preduslov: Node.js `>=22.13.0`.

```bash
npm install
cp .env.example .env.local
npm run db:migrate:local
npm run dev
```

Otvorite [http://localhost:3000](http://localhost:3000). Lokalni admin je na
[http://localhost:3000/admin](http://localhost:3000/admin). Admin zahteva prijavu email adresom i lozinkom i u lokalnom razvoju.
Objavljeni/produkcioni build zahteva `ADMIN_EMAIL` i `ADMIN_PASSWORD` (najmanje
10 znakova). Prijava je obavezna i lokalno. Admin prvo proverava pristup,
a tek zatim učitava podatke. Lozinka se šalje samo pri prijavi; nasumična sesija živi
isključivo u memoriji stranice, do 8 sati. Novo otvaranje/refresh traži novu prijavu.
Odjava opoziva sesiju u bazi; promena kredencijala i redeploy opozivaju stare sesije.
CSV za Spoke i Excel „Dostave“ + „Priprema“ dostupni su u kartici Dostave.
Kartica Porudžbine ima „Potvrda Excel“ i „Potvrda CSV“ uz svaku porudžbinu.

Početne migracije ubacuju razvojne podatke, a poslednja migracija koristi lokalne,
neutralne fotografije kravljeg i kozjeg mleka i uklanja tvrdnje koje zahtevaju dokaz.
Kupac bira litre po dostavi direktno na proizvodu.

Migracije su idempotentne; `npm run db:migrate:local` pokrenite nakon novih migration
fajlova. Nemojte pokretati drugi dev server ako jedan već radi.

## Supabase lokalno i na Vercelu

Serverske `POSTGRES_URL` (transaction pooler) i `POSTGRES_URL_NON_POOLING` (session
pooler) vrednosti staviti u `.env.local`, koji je isključen iz Git-a. Pokrenuti
`npm run db:migrate`, pa `npm run dev`. Iste serverske promenljive moraju biti u
Vercel projektu pre redeploy-a. Javni Supabase ključevi nisu potrebni SQL adapteru.
Lokalne izmene kroz tako povezan sajt upisuju se u istu udaljenu bazu. Za odvojeni
SQLite razvoj ukloniti PostgreSQL konekcije iz lokalnog environment-a.

## Provera

```bash
npm run lint
npm test
npm run test:vercel
npm run test:postgres # sa Supabase konekcijama u .env.local
npm run test:e2e
```

`npm test` zadržava Vinext build samo za postojeće determinističke unit, rendered
HTML/API i integration contract testove. `npm run test:vercel` pravi produkcioni
Next.js build i testira stvarni HTTP server, admin, upis/rollback u libSQL bazi,
checkout i zaštitu cron rute. `npm run test:e2e` automatski pravi novu izolovanu SQLite
bazu, primenjuje migracije i pokreće Playwright na 390, 768 i 1440 px, uključujući axe
proveru ozbiljnih i kritičnih accessibility grešaka. Testovi koriste samo fiktivne
kupce i ne pozivaju prave kartice, email ili Badi.

Pregled proveravanih korisničkih tokova i preostalih koraka za live integracije je
u [docs/live-flows.md](docs/live-flows.md).

Za bržu proveru samo provider-neutralnih modula:

```bash
node --test tests/integrations.test.mjs
```

## Šta je implementirano

- stvarni katalog kravljeg i kozjeg mleka sa izborom 2/4/8 L ili proizvoljne količine;
- korpa u kojoj svaki proizvod zasebno bira jednokratno, weekly ili biweekly;
- checkout sa server-side ponovnim obračunom, idempotency key-em i odbijanjem raw
  kartičnih polja;
- customers, orders, subscription items, idempotent skip/pause/resume/cancel, zasebno
  naplaćen next-only dodatak i kreditni ledger sa automatskim prenosom;
- kalendarski obračun broja isporuka i cutoff u `Europe/Belgrade`;
- jednokratni email magic link i `HttpOnly`, `Secure`, `SameSite=Lax` session cookie;
- logout/revocation, Origin/CSRF zaštita i rate limit za login, checkout i webhook;
- optimističko zaključavanje pretplate kroz obavezni `expectedVersion` i strukturirani
  `409` konflikt;
- admin proizvodi/kupci/porudžbine/pretplate/isporuke/podešavanja;
- idempotent delivery projekcija, dnevni zbir za pripremu i Spoke CSV/XLSX izvoz;
- audit, webhook inbox i izvršivi outbox sa backoff-om, greškama i ručnim retry-em;
- trajna evidencija fiskalnih računa, Badi mock/HTTP i Resend/console adapteri;
- automatske potvrde posle checkout-a/uplate, podsetnici i zaštićena cron ruta za dnevne
  projekcije, mesečni obračun i retry (raspored se aktivira na Vercelu);
- config ugovori za OTP ili RaiAccept, Badi, email, WhatsApp-ready queue i analytics;
- odvojena analytics/marketing saglasnost sa trajno dostupnim povlačenjem;
- first/last-touch snapshot bez PII i server-side `purchase` outbox tek posle potvrđene
  naplate;
- CSP, HSTS i sigurnosni headeri u HTTPS produkcionom odgovoru;
- mobilni meni, 44 px kontrole, pravne stranice, sitemap/robots i noindex stranica za nepostojeće proizvode;
- lokalne AVIF/WebP varijante ključnih slika.

## Važne lokalne vrednosti

`.env.example` je dokumentacija svih opcija. Lokalno zadržite:

```dotenv
APP_ENV=local
ADMIN_EMAIL=
ADMIN_PASSWORD=
PAYMENT_WEBHOOK_SECRET=unesite-sopstveni-dug-slucajni-kljuc
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
- `POST /api/auth/magic-link`, `POST /api/auth/magic-link/exchange`,
  `POST /api/auth/logout`, `GET /api/account` i
  `PATCH /api/account/subscriptions/:id`;
- `GET /api/admin/access` za proveru režima pristupa, bez čitanja poslovnih podataka;
- `/api/admin/*` sa `x-admin-secret` van direktnog lokalnog razvoja;
- `POST /api/jobs/deliveries` za projekciju/zaključavanje i
  `POST /api/jobs/billing` za lokalni mesečni obračun;
- `GET /api/jobs/scheduled` sa `Authorization: Bearer <CRON_SECRET>` za Vercel Cron;
- `GET|POST /api/admin/integrations` za status računa/outbox-a, obradu, retry i
  podsetnike;
- `POST /api/webhooks/payments` za lokalni mock callback.

API greške imaju `{ "error": { "code", "message", "details" }, "requestId": "..." }`,
`X-Request-Id` i `no-store` response.
Browser return sa payment stranice nije dokaz naplate; samo verifikovan provider webhook
ili lookup može promeniti payment status u production adapteru.

## Struktura

```text
app/             Next.js stranice, klijentski tokovi i API rute
db/              PostgreSQL i SQLite/libSQL adapteri sa atomskim batch upisima
migrations/      SQLite istorija i PostgreSQL ekvivalenti u postgres/
server/          Domen, autentikacija, obračun, delivery i adapter interfejsi
integrations/    Provider-neutralni config/ugovori/CSV/attribution helperi
scripts/         Migracije baze i pokretanje legacy test builda
tests/           Rendered/API i integration testovi
docs/            Arhitektura, integracije, threat model, operacije i acceptance lista
```

Detalji:

- [Arhitektura](docs/architecture.md)
- [Integracije i activation checklist](docs/integrations.md)
- [Threat model](docs/threat-model.md)
- [Lokalna operativa i incidenti](docs/operations.md)
- [Hosting i preostali koraci za Vercel](docs/hosting.md)
- [Acceptance kriterijumi](docs/acceptance.md)

## Pre production-a

Kod je spreman za staging, ali produkcioni launch ostaje blokiran dok vlasnik ne izabere
tačno jedan payment provider, ne dostavi ugovor/test pristupe i ne završi sandbox
acceptance. Dodatni obavezni gate-ovi su knjigovodstveno odobren Badi tok, verifikovan
email domen, pravno odobren tekst, realni Spoke import, backup/restore i reconciliation
proba, monitoring/rollback i konfigurisani admin kredencijali u Vercel okruženju. Kompletna lista
sa dokazima je u `docs/operations.md` i `docs/acceptance.md`.
