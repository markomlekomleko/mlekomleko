# Production acceptance i evidencija

`[x]` znači da postoji ponovljiv automatizovan dokaz u repozitorijumu. `[ ]` znači da
je scenario precizno definisan, ali zahteva spoljan nalog, odobrenje ili ručni dokaz pre
launch-a. Lokalni testovi koriste isključivo fiktivne kupce.

## Automatizovani P0/P1 kriterijumi

- [x] Katalog vraća samo aktivne proizvode i cene u RSD.
  Dokaz: `tests/rendered-html.test.mjs` — products API contract.
- [x] Mešovita korpa kombinuje jednokratnu, weekly i biweekly kupovinu po stavci, a
  checkout ponovo računa cenu na serveru i zahteva idempotency key.
  Dokaz: Playwright mixed-cart tok i checkout API testovi.
- [x] Cash ostaje `pending`; kartični tok prima samo neproziran provider token i odbija
  PAN/CVV pre pristupa bazi.
  Dokaz: checkout API i payment-contract testovi.
- [x] Mesečni obračun i quote koriste konkretne datume preostalih termina, uključujući
  mesece sa četiri/pet petaka i biweekly anchor.
  Dokaz: `tests/business-calendar.test.mjs` i weekly quote API test.
- [x] Svi poslovni datumi/cutoff koriste `Europe/Belgrade`; testirani su prelazak meseca,
  letnje/zimsko računanje vremena i tačno pre/na/posle cutoff-a.
  Dokaz: `tests/business-calendar.test.mjs`.
- [x] Magic-link tok koristi one-time exchange, ne vraća session token i čuva sesiju u
  `HttpOnly` cookie-ju; replay je odbijen, logout postoji, a odgovor na zahtev za link je
  generičan.
  Dokaz: Playwright login/replay tok i API ugovor.
- [x] Magic-link zahtevi imaju per-IP/per-identity rate limit; checkout i validni payment
  webhook imaju odgovarajuće rate-limit tačke.
  Dokaz: Playwright rate-limit tok i route testovi.
- [x] Cookie-auth write akcije odbijaju zahtev bez ispravnog `Origin`-a, subscription
  query je vezan za customer ID, a admin/payment webhook odbijaju loše kredencijale pre
  čitanja baze.
  Dokaz: Playwright CSRF scenario i API credential test.
- [x] Izmena pretplate zahteva `expectedVersion`, vraća novu verziju i daje strukturirani
  `409` sa `requestId` pri zastareloj/konkurentnoj izmeni.
  Dokaz: Playwright subscription conflict scenario.
- [x] Nalog prikazuje pretplatu i sledeću isporuku, a korisnik može izvršiti server-side
  skip uz osvežen prikaz.
  Dokaz: Playwright checkout → login → nalog → skip scenario.
- [x] Delivery API za negenerisan datum vraća normalno prazno stanje sa `canGenerate`, a
  admin ekran nudi akciju „Generiši”.
  Dokaz: API empty-state test i UI source.
- [x] Dnevni zbir, lista kupaca, CSV i XLSX nastaju iz iste delivery projekcije.
  CSV je UTF-8, RFC 4180 escaped i formula-safe; XLSX ima `Dostave` i `Priprema`.
  Dokaz: export API testovi.
- [x] Browser `/api/events` ne prihvata revenue događaje. `purchase` nastaje u
  idempotentnom server-side outbox-u tek kada je naplata potvrđena i čuva stabilne
  `eventId`/`transactionId` vrednosti.
  Dokaz: browser rejection API test, integration contract i outbox unique key.
- [x] First-touch i last-touch attribution su allowlisted, čuvaju se kroz navigaciju i
  snapshot-uju na porudžbini bez emaila, telefona, adrese ili proizvoljnog query-ja.
  Dokaz: attribution unit/API testovi.
- [x] Analytics i marketing saglasnost su odvojene, početno odbijene i korisnik može
  ponovo otvoriti podešavanja iz footera radi povlačenja.
  Dokaz: analytics contract test i javni UI.
- [x] Produkcioni HTTPS odgovor ima CSP/HSTS i ostale sigurnosne headere; strukturirane
  API greške imaju `requestId` u telu i `X-Request-Id` header.
  Dokaz: production-header API test.
- [x] Mobilna navigacija ima sve glavne destinacije, nema horizontalni overflow na
  390/768/1440 px i glavne kontrole imaju minimalni touch target 44×44 px.
  Dokaz: Playwright responsive scenario i CSS pravilo.
- [x] Home, prodavnica, checkout i privacy nemaju axe serious/critical nalaze na sva tri
  viewporta; fokus je vidljiv, forme imaju labele i status poruke.
  Dokaz: Playwright + axe scenario.
- [x] Indexabilne stranice imaju jedinstven title, description/canonical i jedan H1;
  postoje sitemap, robots, JSON-LD, pravi noindex 404 i private-page noindex.
  Dokaz: rendered HTML/SEO testovi.
