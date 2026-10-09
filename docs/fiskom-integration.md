# Fiskom: povezivanje i rezultat provere pretplata

Provereno 11. septembra 2026. Ovo je predlog integracije za postojeći Next.js sajt na Vercelu; Fiskom/Teron pristup nije aktiviran i nisu izdavani stvarni fiskalni računi.

## Rezultat testiranja pretplata

Browser test `mixed cart checkout, magic-link login and subscription mutation work` prošao je na desktopu i mobilnom prikazu. Pokriva kupovinu, prijavu kupca, preskakanje, promenu količine i ritma, dodatak sledećoj dostavi, pauzu do datuma, ponovno učitavanje naloga, ručni nastavak i otkazivanje. Proverava i odbijanje zahteva bez porekla i zastarele verzije pretplate.

Dodate su četiri regresione provere u `tests/domain-sqlite.test.mjs`:

- Preskakanje uklanja robu iz sledeće pripreme, zadržava naredni termin i ne duplira promenu pri ponavljanju istog zahteva.
- Pauza do 1. marta uklanja januarske/februarske dostave; februar nema novi mesečni račun. Martovski obračun ima četiri nedeljne isporuke; prva je 5. marta. Zaključavanje te isporuke vraća status na aktivan.
- Dvonedeljna pretplata zadržava ritam: pauza do 1. februara vodi na 12. februar, a februarski obračun ima dve isporuke.
- Nevažeći datum i pokušaj pauze posle roka za izmenu odbijaju se bez promene pretplate.

Svih 22 testova domenskog fajla prošlo je na izolovanoj SQLite bazi. Testovi fiskalizacije u aplikaciji koriste zamenu za provajdera; ovo nije potvrda rada stvarnog Fiskom naloga.

Pauza počinje odmah. Budući period od–do nije podržan. Dugme za ručni nastavak aktivira pretplatu, ali trenutno zadržava već izračunati budući termin; ne pomera ga automatski na raniju isporuku.

## Dva proizvoda koja Fiskom nudi

| Put povezivanja | Potvrđeno javnim izvorom | Značenje za naš sajt |
| --- | --- | --- |
| SPARKOM | Fiskom navodi API plugin za platforme van WooCommerce/Shopify/PrestaShop. Opis prikazuje preuzimanje, fiskalizaciju i slanje mejla uz klik. | Tražiti API ugovor, testni pristup i potvrdu da konkretna licenca omogućava potpuno automatski tok. |
| e-Shop Autopilot / Teron | Ponuda koristi Vudux integraciju i Teron, uz aktivan nalog i VPFR konfiguraciju; gotovi dodaci namenjeni su WooCommerce/Shopify platformama. | Naš Next.js backend treba direktan adapter prema njihovom API-ju. Gotov dodatak se ne instalira u ovu aplikaciju. |

