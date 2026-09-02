# Integracije - ugovori i aktivacioni checklist

Kod u `integrations/` je provider-neutralan i ne šalje mrežne zahteve. Lokalni defaulti
su payment `disabled`, Badi `mock`, email `console` i WhatsApp `queue`. Produkcija ima
dvostruku zaštitu kroz konkretan mode i `ALLOW_PRODUCTION_INTEGRATIONS=true`.

## Kartično plaćanje: odluka pre implementacije adaptera

Brif koristi izraz "OTP/RaiAccept", ali to nisu dva naziva istog servisa. To su
odvojeni bankarski proizvodi sa odvojenim ugovorima i tehničkim protokolima. Izabrati
tačno jedan `PAYMENT_PROVIDER`.

OTP javno navodi API za nestandardne potrebe, card-on-file, recurring payment i testni
paket pre izdavanja produkcionih kredencijala. Izvor:
[OTP e-commerce](https://www.otpbanka.rs/e-commerce/).

RaiAccept javno navodi standardnu API integraciju i Sandbox za upoznavanje platforme,
ali javna marketinška stranica sama po sebi ne potvrđuje ugovor za tokenizaciju i
recurring za ovaj konkretan merchant model. Izvori:
[RaiAccept](https://www.raiffeisenbank.rs/sr/mala-privreda/prihvatanje-platnih-kartica/raiaccept.html)
i [RaiAccept dokumentacija](https://docs.raiaccept.com/).

Pre adaptera tražiti od izabrane banke:

- merchant/test nalog i tačnu verziju API dokumentacije;
- hosted payment/tokenization tok koji zadržava PAN/CVV van našeg sistema;
- eksplicitnu dozvolu za merchant-initiated mesečni recurring;
- 3DS/SCA pravila za inicijalnu i naredne naplate;
- sandbox i production base URL, merchant ID i način potpisivanja;
- katalog statusa, callback/webhook autentikaciju, retry pravila i IP listu;
- idempotency podršku, refund/void i čuvanje payment method tokena;
- pravila prikaza kartičnih brendova, uslova kupovine i politike povraćaja;
- test slučajeve za success, decline, timeout, duplicate webhook i refund.

Kanonski adapter interfejs:

```ts
interface PaymentAdapter {
  createOneTimeCheckout(command: PaymentCharge): Promise<PaymentResult>;
  createTokenizedCheckout(command: PaymentCharge): Promise<PaymentResult>;
  chargeRecurring(command: RecurringCharge): Promise<PaymentResult>;
  refund(command: RefundCommand): Promise<PaymentResult>;
  verifyAndParseWebhook(rawBody: Uint8Array, headers: Headers): PaymentWebhook;
}
```

Svi iznosi su integer + `RSD`; `operationId` je idempotency key. Adapter vraća
kanonske statuse, a ne sirove statuse banke. Sirov webhook se ne obrađuje pre provere
potpisa i timestamp/replay zaštite. Aplikacija ne loguje token kartice.

## Badi fiskalizacija

Badi dokumentacija navodi sandbox `https://api.sandbox.badi.rs/v2`, produkciju
`https://api.production.badi.rs/v2` i izdavanje računa preko
`POST /fiscalization/receipts`. Dokumentacija je označena kao nepotpuna i podržava
javni API, lokalni API i direktni VPFR režim. Izvor:
[Badi API dokumentacija](https://badi.rs/api-docs/).

Za ovaj projekat preporuka je:

1. lokalno: `mock`, bez spoljnog poziva;
2. integraciono testiranje: `sandbox`, javni Badi API;
3. produkcija: javni API, osim ako računovođa/operacije izričito zahtevaju lokalnu
   Badi aplikaciju;
4. direktni VPFR ne uvoditi bez zasebnog bezbednosnog dizajna za sertifikat, PFX
   lozinku i PAC.

`BADI_MODE=local` je dozvoljen samo za loopback URL. Badi lokalni API nema
autentikaciju, pa se port ne sme bindovati na LAN/Wi-Fi adresu. Za javni API tajne idu
isključivo u server runtime; nikad u `NEXT_PUBLIC_*`.

Pre sandboxa potvrditi sa Badi podrškom:

- client/store podešavanje, poreske oznake i SKU mapu proizvoda;
- kartica/gotovina/avans/konačni račun/refund scenario;
- email/PDF isporuku računa i obavezna polja kupca;
- idempotency očekivanje i lookup/reconciliation metod;
- računovodstveno ispravan trenutak fiskalizacije pretplate.

## Transakcioni email i WhatsApp-ready obaveštenja

Email je MVP kanal za magic link i sve potvrde iz brifa. Provider se bira kasnije;
domen mora imati SPF, DKIM i DMARC pre produkcije. Svaka poruka nastaje iz outbox-a,
ima template version, locale, aggregate ID i idempotency key.

Podržani event tipovi su u `integrations/contracts.mjs`: kreirana porudžbina,
aktivirana/izmenjena/pauzirana/nastavljena/otkazana pretplata, preskočena isporuka,
podsetnik, payment success/failure i izdat račun.

WhatsApp u MVP-u ne šalje poruke. `WHATSAPP_MODE=queue` čuva isti kanonski događaj bez
provider-specifičnog payload-a. Za buduću aktivaciju potrebno je:

- potvrđen business/sender nalog;
- odobreni template-i i lokalizovane varijante;
- dokaz opt-in saglasnosti i opt-out obrada;
- pravila 24-hour customer service prozora;
- delivery status webhook i suppression lista.

Magic link ne slati preko WhatsApp-a dok sigurnosni i operativni tok nije posebno
odobren. Email magic link je eksplicitni izbor za početak iz brifa.

## Spoke Route Planner CSV

`buildSpokeCsv()` generiše UTF-8 CSV sa BOM-om, CRLF redovima i jednim stopom po
finalnoj isporuci. Kolone su:

`Address Line 1`, `Address Line 2`, `City`, `Postal Code`, `Customer name`, `Phone`,
`Email`, `Notes`, `Order ID`, `Products`.

Sve ćelije su RFC 4180 quoted, a vrednosti koje Excel/Sheets može protumačiti kao
formulu dobijaju apostrof. Izvoz se generiše na zahtev iz baze; ne čuva zastareli CSV.

Pre operativne upotrebe u stvarnom Spoke nalogu importovati fixture od 3 reda
(zarez/navodnik, ćirilica/latinica, napomena sa novim redom), mapirati kolone i sačuvati
snimak/primer prihvaćenog fajla. Ako nalog zahteva druga imena kolona, promeniti samo
adapter i fixture test, ne domen.

## GA4, GTM, Meta i attribution

Sva merenja počinju tek posle consent odluke:

| Destination | Bez saglasnosti | Analytics | Marketing |
| --- | --- | --- | --- |
| interni operativni audit | dozvoljeno | dozvoljeno | dozvoljeno |
| GA4 / analytics tagovi | blokirano | dozvoljeno | dozvoljeno |
| Google Ads / Meta Pixel | blokirano | blokirano | dozvoljeno |

Public ID-evi mogu biti `NEXT_PUBLIC_*`; API tajne i server-side conversion tokeni ne
smeju. GTM container se objavljuje tek posle pregleda da ne učitava tagove pre consent-a.

Minimalni event ugovor:

| Događaj | Kada | Ključna polja |
| --- | --- | --- |
| `view_item` | prikaz proizvoda | item ID/name, cena |
| `add_to_cart` | potvrđen add | item, quantity, purchase type, cadence |
| `begin_checkout` | ulazak u checkout | items, value, currency |
| `purchase` | server potvrdi uspeh | order ID, value, currency, items |
| `subscription_activated` | aktivna pretplata | subscription ID, value |
| `subscription_frequency_selected` | izbor dinamike | weekly/biweekly |
| `apply_promotion` | validan promo kod | promo ID/code |
| `subscription_paused/cancelled` | server potvrdi promenu | pseudonymous ID |

`transaction_id`/`event_id` deduplikuje browser i server događaj. Event payload nema
ime, email, telefon, adresu ni magic-link podatke.

UTM/gclid/fbclid se normalizuju na ulazu i čuvaju kao first-touch + last-touch uz
session, a snapshot se vezuje za order. Maksimalna dužina je ograničena, kontrolni
znaci se uklanjaju i query se nikada ne kopira nekontrolisano u HTML/log.

## Reconciliation

Dnevni admin pregled treba da pokaže:

- naplate bez fiskalnog računa;
- fiskalne račune bez odgovarajuće naplate/keš porudžbine;
- payment webhook događaje koji nisu mapirani;
- outbox poruke u retry/dead-letter stanju;
- locked delivery bez Spoke reda ili proizvodnog zbira;
- razliku internog mesečnog ledger salda i provider settlement-a.

Reconciliation je read-only dok operater ne izabere eksplicitnu recovery akciju.
