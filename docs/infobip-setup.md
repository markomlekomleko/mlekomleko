# Infobip: aktivacija za Mleko i Mleko

Pripremljeno 12. septembra 2026. Integracija u repozitorijumu postoji; Infobip nalog,
WhatsApp poslovni broj, odobrenja i produkcioni ključevi još nisu napravljeni niti
povezani. Testovi koriste lokalne kodove i simulirane API odgovore. Ne predstavljaju
potvrdu da je stvarna poruka stigla na telefon ili email.

## Kako kupac koristi nalog

1. Na `/prijava` bira „Napravi nalog“, unosi email i lozinku od 12–128 znakova.
2. Potvrđuje email šestocifrenim kodom. Tek tada nastaju pristupni podaci i sesija.
   Ako već ima porudžbine na tom emailu, zadržava ih i postojeće podatke za dostavu.
3. U `/nalog`, u delu „Prijava i WhatsApp“, unosi svoj broj i prihvata prijavne kodove.
   Posebnim kodom dokazuje da kontroliše broj. Broj iz porudžbine nije dokaz vlasništva.
4. Kasnije unosi email i bira email, WhatsApp ili oba. Lozinku ne unosi ponovo.
   Kod poslat na oba kanala je isti; dovoljan je jedan unos. To nije dvofaktorska prijava.
5. Posebno može da uključi obaveštenja o porudžbinama/dostavama i da ih isključi ili
   ukloni WhatsApp broj. Email ostaje način pristupa.

Lozinka je trenutno potrebna pri registraciji i čuva se kao scrypt hash. Nije dodatni
faktor pri kasnijoj prijavi i nema zaseban tok prijave ili oporavka lozinkom.

## 1. Otvaranje Infobip naloga i WhatsApp broja

