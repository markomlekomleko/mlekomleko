# Agent E — UI/UX, pristupačnost, performanse (Faza 7) — 2026-11-04

Okruženje: dev server http://localhost:3100 (Next dev, sporiji i veći JS nego produkcija), Chromium (Playwright), axe-core 4 (wcag2a/aa, wcag21a/aa, best-practice). Prefiks TEST-E-, IP 198.51.100.50. Bez izmena koda.
SH = `/private/tmp/claude-501/-Users-luka-Documents-ChatGPT-mleko-mleko-v2--claude-worktrees-saas-fiscalization-testing-b99bd3/80cef03a-d713-4019-be9b-6fdbce271876/scratchpad/agent-e/shots/` (screenshotovi: `<stranica>-<širina>.png` za svih 22 stranice × 360/768/1280/1920; `v-*` viewport/drawer/meni; `c-*` checkout tok; `a-*` admin 1280). Sirovi podaci: `/private/tmp/claude-501/-Users-luka-Documents-ChatGPT-mleko-mleko-v2--claude-worktrees-saas-fiscalization-testing-b99bd3/80cef03a-d713-4019-be9b-6fdbce271876/scratchpad/agent-e/sweep-all.json`, `detail.json`, `admin-1280.json`.
Napomena o alatu: axe je validiran (injektovan loš element → button-name, image-alt, color-contrast pronađeni), dakle prazni rezultati su stvarni.

## 1. Rezime
- 62 slučaja: 27 PASS, 35 FAIL (0 Kritično, 3 Visoko, 14 Srednje, 18 Nisko).
- axe: 0 povreda na svih 22 javnih stranica (360 i 1280), na /nalog (prijavljen), checkout (popunjen) i potvrdi; u adminu 1 minor (empty-table-header, Porudžbine). Bez horizontalnog skrola ni na jednoj stranici/širini.
- Najveći problemi nisu u axe-u nego u vizuelnoj/logičkoj sferi: /nalog je vizuelno pokvaren (E-001), dodavanje u korpu nema povratnu informaciju (E-003), telefon "abc" prolazi (E-004), engleske greške (E-005/006/007).