Izvori: [Fiskom SPARKOM E-Shop](https://fiskom.rs/e-shop-efiskalizacija/), [Fiskom e-Shop Autopilot](https://fiskom.rs/e-shop-autopilot/).

**Predlog:** ako korisnik već ima SPARKOM, prvo proveriti postojeću licencu i API. Ako tek bira uslugu, proveriti ponudu za Teron ESIR Cloud Middleware preko Fiskoma: javna dokumentacija daje konkretnu osnovu za razvoj. Ovo je tehnički predlog; cena njihovog gotovog dodatka ne potvrđuje cenu direktne integracije.

## Potvrđena Teron API osnova

Prema [zvaničnoj Teron dokumentaciji](https://api.teron.rs/):

- Cloud baza: `https://pos.teron.rs/api`.
- Zaglavlja: `Authorization: Bearer <API_KEY>` i `X-Teron-SerialNumber`.
- Izdavanje: `POST /api/invoices`, sa objektom `invoiceRequest`.
- Dokumentovani su prodaja, refundacija, avans i konačni račun, kao i elektronska dostava računa.
- `RequestId` je identifikator do 32 heksadecimalna znaka. Posle prekida veze status se proverava preko `GET /api/invoices/request/:requestId`. Dokumentacija ne daje osnov da se svaki neuspešan POST bez provere slepo ponovi.
- Odgovor sadrži broj računa, PFR vreme i verifikacioni link. Potrebno je sačuvati potvrđeni odgovor.

Testni nalog, okruženje, uslove licence i ponašanje pri duplim zahtevima potvrditi sa provajderom pre implementacije mrežnog adaptera.

## Šta već postoji u našoj aplikaciji

`server/integration-jobs.ts` ima Badi adapter, tabelu `fiscal_receipts`, trajni red `outbox` i prikaz grešaka u administraciji. `server/admin.ts`, checkout i mesečni obračun kreiraju događaj `fiscal.receipt.requested` kada je uplata evidentirana. Aplikacija trenutno podržava samo jedan redovan fiskalni račun po porudžbini preko ključa `receipt:<orderId>:sale`.

Postojeći adapter nije Fiskom adapter: naziv provajdera, Badi šifre artikala, autentifikacija i telo zahteva vezani su za Badi. Promena URL-a i ključa nije dovoljna.

`app/api/jobs/scheduled/route.ts` postoji, ali `vercel.json` ne definiše cron raspored. Iz repozitorijuma se ne može potvrditi da je podešen neki spoljašnji raspored. Za automatsku obradu zaostalih događaja potrebno je potvrditi ili postaviti zaštićeno periodično izvršavanje. Fiskalizacija ne treba da zavisi od ručnog otvaranja administracije niti od uspeha nepovezanog zadatka za dostave.

## Predloženi radovi nakon izbora provajdera

1. Odvojiti interfejs fiskalnog provajdera od Badi implementacije. Dodati izabran adapter i serverska podešavanja. Pristupni podaci ostaju na serveru.
2. Uvesti poreske oznake po artiklu, dostavi i drugim stavkama; sačuvati ih zajedno sa fiskalnim dokumentom. Ne pretpostavljati jednu stopu za ceo katalog. Mapiranje potvrđuju vlasnik i knjigovođa.
3. Sačuvati nepromenljiv sadržaj zahteva i jedinstveni identifikator pre slanja. Isti događaj, čak i posle pada procesa, mora koristiti isti identifikator i sadržaj.
4. Uvesti stanja za red čekanja, obradu, potvrđen račun, odbijen zahtev i nepoznat ishod. Nepoznat ishod prvo proveriti kod provajdera; ponavljanje dozvoliti tek nakon razrešenja. Jedinstveni zapis u našoj bazi sam ne sprečava duplikat kod provajdera.
5. Uvezati potvrđeni račun, vreme, proveru i dokument sa porudžbinom i nalogom kupca. Odvojiti slanje mejla od izdavanja računa, tako da neuspešan mejl ne pokreće novu fiskalizaciju.
6. Dodati avansne dokumente, konačne račune i refundacije sa referencama na original. Potreban je niz dokumenata po porudžbini/naplati/isporuci, umesto pretpostavke da svaka porudžbina ima samo jedan fiskalni dokument.
7. Testirati porudžbinu, više isporuka iste pretplate, pauzu posle avansa, delimični povraćaj, promenu artikla, popust, dostavu, dupli događaj, prekid veze i oporavak nakon uspeha kod provajdera a pre upisa u našu bazu.

## Naplata unapred i pouzeće

Mesečni obračun pretplate ne treba automatski poistovetiti sa konačnim fiskalnim računom za sve buduće isporuke. Poreska uprava navodi evidentiranje avansnih uplata za budući promet i povezivanje avansa sa konačnim prometom. Za naš model mesečne naplate i nedeljnih isporuka treba definisati tok avansa, isporuka, pauze i eventualnog povraćaja sa knjigovođom i provajderom. [Poreska uprava — obaveze obveznika fiskalizacije, strana 20](https://www.purs.gov.rs/upload/media/2026/2/2/760611/%D0%9E%D0%B1%D0%B0%D0%B2%D0%B5%D0%B7%D0%B5_%D0%BE%D0%B1%D0%B2%D0%B5%D0%B7%D0%BD%D0%B8%D0%BA%D0%B0_%D1%84%D0%B8%D1%81%D0%BA%D0%B0%D0%BB%D0%B8%D0%B7%D0%B0%D1%86%D0%B8%D1%98%D0%B5.pdf).

Trenutni uslov `payment_status === 'paid'` nije kompletan model za sve načine isporuke. Za pouzeće posebno utvrditi trenutak izdavanja i fiskalni način plaćanja prema tome ko naplaćuje kupcu i kako se novac prenosi trgovcu. Potvrda narudžbine ili CSV/Excel izvoz ne zamenjuju fiskalni dokument.

Interni kredit nakon preskakanja već plaćene isporuke nije dokaz izvršene fiskalne refundacije: to su odvojene evidencije koje nova integracija mora povezati. Pregledom `mutateSubscription` uočeno je i da obračun kredita za preskakanje/pauzu koristi vrednost proizvoda, bez posebno naplaćene dostave, i aktuelne cene proizvoda. Pre finansijske produkcione potvrde treba zasebno proveriti korekcije prema izvorno plaćenim stavkama i dogovorenim pravilima za naknadu dostave; navedeni prolazak testova ne potvrđuje te slučajeve.

## Upit spreman za Fiskom (nije poslat)

Poštovani,

Za prodavnicu Mleko i Mleko imamo sopstveni Next.js sajt na Vercelu. Želimo automatsku fiskalizaciju, bez ručnog prepisivanja ili potvrđivanja svake porudžbine. Prodajemo pojedinačne proizvode i pretplate sa nedeljnim/dvonedeljnim isporukama, mogućnošću pauze i preskakanja. Naplata može biti unapred ili pri isporuci.

Molimo da potvrdite koji proizvod i licenca odgovaraju ovom toku: SPARKOM API ili Teron ESIR Cloud Middleware preko vaše ponude. Potrebni su nam:

- API dokumentacija i izolovan testni pristup;
- mogućnost direktne HTTPS integracije iz našeg servera i cena takve licence;
- podrška za avanse, više isporuka, konačne račune i delimične refundacije;
- provera statusa zahteva nakon prekida veze i pravila ponavljanja bez duplog računa;
- podržani načini elektronskog slanja računa kupcu i uslovi VPFR konfiguracije;
- potvrda da ceo tok može raditi automatski, bez računara ili kase koji moraju stalno biti uključeni kod nas.

Hvala.

Kontakt iz Fiskom ponude: info@fiskom.rs, 037/44-22-42. Izvor: [Fiskom E-Shop stranica](https://fiskom.rs/e-shop-efiskalizacija/).
