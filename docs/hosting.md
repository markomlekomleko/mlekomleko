# Vercel hosting

Projekat koristi Next.js App Router i Node runtime. `npm run build` pravi Next.js
produkcioni build; `vercel.json` bira Next.js i region Frankfurt. Sites sajt je obrisan
7. septembra 2026. Stara adresa vraća 404. Uklonjeni su `.openai/hosting.json`, Sites
build plugin i Git remote `sites`.

Lokalni server koristi Supabase kada je postavljen `POSTGRES_URL`; bez njega koristi `.data/mleko.sqlite`. Postojeća lokalna D1 baza je preneta SQLite
backup API-jem, a original u `.wrangler/` je sačuvan. `npm run db:migrate:local`
primenjuje samo nove migracije i prepoznaje prenetu D1 istoriju. Vinext/Worker ostaju
samo zbog postojećeg test okruženja, nisu deo Vercel runtime-a.

Izvoz stare Sites baze je u ignorisanoj datoteci
`outputs/sites-backup-2026-09-06.json`: 25 tabela i 47 redova. Na dan izvoza nije bilo
kupaca, porudžbina ili pretplata. SQL šema je u `migrations/`. Backup, lokalne baze i
`.env*` datoteke isključeni su iz Git-a i Vercel upload-a.

## Povezivanje i objavljivanje

Aktivni projekat je `mlekomleko-wyku`, sa adresom
[https://mlekomleko-wyku.vercel.app](https://mlekomleko-wyku.vercel.app).
Podržani su Supabase/PostgreSQL i prethodni libSQL/Turso adapter. PostgreSQL ima
prednost kada postoje `POSTGRES_URL`, `POSTGRES_PRISMA_URL` ili PostgreSQL
`DATABASE_URL`. SQLite ostaje za rad bez mreže i izolovane regresione testove.
Lokalna datoteka nije dozvoljena kao baza na Vercelu.

Serverske promenljive na Vercelu:

| Promenljiva | Vrednost |
| --- | --- |
| `POSTGRES_URL` | Supabase transaction pooler, port 6543, samo na serveru |
| `POSTGRES_URL_NON_POOLING` | Supabase session pooler, port 5432, za migracije |
| `ADMIN_EMAIL` | email adresa za admin |
| `ADMIN_PASSWORD` | jaka lozinka, najmanje 10 znakova; samo server |
| `CRON_SECRET` | zaseban nasumični ključ za zakazane poslove |
| `APP_ENV` | `production` (Vercel runtime ga svakako prisilno koristi) |
| `APP_ORIGIN` | puna HTTPS adresa deployment-a ili konačnog domena |
| `NEXT_PUBLIC_SITE_URL` | konačna javna HTTPS adresa |
| `PAYMENT_WEBHOOK_SECRET` | zaseban ključ za webhook |

Integracije ostaju u postojećem razvojnom režimu (`PAYMENT_MODE=disabled`,
`PAYMENT_PROVIDER=disabled`, `BADI_MODE=mock`, `EMAIL_MODE=console`,
`ALLOW_PRODUCTION_INTEGRATIONS=false`) dok se ne povežu pravi provajderi.

Sa konekcijama u ignorisanom `.env.local` fajlu, `npm run db:migrate` bira PostgreSQL
migracije iz `migrations/postgres/`. Dev server automatski učitava isti fajl. Komanda
`npm run db:migrate:local` uvek ostaje namenjena lokalnom SQLite fajlu.

Devet PostgreSQL migracija odgovara postojećoj SQLite istoriji: sve tabele, indeksi,
strani ključevi, zaštita audit/outbox istorije, katalog i podešavanja. Rekonstrukcija
SQLite products tabele zamenjena je PostgreSQL ALTER naredbama. Sve migracije se
izvršavaju u jednoj transakciji pod advisory lock-om; checksums sprečavaju tiho menjanje
već izvršene istorije. Ponovljeno izvršavanje ne vraća početne cene ili druga podešavanja.

Tablice su u `public` šemi, sa RLS i bez prava za `anon`, `authenticated` i `PUBLIC`.
Aplikacija im pristupa kroz serversku SQL konekciju; Supabase javni ključevi i service
role ključ nisu potrebni ovom toku. TLS verifikuje server i hostname uz Supabase CA iz
`db/certs/supabase-ca.json`; sertifikat je javni podatak, a konekcije ostaju van Git-a.

Migracije se ne pokreću u build koraku. Preview treba da koristi zasebnu test bazu.
Testovi sa `npm run test:postgres` prave nasumičnu `mleko_test_*` šemu, testiraju pravi
Next.js HTTP server preko pooler-a i uklanjaju isključivo svoju šemu. `public` se ne
koristi za testne kupce i porudžbine. Jedino eksplicitna `db:migrate` komanda menja
produkcionu šemu.

Admin prvo poziva `/api/admin/access`, pa nakon prijave učitava sekcije. U Vercel
Project Settings → Environment Variables postaviti `ADMIN_EMAIL` i
`ADMIN_PASSWORD` za Production (i zasebno Preview ako je potreban), zatim uraditi
redeploy. Vrednosti nemaju prefiks `NEXT_PUBLIC_` i ne ulaze u browser bundle.
`APP_ORIGIN` mora biti tačan javni origin prodavnice, bez završne kose crte.
Primeniti migraciju `0011_admin_sessions.sql` pre korišćenja prijave.

Prijava je obavezna posle novog otvaranja/refresh-a, sesija traje najviše 8 sati,
a odjava je opoziva u bazi. Server čuva samo hash tokena. Promena email adrese
ili lozinke i redeploy poništavaju prethodne sesije. Ne postoji podrazumevana lozinka.
Posle 10 pokušaja sa iste adrese u 15 minuta vraća se 429.
Lokalni razvoj, Preview i Production uvek zahtevaju prijavu. Nema automatskog
pristupa preko localhost adrese. `ADMIN_SECRET` nije produkciona admin prijava.


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

`npm run test:postgres` proverava PostgreSQL šemu i početne podatke prema SQLite
migracijama, idempotentnost migracija, zaštitu istorije i prava pristupa, pa pokreće
iste HTTP testove kao `test:vercel`, uključujući checkout, nalog i izmenu pretplate.
Pristupni podaci se uzimaju iz `.env.local`, bez upisivanja u testove ili Git.


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
