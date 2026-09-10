# Vercel hosting

Projekat koristi Next.js App Router i Node runtime. `npm run build` pravi Next.js
produkcioni build; `vercel.json` bira Next.js i region Frankfurt. Sites sajt je obrisan
7. septembra 2026. Stara adresa vraća 404. Uklonjeni su `.openai/hosting.json`, Sites
build plugin i Git remote `sites`.

Lokalni server koristi `.data/mleko.sqlite`. Postojeća lokalna D1 baza je preneta SQLite
backup API-jem, a original u `.wrangler/` je sačuvan. `npm run db:migrate:local`
primenjuje samo nove migracije i prepoznaje prenetu D1 istoriju. Vinext/Worker ostaju
samo zbog postojećeg test okruženja, nisu deo Vercel runtime-a.

Izvoz stare Sites baze je u ignorisanoj datoteci
`outputs/sites-backup-2026-09-06.json`: 25 tabela i 47 redova. Na dan izvoza nije bilo
kupaca, porudžbina ili pretplata. SQL šema je u `migrations/`. Backup, lokalne baze i
`.env*` datoteke isključeni su iz Git-a i Vercel upload-a.

## Povezivanje i objavljivanje

Vercel projekat još nije kreiran. Potrebno je odabrati korisnikov nalog/tim i povezati
trajnu udaljenu bazu. Implementirani adapter podržava libSQL/Turso; Supabase/Postgres
zahteva poseban adapter i prilagođavanje SQL-a. Lokalna datoteka nije dozvoljena kao
baza na Vercelu, jer filesystem funkcije nije trajno skladište.

Serverske promenljive na Vercelu:

| Promenljiva | Vrednost |
| --- | --- |
| `TURSO_DATABASE_URL` | `libsql://...` adresa izdvojene baze za ovaj projekat |
| `TURSO_AUTH_TOKEN` | serverski token te baze |
| `ADMIN_SECRET` | sopstveni dug nasumični ključ za admin |
| `CRON_SECRET` | zaseban nasumični ključ za zakazane poslove |
| `APP_ENV` | `production` (Vercel runtime ga svakako prisilno koristi) |
| `APP_ORIGIN` | puna HTTPS adresa deployment-a ili konačnog domena |
| `NEXT_PUBLIC_SITE_URL` | konačna javna HTTPS adresa |
| `PAYMENT_WEBHOOK_SECRET` | zaseban ključ za webhook |

Integracije ostaju u postojećem razvojnom režimu (`PAYMENT_MODE=disabled`,
`PAYMENT_PROVIDER=disabled`, `BADI_MODE=mock`, `EMAIL_MODE=console`,
`ALLOW_PRODUCTION_INTEGRATIONS=false`) dok se ne povežu pravi provajderi.

Sa adresom/tokenom izabrane baze u lokalnom, ignorisanom environment fajlu, pokrenuti
`npm run db:migrate`. Migracije ne treba automatski pokretati u build koraku: preview
build ne sme menjati produkcionu bazu. Prenos podataka iz backupa je zaseban korak i
još nije izvršen na udaljenoj bazi. Preview treba da koristi zasebnu test bazu.

Admin prvo poziva `/api/admin/access`, pa tek nakon uspešne autentikacije učitava
sekcije. Lokalni razvoj sa loopback adrese ima automatski pristup. Produkcioni build
uvek traži `ADMIN_SECRET`; `APP_ENV=local` ili podmetnut localhost header ne uključuju
lokalni pristup. Bez podešenog ključa prikazuje se konkretna poruka o konfiguraciji.

## Zakazani poslovi

`GET /api/jobs/scheduled` proverava `Authorization: Bearer <CRON_SECRET>` pre pristupa
bazi. Poziva istu poslovnu logiku kao stari Worker: projekciju dostave, podsetnike,
obračun prvog dana meseca i outbox retry. HEAD zahtevi ne izvršavaju poslove.

Raspored još nije aktiviran. U `vercel.json` treba dodati `crons` sa putanjom
`/api/jobs/scheduled` i odgovarajućim UTC rasporedom nakon izbora naloga/plana. Pro
omogućava češće izvršavanje; dnevni raspored na Hobby nije zamena za česte retry-e.
Poslovni datumi se i dalje računaju u `Europe/Belgrade`.
Vercel šalje podešeni `CRON_SECRET` u Authorization headeru
([dokumentacija](https://vercel.com/docs/cron-jobs/manage-cron-jobs)).

## Provera

`npm run test:vercel` pravi Next.js build i pokreće stvarni produkcioni server sa
privremenom SQLite bazom: svih deset admin sekcija, obavezna prijava, atomski rollback,
checkout/replay, zaštita cron rute i javne stranice. Lokalna radna baza se ne menja.

Next.js sa postojećim `app/loading.tsx` može poslati HTTP 200 pre završetka provere
proizvoda. Nepostojeći proizvod tada prikazuje 404 sadržaj sa `noindex` metapodatkom;
API za nepostojeći proizvod vraća HTTP 404. Ovo je standardno ponašanje streaming
odgovora u Next.js-u.

Provera migracije 7. septembra 2026: Next.js build i svih 7 HTTP/libSQL testova prolaze.
Svih 20 postojećih rendered HTML/API testova takođe prolazi. Širi legacy skup ima
12 postojećih neuspešnih testova u `tests/domain-sqlite.test.mjs` (pretplate, dostave,
validacija i iskorišćenje promo koda). Oni nisu otklonjeni ovom migracijom; kompletna
production acceptance provera zato još nije zelena.
