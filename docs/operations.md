# Lokalni rad i operacije

## Prvi start

Preduslov je Node.js `>=22.13.0`.

```bash
cp .env.example .env.local
npm install
npm run db:migrate:local
npm run dev
```

Za potpuno lokalni rad zadržati `PAYMENT_MODE=disabled`, `BADI_MODE=mock`,
`EMAIL_MODE=console`, `WHATSAPP_MODE=queue` i
`ALLOW_PRODUCTION_INTEGRATIONS=false`. Dev server već pokrenut u drugom terminalu ne
pokretati ponovo; proveriti postojeći terminal/log pre starta.

Generisanje migracije nakon namerne izmene šeme:

```bash
npm run db:generate
```

Verifikacija pre handoff-a:

```bash
npm run lint
npm test
npm run test:vercel
npm run test:e2e
```

`npm test` pravi legacy Worker build za postojeće Node acceptance i integration
testove. `npm run test:vercel` proverava produkcioni Next.js runtime kroz HTTP i libSQL.
Playwright zatim za svaki test run pravi novu izolovanu SQLite bazu,
primenjuje sve migracije i proverava 390/768/1440 px, accessibility, magic-link,
rate-limit, CSRF i optimistic concurrency. Testovi ne zahtevaju spoljne naloge niti
mrežu.

## Test podaci

Lokalni seed mora koristiti očigledno fiktivne kontakte (`example.com`, rezervisani
telefoni) i ne sme sadržati kopiju realne customer baze. Minimalni scenario za ručni QA:

1. jedan weekly i jedan biweekly proizvod u istoj pretplati;
2. jedan proizvod samo uz sledeću isporuku;
3. skip sledeće isporuke i pause do datuma;
4. pokušaj izmene pre i posle cutoff-a;
5. cash i mock-card checkout;
6. Spoke CSV sa zarezom, navodnikom, ćirilicom i formula-like napomenom;
7. consent denied, analytics-only i marketing consent.

## Aktivacija sandbox integracija

Aktivira se jedna po jedna. Nikad payment i Badi u istom prvom pokušaju.

### Payment

1. Izabrati `PAYMENT_PROVIDER=otp` ili `raiaccept`.
2. Postaviti `PAYMENT_MODE=sandbox`, merchant ID, base URL, API i webhook tajnu.
3. Ostaviti production latch na `false`.
4. Pokrenuti provider test matricu: success, decline, 3DS, timeout, dupli webhook,
   recurring, expired/invalid token, refund.
5. Proveriti da logovi ne sadrže tajne/token i da retry ne duplira naplatu.

### Badi

1. Postaviti `BADI_MODE=sandbox` i sandbox tajne/client ID.
2. Uneti `badiSku` za svaki proizvod; ako se naplaćuju dostava ili korekcija, uneti i
   `BADI_DELIVERY_SKU` odnosno `BADI_ADJUSTMENT_SKU`.
3. Testirati karticu, gotovinu, advance/final i refund prema odobrenom toku.
4. Proveriti email/PDF račun, duplicate retry i reconciliation izveštaj.

`BADI_MODE=local` koristi instaliranu Badi aplikaciju na loopback portu i nema auth.
Ne koristiti host `0.0.0.0`, LAN IP ili javni tunnel.

## Dnevna operativa

Za dan isporuke operater bira datum i proverava tri pogleda izvedena iz iste projekcije:

1. zbir potrebne robe;
2. listu kupaca i njihovih stavki;
3. Spoke CSV ili Excel sa listovima `Dostave` i `Priprema`.

Otvorenu listu treba ponovo generisati pre izvoza; tada sadrži sve dozvoljene izmene do
cutoff-a. Posle zaključavanja projekcija ostaje nepromenljiva.

`GET /api/jobs/scheduled` ima zaštićeni handler za dnevnu projekciju, podsetnik za
sutrašnju dostavu, obračun prvog dana u mesecu i outbox retry. Pri hostingu treba
povezati Vercel Cron i zaseban `CRON_SECRET`; do tada su iste operacije dostupne ručno
u adminu. Detalji i status migracije su u `docs/hosting.md`.

## Monitoring i alarmi

