# Redizajn u stilu Juicy Marbles — predaja

Grana `redesign-jm` (od `d1d8280`). Referenca: juicymarbles.com — paleta, tipografija i raspored sekcija preneti na Mleko i Mleko, sa teal bojom iz loga umesto njihove plave trake. Immersive scroll hero je zadržan; klijentov loop video se ubacuje bez prepravke koda (vidi dole).

## Šta je urađeno

| Oblast | Rezultat |
|---|---|
| CSS arhitektura | 5 starih globalnih fajlova → `app/styles/` (tokens, base, shell, drawer, components/*, home/*, pages/*, admin). Dokazano bez vizuelne promene pre redizajna (computed-style digest 0/130, dev + prod). |
| Dizajn sistem | `app/styles/tokens.css`: narandžasta `#FF4612`, krem `#F7F2F0`, crna + 1px crne linije, blush `#F9D0C4`, teal `#2F7184` (samo traka i logo), zelena `#66BD15` (samo hero CTA). Uglovi 0. Fontovi: Archivo (naslovi, verzal), Fraunces 800 (nazivi proizvoda), Geist (tekst). |
| Početna | Teal traka + pauza animacija, narandžasti header, scroll hero sa novim copy-jem i nagnutim "fold" završetkom, rotirana traka sa rečima, kartice proizvoda, narandžasti koraci, foto baner, blush ritam, FAQ, završna kartica na uzorku, narandžasti footer. |
| Unutrašnje stranice | Prodavnica, proizvod, korpa, checkout, nalog, prijava, sve sadržajne i pravne strane, 404/greška — isti sistem. |
| Copy | Nov drzak srpski copy (`app/lib/content.ts` → `homeCopy`, `shellCopy`), "ti" forma svuda u UI-ju; pravni tekst ostao formalan namerno. |
| Bug | Uklonjen root `app/loading.tsx`: svaka stranica je prvo slala "Učitavamo stranicu…" pa skrivenu kopiju cele strane → povremeno duplirana strana (flaky e2e) i skok layouta. Posle: 60/60 prolaza. |

Ocene dizajn evaluatora (0–100, prolaz ≥ 85, sve kategorije ≥ 7, bez blokera): početna + shell 71 → 81 → **86,5**; unutrašnje stranice 81,5 → **86,5**. Posle prolaza: razmak redova u naslovima 1,0 (kao na referenci, da kvačice na Č/Š/Ž ne dodiruju red iznad) i sitne copy ispravke. Završna provera: lint, typecheck, node testovi, vercel testovi, e2e (65), vizuelno snimanje 92/92 — bez overflow-a, axe grešaka, prelomljenih reči i meta < 24px; admin vizuelno nepromenjen; production build bez CSP grešaka.

## Klijentov hero video (zamena)

1. Specifikacija: seamless loop 8–15 s, bez teksta u kadru, mirna zona za naslov u sredini. H.264 MP4: desktop 1920×1080 ≤ 5 MB, mobilni 720×1280 ≤ 2,5 MB, plus poster i end frame (webp) za oba.
2. Fajlove staviti u `public/media/hero/` (iste putanje ili ažurirati putanje).
3. U `app/lib/hero-media.ts` **i** `public/media/hero/manifest.json` postaviti `kind: "loop"` i `tone: "dark"` (za tamni snimak; `"light"` za svetao). Test `tests/hero-media.test.mjs` proverava da se ova dva fajla slažu.
4. `npm test` / `npm run test:e2e` — loop testovi (`tests/e2e/hero-loop.spec.ts`) se sami uključuju kad je `kind: "loop"`.

Proveren dry-run sa postojećim snimkom: centriran beo naslov preko zatamnjenja, dugme za pauzu, svi testovi prolaze.

## Gde se šta menja

- Tekstovi početne/trake/footera: `app/lib/content.ts`.
- Boje, veličine, razmaci: `app/styles/tokens.css` (nikad hex u drugim fajlovima, osim `admin.css`).
- Licencirani originalni fontovi (Agrandir, New Spirit): zameniti `next/font/google` import u `app/layout.tsx` sa `next/font/local`; promenljive `--ff-display` / `--ff-card` ostaju iste.

## Vizuelna kontrola kvaliteta

- `VISUAL_OUT=output/qa/<ime> npm run test:visual` — screenshotovi (390/768/1440), digest i metrike (overflow, axe, prelomljene reči, mete < 24px, header offset, CLS, boje van palete, zaobljenja).
- `node tests/visual/digest-diff.mjs <dirA> <dirB> [--only admin]` — upoređuje dva snimanja.
- `VISUAL_PROD=1` — isto na production buildu.

Na Windowsu `npm test` ne radi (spawn `npm` bez shell-a, i worker build bira web libsql klijent); CI na Linuxu je merodavan.

## Otvoreno — odluke vlasnika

1. **Admin tekstovi u "Vi" formi** (Podešavanja → `guaranteeText`; kratak opis kozjeg mleka): predlog — "Količinu i ritam menjaš do roka, a svaku sledeću dostavu možeš da preskočiš ili pauziraš iz svog naloga." i "… Za tvoj svakodnevni ritual."
2. **Seed tvrdnje van dozvoljenih činjenica** u podešavanjima ("Bez hormona, antibiotika i aditiva", "Redovna laboratorijska kontrola") — dizajn ih ne prikazuje; proveriti pre bilo kakvog korišćenja.
3. **Dani i cena dostave su hardkodovani** na `/kako-funkcionise` i stranicama gradova (od ranije). Podešavanje `serviceAreaNote` je jedan zajednički string, pa dani po gradu ne mogu automatski da se izvedu — treba odluka (nova polja po gradu ili ručno održavanje).
4. Sitno: datum sledeće dostave ima godinu i tačku, a rok za izmene nema godinu ("petak, 16. oktobar 2026." vs "četvrtak, 15. oktobar 08:00"); `formatDate` nema `timeZone: Europe/Belgrade` (za razliku od `formatDateTime`). Na `/checkout` (≥1024px) obavezno polje saglasnosti je u levoj koloni, daleko od dugmeta "Potvrdi porudžbinu" — browser ga ipak traži pre slanja.
5. Pravni tekstovi ostaju u formalnom obraćanju (namerno).

## Proces (za ponavljanje)

Orkestracija subagenata sa evaluator petljom: fondacija (flatten → tokeni) → 4 paralelna radnika sa disjunktnim vlasništvom nad fajlovima → fan-in provera (vlasništvo + nepromenjen scroll engine) → evaluator (screenshotovi + metrike vs referenca, numerička rubrika) → popravke, max 4 runde za početnu i 2 za unutrašnje strane. Stanje, ugovori i logovi: `work/redesign-jm/` (gitignored).
