# MVP acceptance kriterijumi

Ovo je traceability lista iz brifa. "Prolazi" znači dokaz kroz automatizovani test ili
ponovljiv ručni scenario; samo postojanje UI elementa nije dovoljno.

## P0 - mora raditi lokalno

- [ ] Katalog vraća samo aktivne proizvode i cene u RSD.
- [ ] U jednoj korpi kupac kombinuje `one_time`, `weekly` i `biweekly` po stavci.
- [ ] Checkout ne veruje ceni/totalu iz browsera i zahteva idempotency key.
- [ ] Cash checkout ostaje pending, a mock-card koristi samo token/reference, bez PAN/CVV.
- [ ] Mesečni obračun broji stvarne termine u kalendarskom mesecu (uključujući 5
  nedeljnih termina gde postoje).
- [ ] Magic link je jednokratan, ističe i ne otkriva da li nepoznat email postoji.
- [ ] Nalog prikazuje sledeći datum i sve planirane stavke/količine.
- [ ] Korisnik može promeniti količinu/dinamiku, dodati/ukloniti stavku, dodati
  `next_delivery_addon`, skip, pause, resume i trajno cancel.
- [ ] Svaka korisnička izmena proverava cutoff server-side; test postoji za tačno pre,
  tačno na i posle roka, kao i DST datum u `Europe/Belgrade`.
- [ ] Izmena već plaćenog meseca stvara append-only kredit/zaduženje, ne prepisuje račun.
- [ ] Delivery generator je idempotentan i regeneriše otvorenu projekciju iz aktuelnih
  podataka; zaključana projekcija se ne menja bez admin override-a.
- [x] Dnevni zbir i lista kupaca potiču iz iste finalne delivery projekcije.
- [x] Spoke CSV sadrži sve minimalne kolone, UTF-8 je, escape-uje navodnike/nove redove i
  neutralizuje formule.
- [x] Excel izvoz ima zasebne listove za Spoke dostave i zbirnu pripremu robe.
- [ ] Admin može CRUD proizvode i vidi kupce, pretplate, porudžbine, isporuke, zbir i CSV.
- [ ] Admin write akcije imaju autentikaciju, validaciju, audit i structured error.
- [x] Outbox zapis nastaje u istoj transakciji kao poslovna promena i aplikacioni
  idempotency ključ ne duplira efekat.

## P0 - integracione granice

- [x] OTP i RaiAccept su međusobno isključiv config izbor.
- [x] Lokalni default ne može pozvati produkcionu naplatu/fiskalizaciju.
- [x] Production mode zahteva dodatni `ALLOW_PRODUCTION_INTEGRATIONS` prekidač.
- [x] Kanonski payment ugovor odbija sirove kartične podatke.
- [x] Badi sandbox/production endpointi i receipt path su centralizovani.
- [x] Email/WhatsApp događaji imaju stabilan kanonski katalog.
- [x] Consent default je denied; GA4/GTM i Meta/Ads imaju odvojene gate-ove.
- [x] Attribution čuva allowlisted UTM/click ID parametre i ne kopira proizvoljan query.
- [ ] Provider adapteri nisu production-ready dok se ne dobiju ugovori/test credentials.
- [ ] Badi tok nije production-ready dok knjigovođa ne potvrdi avans/final/refund pravila.

## P1 - javni frontend i SEO

- [x] Home, prodavnica, proizvod, korpa, checkout, prijava/nalog i admin rute imaju
  funkcionalne basic prikaze i jasna prazna/error/loading stanja.
- [ ] Mobile širina nema horizontalni overflow; controls imaju dostupne labele i fokus.
- [x] Svaka indeksabilna stranica ima jedinstven title, description i jedan H1.
- [x] Admin, nalog, checkout i korpa su `noindex` gde je prikladno.
- [x] `sitemap.xml` i `robots.txt` postoje; production base URL dolazi iz env-a.
- [x] Slike imaju dimenzije, lazy loading gde je prikladno i smislen alt.
- [x] 404 i provider/API failure ne prikazuju stack/tajnu.

## P1 - obaveštenja i analitika

- [x] Email outbox događaji postoje za porudžbinu, obračun, uplatu, pretplatničke izmene,
  magic link i podsetnik.
- [x] Reminder se računa iz stvarne delivery projekcije za izabrani datum.
- [ ] Template prikazuje sledeći datum, poslednji rok i self-service link.
- [ ] `purchase` se emituje jednom tek po server-confirmed uspehu.
- [ ] `view_item`, `add_to_cart`, `begin_checkout`, `purchase`, subscription activation,
  cadence, promo i pause/cancel imaju dokumentovan payload i test deduplikacije.
- [ ] GTM container QA potvrđuje da nijedan vendor tag ne radi pre odgovarajućeg consent-a.
- [ ] First/last touch snapshot ostaje vezan za order radi channel/campaign izveštaja.

## Obavezni ručni acceptance pre produkcije

1. Banka: success, decline, 3DS, abandon, timeout, recurring success/failure, dupli i
   out-of-order webhook, refund.
2. Badi: card/cash, avans/final, email PDF, retry, duplikat i refund.
3. Spoke: realni nalog prihvata CSV bez ručnog sređivanja za srpsku adresu i dijakritiku.
4. Email: SPF/DKIM/DMARC, inbox/spam, bounce i magic-link one-time tok.
5. Privacy: consent accept/reject/povlačenje i browser/tag network inspekcija.
6. Operacije: petak sa više kupaca - zbir, lista i CSV daju identične količine.