Lokalno je dovoljan strukturiran log sa `requestId`, `aggregateId`, event tipom i error
kodom, bez PII. Produkcija mora imati alarme za:

- payment webhook signature failures i rast declined/unknown statusa;
- outbox oldest age, retries i dead-letter broj;
- payment success bez Badi receipt-a duže od dogovorenog SLA;
- delivery projection/job neuspeh;
- email bounce/suppression i magic-link delivery problem;
- neuspešan backup ili reconciliation razliku.

Health endpoint prikazuje samo provider/mode/configured status. Nikad endpoint, merchant
secret, API key, token, email adresu kupca ili sirov provider odgovor.

## Backup i restore

Pre produkcije definisati automatski enkriptovan backup baze i mesečni restore test.
Restore proba mora potvrditi:

- broj customers/orders/subscriptions/deliveries;
- ledger zbir po valuti;
- outbox/inbox idempotency ključeve;
- fiskalne external ID-eve;
- sledeće isporuke i cutoff konfiguraciju.

Posle restore-a ne puštati worker dok se ne proveri da pending outbox neće duplirati
spoljne efekte.

## Incident mini-runbook

### Payment provider nedostupan

Onemogućiti nove card checkout-e, ostaviti cash ako operacije odobre, ne menjati već
potvrđene statuse, zadržati outbox i ponoviti uz idempotency. Reconcile sa providerom pre
ručne intervencije.

### Badi nedostupan

Ne duplirati receipt. Pošto Badi dokumentacija ne definiše provider idempotency ključ,
neuspešan ili nejasan poziv ide u `failed` i zahteva reconciliation pre ručnog retry-a.
Plaćanje ostaje evidentirano; zakonski rok pratiti sa knjigovođom.

### Pogrešan Spoke export

Zaustaviti korišćenje fajla, označiti export nevažećim, uporediti finalnu projekciju sa
zbirom i regenerisati. Ne popravljati ručno bez audit traga.

### Sumnja na kompromitovanu tajnu

Isključiti odgovarajući adapter, rotirati provider i lokalnu tajnu, invalidirati aktivne
session/magic link tokene po obimu, pregledati logove i eksternu aktivnost, pa tek onda
ponovo uključiti integraciju.

## Go-live uslovi

Produkcioni mode se ne uključuje samo postavljanjem env-a. Potrebni su: potpisan ugovor
sa tačno jednim payment providerom, sandbox acceptance, odobrena fiskalna logika,
verifikovan domen/email, consent/tag QA, privacy/terms/refund/delivery stranice, backup i
restore proba, admin allowlist/MFA plan i odobren rollback.

## Kontrolisani rollout i rollback

1. Deploy na staging sa `APP_ENV=test`, isključenim produkcionim integracijama i samo
   fiktivnim kupcima.
2. Pokrenuti CI i lokalni ručni regresioni scenario iz `docs/acceptance.md`.
3. Aktivirati i dokazati jednu integraciju odjednom: payment sandbox, Badi sandbox,
   email, pa consent/tag QA. Sačuvati ID test transakcija i potpis odgovorne osobe.
4. Napraviti enkriptovan backup, izvršiti restore u izolovanu bazu i reconciliation.
5. Postaviti alarme, dnevni Cron, on-call kontakt i prethodni deployment kao rollback
   kandidat. Zamrznuti migracije tokom launch prozora.
6. Tek kada su P01–P10 potpisani, postaviti produkcione tajne i aktivirati
   `ALLOW_PRODUCTION_INTEGRATIONS=true` za odobrene adaptere.
7. Posle puštanja proveriti jedan fiktivni/sandbox smoke tok bez stvarne naplate, zatim
   prvu stvarnu porudžbinu pratiti kroz order, payment, fiscal, email i delivery
   projekciju.

Rollback: odmah onemogućiti adaptere i nove card checkout-e, vratiti prethodni
deployment, ne vraćati bazu automatski i ne ponavljati nejasne spoljne pozive. Najpre
reconcile provider ID-eve i pending outbox, pa tek onda odlučiti o forward-fix migraciji
ili kontrolisanom restore-u. SQL rollback mora biti unapred testiran; `git reset` ili
brisanje produkcione baze nisu rollback procedura.
