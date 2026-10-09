# Naplata i fiskalizacija — implementacija i granice

Provera 17. septembra 2026. Ne sadrži pristupne podatke. Nijedna prava naplata ili fiskalni račun nisu izvršeni.

## Završene izmene u kodu

- Gotovinska naplata ostaje dostupna. Lokalni payment webhook sada odbija produkciono okruženje: nije bankarski adapter i više se ne može greškom uključiti samo postavljanjem tajne.
- Admin ima čitljiv pregled preostalih koraka za kartice i fiskalni servis. Dijagnostika ne prikazuje tajne i ne tretira njihove vrednosti kao dokaz uspešne integracije.
- Badi izdavanje je odvojeno od obrade drugih događaja. Pre POST zahteva trajno se čuvaju telo zahteva i stanje slanja. Konkurentni pokušaj, prekid veze, pad procesa ili nečitljiv odgovor ne mogu izazvati automatsko drugo izdavanje. Izdati odgovor se čuva pre ažuriranja prikaza računa, pa se taj prikaz može oporaviti bez drugog POST-a.
- Popusti se raspoređuju po stavkama do poslednje pare, bez globalnog popusta koji bi pogrešno umanjio i dostavu. Količine ostaju sačuvane; razlika od jedne pare se odvaja u dodatni red sa istim SKU-om. Prihvatanje tog konkretnog formata kod pravog servisa ostaje deo sandbox provere.
- HTTP 200 bez `invoiceNumber` nije izdat fiskalni račun. Isključena fiskalizacija ne označava dugovani račun kao trajno preskočen. Interna adresa ručne porudžbine ne šalje se servisu kao email kupca.
- Opšte dugme za ponavljanje neuspešnih događaja ne ponavlja fiskalizaciju. Ishodi `sending`, `unknown` i `rejected` zahtevaju proveru u servisu. Nije dodat automatski status lookup jer postojeći Badi ugovor ne daje pouzdan lookup po našem identifikatoru zahteva.

Tabela `fiscal_dispatches` dodata je migracijom 0014 (SQLite i PostgreSQL). Za nepoznat ishod operater mora kod provajdera proveriti broj računa i iznos, zatim kroz kontrolisanu administrativnu intervenciju uskladiti evidenciju; generičko requeue dugme to namerno ne rešava. Ova zaštita sprečava duplikat, ali ne dokazuje da spoljni račun nije izdat.

## Šta još zahteva banku i fiskalnog provajdera

Nije identifikovan izabran bankarski proizvod niti njegov ugovor/sandbox pristup. Primer konfiguracije navodi OTP i RaiAccept kao alternative; to nije izbor niti dokumentovan adapter. Potrebni su izabrani provider, hosted checkout/tokenization ugovor, recurring merchant prava i testni nalog. Ne treba slati tajne kroz chat; čuvaju se kao serverske environment promenljive.

Postojeći adapter je Badi. Korisnički dokument predlaže Fiskom/Teron, ali izbor nije potvrđen. Za promenu servisa potreban je njegov API ugovor, licenca, testni pristup i mapiranje artikala/poreskih oznaka. Pretplate koje se plaćaju unapred zahtevaju potvrđen poslovni tok avansa, pojedinačnih isporuka, konačnih računa i refundacija; trenutni jedan `normal/sale` račun nije kompletna implementacija tog toka. Interni kredit nije fiskalna refundacija.

Kartično plaćanje, tokenizacija i mesečna naplata zato nisu proglašeni završenim. Isto važi za prijem stvarnog fiskalnog dokumenta emailom.

Zvanična osnova proverena za postojeći adapter: [Badi API dokumentacija](https://badi.rs/api-docs/). Dokumentacija izdavanja prikazuje broj računa u odgovoru; potvrda POST-a bez tog broja se ne prihvata kao uspešna fiskalizacija.

## Testovi

`tests/fiscal-dispatch.test.mjs`: simulirani uspeh, replay sa nepromenljivim telom, konkurencija, pad procesa, mrežni prekid, neispravan JSON, odgovor bez broja, HTTP 400/500 i redigovana dijagnostika. Pet testova prolazi bez mreže. `tests/fiscal-amounts.test.mjs` dodaje tri prolazna testa iznosa sa popustom, dostavom, zaokruživanjem i korekcijama.

`tests/fiscal-receipts.test.mjs`: dodatne provere stvarnog API toka nad izolovanom SQLite bazom (posle rebuilda worker-a): izdavanje kroz mock HTTP, oporavak prikaza, zabrana ponavljanja i produkciono odbijanje mock webhooka. Konačan rezultat beleži glavni QA izveštaj.