## 2. Tabela slučajeva
| ID | Uloga | Koraci | Očekivano | Stvarno | Status | Ozbiljnost |
|---|---|---|---|---|---|---|
| E-001 | Kupac | /nalog 360 i 1280 | Kartice bez praznina | Svaki h1/h2/h3/p u .account-dashboard ima margin-top 116px (=--header-stack); naslovi plutaju 104–273px ispod vrha kartice, ogromne praznine (SH account-1280.png, account-360.png) | FAIL | Visoko |
| E-002 | Gost | Prvi ulazak, 360 | Banner ne zaklanja sadržaj | Consent banner je fixed i zauzima ~375 od 780px (48%) na 360; klase iz CSS-a (.consent-banner-actions/-title) se ne koriste u TSX pa dizajn 2×1 dugmadi i display naslov ne važe; id consent-heading se ne referencira (aria-labelledby nedostaje); role=dialog bez fokusa | FAIL | Srednje |
| E-003 | Gost | Proizvod → Dodaj u korpu | Vidljiva/čitaču najavljena potvrda (toast/drawer) | Samo se menja broj na ikoni; nema aria-live, drawer se ne otvara | FAIL | Visoko |
| E-004 | Gost | Checkout, telefon "abc" | Odbijeno sa porukom | Porudžbina prihvaćena (MM-20261104-_8OJYJHQ, phone="abc" u customers i shipping_json); server samo requiredString (server/commerce.ts:197), polje bez pattern/tel validacije | FAIL | Visoko |
| E-005 | Gost | /prijava, email "a@b" | Poruka na srpskom | Prikazuje "Email address is invalid." (server/domain.ts:55) | FAIL | Srednje |
| E-006 | Kupac/Gost | Pregled poruka servera | Sve poruke na srpskom | Engleske, korisniku dostižne: "This delivery is past its change deadline…" (server/time.ts:55 — viđeno i pri checkout API pozivu), "Checkout is still being processed." (commerce.ts:186), "Customer session is invalid or expired." (auth.ts:110), "Subscription was not found.", "Order was not found.", "Only a paused subscription can be resumed.", "Product is unavailable.", "Request body is not valid JSON.", "email is required.", "items must contain 1-50 items." | FAIL | Srednje |
| E-007 | Gost | Prazna/neispravna polja forme | Poruke na srpskom, najavljene | Nativna HTML validacija ("Please include an '@'…") jezik pregledača, nema noValidate/aria-invalid/aria-live | FAIL | Srednje |
| E-008 | Gost | Potvrda porudžbine / kalendar | Jedna tačka | "utorak, 10. novembar 2026.." (checkout-form.tsx:208, delivery-calendar.tsx:71; isto subscription-card.tsx:480) jer formatDate već završava tačkom | FAIL | Nisko |
| E-009 | Svi | Poređenje datuma | dd.mm.gggg. i dosledno | Nigde dd.mm.gggg.; dugi mesec "petak, 06. novembar 2026." (2-digit, frontend.ts:325) vs "četvrtak, 5. novembar 08:00" (numeric, frontend.ts:362) u istom drawer-u; "4. septembar 2026." na politikama | FAIL | Nisko |
| E-010 | Svi | Iznosi UI vs email | Isti format sa decimalama po potrebi | UI: maximumFractionDigits:0 (frontend.ts:311) zaokružuje pare ("+333 RSD" za 333,33); email: minimumFractionDigits:0 (notifications.ts:12) → "1.234,5 RSD" (jedna decimala). Nedoslednost, ukupni iznos u emailu može se razlikovati od UI | FAIL | Srednje |
| E-011 | Admin | Export (order-export.ts:24,30–38) | Datumi dd.mm.gggg., iznosi RSD | Statički pregled: "Datum porudžbine" = sirovi ISO created_at, iznosi numerički bez formata, "Redovna dostava" (term). Fajl nije preuzet (admin 429 rate limit) | FAIL | Nisko |
| E-012 | Kupac | Email šabloni (notifications.ts:24) | Brend boje sajta | Zelena #244a34/smeđa #8b5e3c/krem, dok sajt koristi teal/navy; lang="sr" vs sr-Latn | FAIL | Nisko |
| E-013 | Gost | aria-label korpe | "2 jedinice" | "Korpa, 2 jedinica" (site-shell.tsx:101; pluralUnits postoji u frontend.ts) | FAIL | Nisko |
| E-014 | Svi | Terminologija | Jedan pojam | pretplata (21), redovna dostava (38), paket (34) za isti koncept u storefront-u; admin "pretplata/redovna dostava/paket" + "porudžbina" dosledno | FAIL | Srednje |
| E-015 | Svi | Obraćanje | Jedna forma | ti-forma 63 (izaberi, dodaj, unesi, proveri) vs vi-forma 49 (izaberite, unesite, možete) — mešano čak i u checkoutu ("Izaberite grad" / "Prvo unesi grad"), potvrda kolačića "vašom" | FAIL | Srednje |
| E-016 | Gost | Checkout prazna forma, tastatura | Razlog zašto se ne može potvrditi | "Potvrdi porudžbinu" je disabled (nije u tab redosledu), bez aria-describedby/objašnjenja | FAIL | Srednje |
| E-017 | Gost | Checkout greška | Fokus/najava uz polje | Jedan role=alert na dnu (checkout-form.tsx:337), fokus se ne pomera, aria-invalid samo na poštanskom broju | FAIL | Srednje |
| E-018 | Gost | Header 360 | Logo unutar 64px | .brand 160×67 (iznad header 64) — 3px preliv (shell.css:756–762) | FAIL | Nisko |
| E-019 | Gost | /prodavnica 360, 5 kategorija | Chipovi bez lomljenja reči | "KRAVLJ/E/MLEK/O" lomi reči u 4 reda (zavisi od test kategorija, SH v-shop-360.png) | FAIL | Nisko |
| E-020 | Kupac | /nalog fontovi | ≥12px | 10–11px: .account-sidebar-label (account.css:27), .account-sidebar-footer 11–12px (:36), p.eyebrow 10px | FAIL | Nisko |
| E-021 | Kupac | /nalog | Jedan brend/zaglavlje | Dupli zaglavlje (sajt + "Mleko i Mleko" sidebar), naslovi u account.css drugačije težine/tipografije od ostatka ("ISTORIJA DOSTAVA" 650 Geist vs display), generičan pozdrav "Zdravo, kupče." (account-view.tsx:265) | FAIL | Nisko |
| E-022 | Gost | Tap mete 360 | ≥44px | Ispod 44: ticker link 18px visine (fail i WCAG 2.2 2.5.8), "Ukloni" u korpi 49×27, linkovi u tekstu 18–34px ("politiku privatnosti", "Javi nam se"), jezici 42px, kozje link 40px; admin Porudžbine: 101 kontrola <44px (checkboxovi redova) | FAIL | Nisko |
| E-023 | SEO | /ne-postoji, /proizvodi/ne-postoji | Jedan noindex, bez canonical | Dupli meta robots ("noindex" + "noindex, nofollow"), canonical na nepostojeći URL, generički description | FAIL | Nisko |
| E-024 | SEO | robots.txt | Bez konflikta | /nalog,/prijava,/checkout,/korpa su Disallow I noindex — crawler ne vidi noindex (preporuka: ukloniti Disallow ili ostaviti samo noindex) | FAIL | Nisko |
| E-025 | Perf | Home desktop/mobile | Lak hero | hero-desktop.mp4 4.176 KB i hero-mobile.mp4 1.489 KB se skidaju odmah (autoplay iako preload=metadata); ukupno 5,4 MB / 2,6 MB; logo za favicon/apple-icon 359 KB (layout.tsx icons) | FAIL | Srednje |
| E-026 | Perf | GET /api/account (commerce.ts:386–439) | Bez N+1/pisanja | ~12 upita + Promise.all(packageProgress po pretplati) (N+1 po pretplati, :419), lockOverdueDeliveries piše u GET (:389), učitava SVE aktivne proizvode (:404) | FAIL | Nisko |
| E-027 | Perf | Admin Porudžbine | Paginacija razumna | pageSize=100 u jednom zahtevu, stranica 17.972px visine bez virtualizacije, SELECT o.* uključuje shipping_json/PII (admin.ts:153) | FAIL | Srednje |
| E-028 | Admin | Brzo menjanje kartica | Bez lažne greške | Prekinuti zahtevi (ERR_ABORTED za orders/insights/delivery-preview) → crveni banner "Nije uspelo učitavanje: paketi, podešavanja, integracije" na Porudžbine/Dostave/Kupci (SH a-tab-Porudžbine-1280.png) | FAIL | Srednje |
| E-029 | Gost | Home | Stvarni sadržaj | Admin polje heroTitle ("Pravo mleko više nije daleko.") se čuva ali se ne koristi; h1 je hardkodiran (hero-scene.tsx:314 "Jutro počinje ovde.") | FAIL | Srednje |
| E-030 | Gost | Placeholder sadržaj | Bez placeholder-a | "Ilustracija" caption pod generičkim ikonama krave/koze (origin-gallery.tsx:8), "Fotografija uskoro" u /prodavnica (za proizvode bez slike; u ovom QA skupu test proizvodi) | FAIL | Srednje |
| E-031 | Gost | cart-provider.tsx:47 | try/catch oko localStorage | getItem bez zaštite (blokiran storage baca u microtask-u; motion-toggle i consent ga štite) | FAIL | Nisko |
| E-032 | Gost | cart-provider.tsx:107–125 | Uži kontekst | drawerOpen je u istom kontekstu kao items pa svaki useCart potrošač re-renderuje pri otvaranju drawer-a | FAIL | Nisko |
| E-033 | Gost | Broj porudžbine | Čitljiv | MM-20261104-_8OJYJHQ sadrži "_" (base64url) — loše za diktiranje telefonom | FAIL | Nisko |
| E-034 | Gost | /prijava grupa dugmadi | role=group | div.button-row ima aria-label bez role (login-form.tsx ~75), ignoriše se | FAIL | Nisko |
| E-035 | Admin | Login pogrešna lozinka | 401 | 403 ADMIN_FORBIDDEN (poruka na srpskom, role=alert OK); 429 posle 10 pokušaja radi (blokirao je moju sesiju) | FAIL | Nisko |
| E-036 | Gost | Screenshoti 22 stranice × 4 širine | Bez horiz. skrola | scrollWidth==clientWidth svuda | PASS | — |
| E-037 | Gost | axe 22 stranice 360+1280 | 0 povreda | 0 | PASS | — |
| E-038 | Gost | lang atribut | lang | sr-Latn (/sr-cyrl → sr-Cyrl, /en, /ru ispravno) | PASS | — |
| E-039 | Gost | h1 po stranici | tačno 1 | 1 na svih 22 (+404) | PASS | — |
| E-040 | Gost | Landmarks | main/header/nav/footer | po 1 main, 1 footer, više nav sa aria-label | PASS | — |
| E-041 | Gost | Skip link | Prvi Tab | "Preskoči na glavni sadržaj" prvi fokus | PASS | — |
| E-042 | Gost | Fokus vidljiv | outline | 3px navy, offset 3px (white 2px na teal traci) na svakom elementu u prijavi/checkoutu/proizvodu | PASS | — |
| E-043 | Gost | Tab redosled checkout | logičan | Ime→Email→Telefon→Ulica→Grad→Poštanski→details→plaćanje→saglasnost→linkovi | PASS | — |
| E-044 | Gost | Drawer: Tab/Esc | zamka fokusa, povratak | Fokus ostaje u dialogu (16 Tab), Esc zatvara, fokus se vraća na .cart-link, inert kad zatvoren | PASS | — |
| E-045 | Gost | Mobilni meni | Esc, aria-expanded | Esc zatvara, fokus na #menu-toggle, linkovi 64px visine | PASS | — |
| E-046 | Gost | getByLabel sva polja checkout/prijava/kontakt | Labele | Sva polja pronađena po labeli, autocomplete atributi postavljeni | PASS | — |
| E-047 | Gost | Prijava pogrešan kod | role=alert | "Kod nije ispravan, istekao je ili je već iskorišćen…" role=alert, srpski | PASS | — |
| E-048 | Gost | Prijava kodom tastaturom | Radi | Enter na kodu → /nalog; input one-time-code, inputmode numeric | PASS | — |
| E-049 | Gost | prefers-reduced-motion | Bez videa | Video se NE skida (5,4 MB → 1,4 MB), poster/end frame, marquee bez animacije; motion-toggle postoji (aria-pressed) | PASS | — |
| E-050 | Gost | Hero JS na mobilnom | Bez three.js | three.js se ne učitava na / (kind=loop); 0 canvas; CPU main-thread 1,4% (4× throttle, video nije dekodiran u headless Chromium) | PASS | — |
| E-051 | Gost | CLS | <0.1 | 0–0.033 | PASS | — |
| E-052 | Gost | Kontrast tokena | ≥4.5 tekst | navy/bg 10.37, ink-2/bg 5.31, ink-2/surface 5.80, danger/bg 5.96, success 5.89, bela/brand 4.55, bela/navy 11.32; brand kao tekst na bg 4.17 i na alt 3.94 (samo veliki/ikone, kako token komentar navodi), navy/brand 2.49 i bela/go 2.37 (ne smeju se koristiti za tekst) | PASS | — |
| E-053 | SEO | Title/description/canonical po stranici | Jedinstveno | Jedinstveni title; canonical samopokazujući; /admin ima generički description | PASS | — |
| E-054 | SEO | sitemap.xml | Samo javne | 36 URL (4 jezika), lastmod, hreflang; /admin,/nalog nisu uključeni; uključuje test proizvode (podaci) | PASS | — |
| E-055 | SEO | noindex /admin /nalog /checkout /korpa /prijava | noindex | "noindex, nofollow" | PASS | — |
| E-056 | SEO | OG slika | 1200×630 | /images/mleko-i-mleko-og.jpg 1200×630 102 KB, twitter summary_large_image, JSON-LD Product/Breadcrumb | PASS | — |
| E-057 | Admin | axe sve kartice 1280 (Početna, Porudžbine, Dostave, Kupci, Izveštaji, Podešavanja + 9 pod-odeljaka) | 0 povreda | 1 minor empty-table-header (Porudžbine); h1=1, main=1, labele OK | PASS | — |
| E-058 | Admin | listOrders (admin.ts:149) | Bez N+1 | 2 upita (lista + count), nema petlje | PASS | — |
| E-059 | Gost | Konzola/network tokovi (home→proizvod→korpa→checkout→potvrda; prijava; /nalog) | Bez grešaka | 0 console error/warn, 0 hydration upozorenja; jedino 404 na /ne-postoji i 401 na pogrešan kod (očekivano) | PASS | — |
| E-060 | Gost | Neprijavljen /api/account | UI ne zove | Nijedan 401 na /api/account na javnim stranicama | PASS | — |
| E-061 | Gost | Slike alt | alt | Sve informativne slike imaju srpski alt; dekorativne alt="" | PASS | — |
| E-062 | Gost | Prazna korpa / loading stanja | Jasna | Prazna korpa: naslov + CTA; loading role=status "Računamo tačan iznos…" | PASS | — |