Vlasnik otvara [Infobip nalog](https://portal.infobip.com/) poslovnim emailom i
završava verifikaciju koju portal traži. Potrebni su podaci firme i telefon koji
vlasnik kontroliše. Trial služi za probu sa potvrđenim primaocima; za kupce se
registruje sopstveni sender. [Infobip početak](https://www.infobip.com/docs/whatsapp/get-started).

U portalu: **Channels and Numbers → Channels → WhatsApp → Register sender**.
Povezuje se Meta Business nalog i poslovni broj kroz ugrađeni postupak. Za novi
broj pratiti granu za povezivanje postojećeg broja izvan Infobip-a; mora biti moguće
primiti verifikacioni poziv ili poruku. Obična WhatsApp Business aplikacija na telefonu
nije preduslov za ovaj API tok. Sačuvati broj sender-a kada registracija uspe.
Meta/Infobip mogu tražiti dodatnu proveru firme i imena pošiljaoca.
[Registracija sender-a](https://www.infobip.com/docs/whatsapp/get-started/embedded-signup).

Ne otvarati developersku platformu za preprodaju WhatsApp-a drugim firmama: ovde
povezujemo sopstveni posao. Troškove i dostupnost željenog broja potvrditi u nalogu
pre uključivanja prometa. Nismo izvršili kupovinu broja niti dopunu kredita.

## 2. API pristup

U Infobip portalu otvoriti deo za API ključeve. Napraviti zasebne ključeve za ovaj sajt:

| Namena | Prava ključa | Server promenljiva |
| --- | --- | --- |
| WhatsApp slanje | `whatsapp:message:send` | `WHATSAPP_API_KEY` |
| Email slanje | `email:message:send` | `EMAIL_API_KEY` |

Kopirati account-specific Base URL iz portala u `INFOBIP_BASE_URL`, sa `https://`.
Aplikacija šalje `Authorization: App …`; ključevi se nikada ne šalju pregledaču.
Zabeležiti datum isteka i planirati zamenu ključa. Šablone je najlakše praviti u
portalu; aplikaciji nisu potrebna administrativna prava za šablone.
[API autentifikacija](https://www.infobip.com/docs/essentials/api-essentials/api-authentication),
[API prava](https://www.infobip.com/docs/essentials/api-essentials/api-authorization).

Ključeve upisati u server environment hostinga ili u ignorisani `.env.local`.
Ne slati ih u chat, ne stavljati ih u Git i ne koristiti prefiks `NEXT_PUBLIC_`.

## 3. Email domen

Aktivirati Email kanal i dodati domen sa kog se šalje, npr. poddomen za transakcione
poruke. U DNS upisati konkretne zapise koje Infobip generiše, pa sačekati potvrdu
domena. Ne izmišljati SPF/DKIM vrednosti. Podesiti i DMARC u skladu sa postojećom
email postavkom. `EMAIL_FROM` mora pripadati potvrđenom domenu.
[Email i domen](https://www.infobip.com/docs/email/get-started-with-email).

Aplikacija koristi podržani Email v3 `POST /email/3/send`, multipart formu sa
`from`, `to`, `subject`, `text`, `html`; praćenje je isključeno. I registracioni
kodovi i postojeće transakcione email poruke koriste isti odabrani provider.
Ako se zadržava raniji Resend, postaviti `EMAIL_PROVIDER=resend` i njegov ključ;
WhatsApp i dalje ostaje na Infobip-u.
[Email HTTP API](https://www.infobip.com/docs/email/email-over-api/send-email-over-http-api).

## 4. WhatsApp šabloni

**Prijavni kod:** napraviti Authentication šablon `mm_login_code`, jezik `sr`
ako ga portal nudi, rok 5 minuta i Copy code dugme. Ako izaberete drugi jezik,
promeniti `WHATSAPP_TEMPLATE_LANGUAGE` da tačno odgovara odobrenju.
Pripremljen API payload je `integrations/infobip/auth-template.json`.
Predaja preko API-ja, ako se bira taj način, koristi
`POST /whatsapp/2/senders/{sender}/templates` i zaseban ključ sa pravom upravljanja
WhatsApp šablonima. Payload nije automatski poslat.

Za slanje aplikacija koristi `POST /whatsapp/1/message/template`, kod u body
placeholder-u i u parametru dugmeta tipa `URL` — to je Infobip format Copy code
dugmeta, nije link koji direktno otvara sesiju. Sačekati status odobrenja pre aktivacije.
[Infobip autentifikacioni šabloni](https://www.infobip.com/docs/tutorials/authenticate-users-with-whatsapp-template-messages).

**Obaveštenja:** u portalu predati Utility šablon, predloženo ime `mm_account_update`:

> Informacije o vašoj porudžbini ili pretplati su ažurirane. Otvorite svoj nalog da
> pogledate detalje i sledeću dostavu.

Dugme: **Otvori moj nalog**. Statički URL: `https://VAS_DOMEN/nalog`. Bez promenljivih.
Kategoriju i tekst konačno odobrava Meta; ako traži konkretniji kontekst, prilagoditi
šablon i adapter pre uključivanja. Upisati ime odobrenog šablona u
`WHATSAPP_UPDATE_TEMPLATE`. Prazna vrednost isključuje ovaj tok.
[Vrste i odobrenja šablona](https://www.infobip.com/docs/whatsapp/message-types-and-templates/message-templates).

Kodovi se šalju odmah po zahtevu. Obaveštenja su posebni outbox poslovi za potvrdu
porudžbine, obračun, uplatu, podsetnik i promene pretplate. Slanje proverava važeću
saglasnost, pa isključivanje obaveštenja važi i za već pripremljene poslove.

## 5. Produkciona podešavanja

```dotenv
AUTH_MODE=provider
AUTH_CODE_SECRET=<slucajna-tajna-od-najmanje-32-znaka>
INFOBIP_BASE_URL=https://<vas-nalog>.api.infobip.com
EMAIL_MODE=provider
EMAIL_PROVIDER=infobip
EMAIL_API_KEY=<email-api-kljuc>
EMAIL_FROM="Mleko i Mleko <prijava@VAS_DOMEN>"
WHATSAPP_MODE=provider
WHATSAPP_PROVIDER=infobip
WHATSAPP_API_KEY=<whatsapp-api-kljuc>
WHATSAPP_SENDER_ID=<potvrdjeni-poslovni-broj-sa-pozivnim-brojem>
WHATSAPP_AUTH_TEMPLATE=mm_login_code
WHATSAPP_TEMPLATE_LANGUAGE=sr
WHATSAPP_UPDATE_TEMPLATE=mm_account_update
```

Generisati `AUTH_CODE_SECRET` menadžerom lozinki ili generatorom kriptografskih
tajni. Rotiranje ove tajne poništava sve još neiskorišćene kodove.
Primeniti migraciju `0013_customer_login_codes.sql` odgovarajućim postojećim
postupkom (`npm run db:migrate`, odnosno `npm run db:migrate:local` samo lokalno).
Migracije postoje i za SQLite/D1 i za PostgreSQL. Ne menjati već primenjene migracije.

Pokrenuti `npm run infobip:check`. Provera je lokalna: ispisuje nazive nedostajućih
podešavanja, nikada ključeve, i ništa ne šalje. Zatim deploy novog koda i serverskih
promenljivih. Za outbox obaveštenja održavati postojeći scheduler na
`GET /api/jobs/scheduled`, sa `Authorization: Bearer <CRON_SECRET>`; preporučeno na
svakih 5 minuta, uz ograničenja hosting plana. Login kodovi ne zavise od scheduler-a.

## 6. Proba pre puštanja kupcima

Na sopstvenoj test adresi napraviti nalog i uneti kod iz pravog emaila. Povezati
sopstveni telefon kodom iz WhatsApp-a. Odjaviti se i probati svaki kanal, uključujući
oba istovremeno. Proveriti spam fasciklu, istek koda, ponovno slanje i uklanjanje broja.
Uključiti obaveštenja, napraviti test porudžbinu i proveriti da dugme vodi na pravi
nalog. Posle isključivanja obaveštenja, sledeći događaj ne sme poslati WhatsApp poruku.

API status „accepted/pending“ znači da je provider preuzeo poruku, ne da je korisnik
primio ili pročitao. Stvarnu isporuku proveriti kroz Infobip Reports/Analyze.
Webhook potvrde isporuke i automatsko reagovanje na dolazno „STOP“ nisu deo ove
verzije; odjava je dostupna u nalogu. Ako korisnik traži odjavu porukom, podrška mora
obraditi zahtev pre daljeg slanja. Kodove ne snimati u analitiku ili sistemske logove.

Jedan uspešan kanal dovoljan je kod slanja na oba. Ako oba API zahteva propadnu,
challenge se uklanja i korisnik dobija mogućnost ponovnog pokušaja. Kodovi ne idu u
outbox kako se ne bi čuvali u otvorenom tekstu i naknadno slali nakon isteka.
Transakciona obaveštenja imaju ponovne pokušaje; kod ne tvrdi da Infobip deduplikuje
svaki zahtev po `messageId`, pa posle nejasnog timeout-a može stići duplikat.

## Lokalni razvoj

`AUTH_MODE=local`, `APP_ENV=local` i loopback adresa omogućavaju testiranje bez
provajdera. Kod se prikazuje isključivo u tom režimu. Na Vercel-u i u produkciji
ovaj režim ne radi. Nova prijava nikada ne koristi `LOCAL_AUTH_EXPOSE_TOKEN` kao
produkcioni bypass. Dok je `AUTH_MODE` postavljen, stari endpoint za izdavanje
magic linkova vraća 410. Ranije izdati linkovi mogu se iskoristiti do svog isteka.

Početno postavljanje koje traži vlasnika: otvaranje naloga, Meta prijava, potvrda
broja, DNS pristup i unos tajni. Sve ostalo je pripremljeno za proveru u repozitorijumu.

## Izvršene provere

- Novi API testovi: 12/12, uključuju registraciju, vezivanje postojećeg kupca,
  jednokratnu upotrebu i konkurentne zahteve, istek, ograničenja po primaocu,
  potvrdu broja, oba kanala, provider greške, odjavu i obaveštenja uz saglasnost.
- Mobilni i desktop E2E: 6/6 za novu registraciju, poručivanje pa registraciju i
  ograničenje zahteva; dodatna provera konačnog prikaza registracije 2/2.
- `npm run test:vercel`: build uspešan; 14 testova prolazi, 1 Supabase test preskočen
  jer test PostgreSQL veza nije podešena. Migracije su pripremljene za PostgreSQL,
  ali nisu izvršene na udaljenoj produkcionoj bazi.
- `npm run typecheck` i ESLint izmenjenih modula prolaze. Lokalna migracija primenjena.
- Celokupni `npm test`: 70/74. Četiri testa server-renderovanog storefronta i dalje
  padaju na proverama logotipa, naslova kataloga, broja H1 elemenata i širokom
  regex-u `stack` u HTML-u. Te provere nisu menjane u ovom poslu.
- Celokupni lint i dalje prijavljuje prazne catch blokove u postojećim
  `scripts-tmp-menuanim.mjs` i `scripts-tmp-menutest.mjs`; te datoteke nisu menjane.
- `npm run infobip:check` potvrđuje da produkciona podešavanja još nedostaju.