- [x] Kritične fotografije su lokalne AVIF/WebP varijante, nemaju ugrađen tekst
  „8 litara”, a dupli veliki OG PNG je uklonjen.
  Dokaz: asseti pod `public/images` i storefront HTML.
- [x] Postoje i povezane stranice za uslove kupovine, privatnost/cookies, dostavu,
  reklamacije/povraćaj i pravila pretplate.
  Dokaz: sitemap/rendered routes i footer navigacija.
- [x] Subscription poruke prikazuju sledeći datum, cutoff i self-service link.
  Dokaz: notification contract test.
- [x] CI blokira lint, production build + unit/API/integration testove i Playwright E2E
  sa accessibility proverom.
  Dokaz: `.github/workflows/ci.yml`.

## Lokalni ručni regresioni scenario

Ovaj scenario je ponovljiv bez spoljnih servisa i mora se potpisati na staging
release-candidate verziji:

1. Napraviti fiktivnog kupca sa weekly i biweekly stavkom, proveriti konkretne datume,
   cenu po isporuci, broj termina, mesečni zbir, dostavu i cutoff.
2. Prijaviti se magic linkom, pa redom na novim test pretplatama proveriti
   `update_item`, `remove_item`, `add_next_only`, `skip_next`, `pause`, `resume` i
   terminalni `cancel`. U dva prozora potvrditi `409` na staroj verziji.
3. Za već plaćen mesec smanjiti/ukloniti stavku i proveriti novi append-only ledger red;
   sledeći obračun mora primeniti kredit bez izmene starog računa.
4. Dvaput pokrenuti checkout, billing i delivery sa istim idempotency ključem, zatim sa
   novim ključem regenerisati otvorenu projekciju. Zaključana projekcija mora ostati
   nepromenjena.
5. U adminu proveriti proizvode, kupce, pretplate, porudžbine, prazan petak, generisanje,
   zaključavanje, zbir, listu, CSV/XLSX i audit poslednje write akcije.
6. Keyboard-only proći header, prodavnicu, korpu, checkout, consent, prijavu, nalog i
   admin; zatim VoiceOver/NVDA proveriti checkout greške i potvrdu porudžbine.

## Obavezni spoljni launch gate-ovi

- [ ] **Payment P01:** vlasnik bira tačno jedan OTP/RaiAccept ugovor i dostavlja sandbox
  dokumentaciju/kredencijale. Test dokaz mora pokriti success, decline, 3DS, abandon,
  timeout, recurring success/failure, dupli i out-of-order webhook i refund.
- [ ] **Badi P02:** knjigovođa odobrava kartica/gotovina, avans/final, kredit i refund;
  sandbox dokaz pokriva PDF/email, retry, duplicate i reconciliation.
- [ ] **Spoke P03:** pravi nalog prihvata izvoz sa srpskom adresom, dijakritikom, zarezom,
  navodnikom, novim redom i formula-like sadržajem bez ručne obrade.
- [ ] **Email P04:** produkcioni domen ima SPF/DKIM/DMARC; inbox/spam, bounce/suppression
  i one-time magic-link tok su provereni. WhatsApp ostaje isključen iz v1.
- [ ] **Privacy P05:** pravnik odobrava objavljene tekstove i retention; network
  inspekcija potvrđuje da GA4/GTM/Meta ne rade pre odgovarajuće saglasnosti i da
  povlačenje zaustavlja buduće tagove.
- [ ] **Sadržaj P06:** vlasnik dostavlja finalne fotografije/cene/pravila i dokumentaciju
  za svaku tvrdnju o kvalitetu. Nedokazane tvrdnje ostaju neobjavljene.
- [ ] **Admin P07 (izmenjen zahtev vlasnika):** implementirana prijava preko
  `ADMIN_USERNAME` i `ADMIN_PASSWORD`, obavezna pri svakom otvaranju/refresh-u,
  opoziv sesije i ograničenje pokušaja. Pre launch-a postaviti vrednosti u Vercel
  environment i proveriti na javnom domenu. MFA/uloge nisu deo ovog dogovorenog toka.
- [ ] **Operacije P08:** enkriptovan backup i restore proba, payment↔order↔fiscal
  reconciliation, alarmi, incident drill i dokumentovan rollback su potpisani.
- [ ] **Performance P09:** na produkcionom/staging URL-u Lighthouse potvrđuje LCP ≤2,5 s,
  CLS ≤0,1 i TBT ≤200 ms, a real-user p75 INP ≤200 ms nakon dovoljnog uzorka.
- [ ] **Security P10:** dependency/secret scan nema critical nalaz; staging test potvrđuje
  TLS/CSP/HSTS, rate limit i da PII/tajne/PAN/CVV nisu u logovima ili telemetry-ju.

Produkcija se ne uključuje dok je bilo koji P0/P01–P10 gate otvoren. Staging koristi
isključivo fiktivne kupce.