## 3. FAIL detalji (selektor / fajl:linija / predlog)
- **E-001** `.account-dashboard :is(h1,h2,h3,p) { margin-top: var(--header-stack) }` — app/nalog/account.css:18. Verovatno zamišljeno kao scroll-margin-top. Predlog: ukloniti margin-top (ili zameniti sa `scroll-margin-top`). Screenshot: SH account-1280.png, account-360.png.
- **E-002** app/components/analytics-provider.tsx:96–121 (`button-row compact`, `<strong id="consent-heading">`) vs app/styles/shell.css:667–720 (`.consent-banner-actions`, `.consent-banner-title`). Predlog: dodati klase, aria-labelledby="consent-heading", na mobilnom kompaktnije (npr. max 40vh ili sticky traka sa jednim redom dugmadi).
- **E-003** app/components/product-configurator.tsx:98–120 (addToCart). Predlog: otvoriti drawer ili prikazati toast sa role="status" ("Dodato u korpu: 2 L …").
- **E-004** server/commerce.ts:197 + checkout-form.tsx input[name=phone]. Predlog: normalizacija/regex (cifre, +, razmaci, 8–15 cifara), type=tel pattern, poruka na srpskom. Dokaz: sqlite customers.email=test-e-12@example.test phone=abc.
- **E-005/006** server/domain.ts:55, time.ts:55, commerce.ts:186, auth.ts:110 i dr. Predlog: srpske poruke u DomainError ili mapiranje po `code` na klijentu (fetchJson u app/lib/frontend.ts:281).
- **E-007** forme u checkout-form.tsx, login-form.tsx, contact-form.tsx. Predlog: noValidate + sopstvena validacija sa aria-invalid/aria-describedby i fokusom na prvo neispravno polje.
- **E-010** frontend.ts:311–319 vs notifications.ts:12. Predlog: jedna zajednička funkcija (minimumFractionDigits:2 samo kada ima para, ili dosledno 2).
- **E-016/017** checkout-form.tsx:~330–340. Predlog: aria-disabled umesto disabled + objašnjenje; na submit prebaciti fokus na alert.
- **E-025** public/media/hero/*.mp4; Predlog: preload="none" dok nije vidljiv/na mobilnom i poster, AV1/H.265 ili kraći klip, favicon 32/180px.
- **E-026** commerce.ts:419, :404, :389. Predlog: batch packageProgress, ograničiti addonProducts, prebaciti lockOverdue u job.
- **E-027/028** app/admin/orders-panel.tsx, admin-dashboard.tsx (loader sa AbortController: ne prikazivati grešku za AbortError); pageSize 25–50.
- **E-029** hero-scene.tsx:314 / hero-copy.tsx; povezati sa settings.heroTitle ili ukloniti polje iz admina.

## 4. Performanse (dev server; meriti relativno)
| Stranica | Širina | DCL ms | load ms | zahteva | prenos KB | JS (broj/KB) | slike (broj/KB) | najveći resurs |
|---|---|---|---|---|---|---|---|---|
| / (home) | 360 | 198 | 1488 | 29 | 2672 | 17/905 | 4/112 | /media/hero/hero-mobile.mp4 1489KB |
| / (home) | 1280 | 186 | 281 | 30 | 5543 | 17/905 | 5/295 | /media/hero/hero-desktop.mp4 4176KB |
| /prodavnica (shop) | 360 | 472 | 571 | 28 | 1134 | 17/887 | 4/87 | /…next-devtools_ind 245KB |
| /prodavnica (shop) | 1280 | 151 | 242 | 29 | 1140 | 17/887 | 5/93 | /…next-devtools_ind 245KB |
| /proizvodi/sveze-kravlje-mleko-1l (product) | 360 | 821 | 917 | 28 | 1137 | 17/890 | 4/87 | /…next-devtools_ind 245KB |
| /proizvodi/sveze-kravlje-mleko-1l (product) | 1280 | 182 | 275 | 29 | 1143 | 17/890 | 5/93 | /…next-devtools_ind 245KB |
| /korpa (cart-empty) | 360 | 567 | 656 | 28 | 1073 | 17/887 | 2/22 | /…next-devtools_ind 245KB |
| /korpa (cart-empty) | 1280 | 192 | 298 | 29 | 1079 | 17/887 | 3/28 | /…next-devtools_ind 245KB |
| /korpa (cart-full) | 360 | 148 | 240 | 30 | 1077 | 17/887 | 2/22 | /…next-devtools_ind 245KB |
| /korpa (cart-full) | 1280 | 152 | 243 | 31 | 1083 | 17/887 | 3/28 | /…next-devtools_ind 245KB |
| /checkout (checkout-full) | 360 | 278 | 408 | 28 | 1080 | 17/895 | 2/22 | /…next-devtools_ind 245KB |
| /checkout (checkout-full) | 1280 | 174 | 270 | 29 | 1085 | 17/895 | 3/28 | /…next-devtools_ind 245KB |
| /prijava (login) | 360 | 325 | 440 | 28 | 1066 | 17/885 | 2/22 | /…next-devtools_ind 245KB |
| /prijava (login) | 1280 | 164 | 256 | 29 | 1072 | 17/885 | 3/28 | /…next-devtools_ind 245KB |
| /nalog (account) | 360 | 395 | 487 | 32 | 1100 | 17/907 | 3/24 | /…next-devtools_ind 245KB |
| /nalog (account) | 1280 | 251 | 397 | 33 | 1106 | 17/907 | 4/30 | /…next-devtools_ind 245KB |
| /kontakt (contact) | 360 | 498 | 588 | 26 | 1068 | 17/886 | 2/22 | /…next-devtools_ind 245KB |
| /kontakt (contact) | 1280 | 196 | 287 | 27 | 1074 | 17/886 | 3/28 | /…next-devtools_ind 245KB |
| /faq (faq) | 360 | 339 | 431 | 26 | 1066 | 17/884 | 2/22 | /…next-devtools_ind 245KB |
| /faq (faq) | 1280 | 152 | 240 | 27 | 1072 | 17/884 | 3/28 | /…next-devtools_ind 245KB |
| /dostava (delivery) | 360 | 287 | 377 | 26 | 1065 | 17/884 | 2/22 | /…next-devtools_ind 245KB |
| /dostava (delivery) | 1280 | 203 | 330 | 27 | 1071 | 17/884 | 3/28 | /…next-devtools_ind 245KB |
| /uslovi-kupovine (terms) | 360 | 651 | 764 | 26 | 1065 | 17/884 | 2/22 | /…next-devtools_ind 245KB |
| /uslovi-kupovine (terms) | 1280 | 151 | 240 | 27 | 1071 | 17/884 | 3/28 | /…next-devtools_ind 245KB |
| /ne-postoji (notfound) | 360 | 254 | 359 | 25 | 1059 | 16/880 | 2/22 | /…next-devtools_ind 245KB |
| /ne-postoji (notfound) | 1280 | 123 | 228 | 26 | 1065 | 16/880 | 3/28 | /…next-devtools_ind 245KB |
| /proizvodi/ne-postoji (product404) | 360 | 111 | 244 | 27 | 1059 | 18/881 | 2/22 | /…next-devtools_ind 245KB |
| /proizvodi/ne-postoji (product404) | 1280 | 100 | 225 | 28 | 1065 | 18/881 | 3/28 | /…next-devtools_ind 245KB |
| /farme (farms) | 360 | 288 | 376 | 25 | 1063 | 16/880 | 2/22 | /…next-devtools_ind 245KB |
| /farme (farms) | 1280 | 185 | 300 | 26 | 1069 | 16/880 | 3/28 | /…next-devtools_ind 245KB |
| /kako-funkcionise (howitworks) | 360 | 333 | 424 | 26 | 1065 | 17/884 | 2/22 | /…next-devtools_ind 245KB |
| /kako-funkcionise (howitworks) | 1280 | 149 | 239 | 27 | 1071 | 17/884 | 3/28 | /…next-devtools_ind 245KB |
| /o-nama (about) | 360 | 278 | 367 | 25 | 1062 | 16/880 | 2/22 | /…next-devtools_ind 245KB |
| /o-nama (about) | 1280 | 164 | 252 | 26 | 1068 | 16/880 | 3/28 | /…next-devtools_ind 245KB |
| /privatnost (privacy) | 360 | 280 | 369 | 26 | 1066 | 17/884 | 2/22 | /…next-devtools_ind 245KB |
| /privatnost (privacy) | 1280 | 152 | 243 | 27 | 1072 | 17/884 | 3/28 | /…next-devtools_ind 245KB |
| /pravila-pretplate (sub-rules) | 360 | 266 | 355 | 26 | 1065 | 17/884 | 2/22 | /…next-devtools_ind 245KB |
| /pravila-pretplate (sub-rules) | 1280 | 145 | 233 | 27 | 1071 | 17/884 | 3/28 | /…next-devtools_ind 245KB |
| /reklamacije (complaints) | 360 | 257 | 345 | 26 | 1065 | 17/884 | 2/22 | /…next-devtools_ind 245KB |
| /reklamacije (complaints) | 1280 | 148 | 240 | 27 | 1071 | 17/884 | 3/28 | /…next-devtools_ind 245KB |
| /gde-kupiti (where) | 360 | 273 | 364 | 26 | 1065 | 17/884 | 2/22 | /…next-devtools_ind 245KB |
| /gde-kupiti (where) | 1280 | 144 | 233 | 27 | 1071 | 17/884 | 3/28 | /…next-devtools_ind 245KB |
| /dostava-mleka/beograd (bg) | 360 | 332 | 450 | 27 | 1096 | 17/885 | 2/22 | /…next-devtools_ind 245KB |
| /dostava-mleka/beograd (bg) | 1280 | 166 | 257 | 27 | 1074 | 17/885 | 3/28 | /…next-devtools_ind 245KB |

Napomene: dev JS ~885–907 KB u 16–18 chunk-ova (HMR/devtools 245 KB), u produkciji znatno manje. Najveći resursi: hero mp4 (4,2 MB desktop, 1,5 MB mobile), poster-desktop.webp 206 KB, katalog slike webp 30–36 KB (dobro; AVIF/WebP dostupni, nema slika >300 KB osim videa). Reduced motion: 5,4→1,4 MB. Ponovljena merenja (3 prolaza po stranici): TTFB 40–70 ms topao, hladno 160–700 ms (dev kompilacija).

## 5. axe po stranici
Sve javne stranice (/, /prodavnica, /proizvodi/sveze-kravlje-mleko-1l, /korpa prazna/puna, /checkout, /prijava, /nalog, /kontakt, /faq, /dostava, /uslovi-kupovine, /farme, /kako-funkcionise, /o-nama, /privatnost, /pravila-pretplate, /reklamacije, /gde-kupiti, /dostava-mleka/beograd, 404): **0 povreda** na 360 i 1280 (serious/critical/moderate/minor). Admin: samo empty-table-header (minor) na Porudžbine. Mobilni admin (360) nije izmeren — vidi odeljak 7.

## 6. UX preporuke po uticaju (top 10)
1. Popraviti /nalog margin-top (E-001) — jedna linija CSS-a vraća ceo nalog u upotrebljivo stanje.
2. Povratna informacija pri "Dodaj u korpu" (E-003).
3. Validacija telefona + srpske poruke servera i formi (E-004/005/006/007).
4. Consent banner kompaktniji na mobilnom, ispravne klase/ARIA (E-002).
5. Objasniti disabled "Potvrdi porudžbinu", greške uz polja sa fokusom (E-016/017).
6. Jedan termin (pretplata ILI redovna dostava) i jedna forma obraćanja (E-014/015).
7. Doslednost datuma/iznosa: dd.mm.gggg., ista funkcija za UI/email/export, ukloniti ".." (E-008/009/010/011).
8. Ukloniti placeholder-e ("Ilustracija", "Fotografija uskoro") i povezati hero naslov sa adminom (E-029/030).
9. Lakši hero na mobilnom/sporim mrežama (lazy video, manji favicon) (E-025).
10. Admin: paginacija 25–50, ne prikazivati grešku za prekinute zahteve, veći checkbox-ovi (E-022/027/028).

## 7. Nije pokriveno i zašto
- Admin na 360/768/1920 i mobilni admin: moj IP (198.51.100.50) je dostigao limit prijave (429, 10/15 min) posle ponovljenih pokušaja skripte; admin je izmeren samo na 1280 (screenshoti a-*-1280.png).
- Preuzimanje admin exporta (xlsx/csv) i email šablona u realnom izlazu: formati ocenjeni statički iz koda (order-export.ts, notifications.ts).
- Pravo CPU merenje video dekodiranja: headless Chromium bez H.264, video ostaje paused; three.js/hero-scene nije aktivan u ovoj konfiguraciji (manifest kind=loop).
- Produkcioni build/Lighthouse (zabranjen build; dev mod); stvarni SQL broj iz .data/qa-dev.log nije brojan — N+1 procenjen čitanjem koda.
- Cirilica/en/ru UI i čitač ekrana (NVDA/VoiceOver) — nije testirano; samo lang i hreflang.
- Mutacije naloga (izmena pretplate, refund) — domen drugih agenata.
- Napomena: shop sadrži test proizvode drugih agenata (cena 0 RSD, ćirilica u imenu) pa deo vizuelnih nalaza (E-019, E-030) zavisi od tih podataka.
