# Higgsfield — evidencija generisanja hero materijala

Datum: 11. septembar 2026. Ovaj dokument beleži šta je stvarno generisano, kojim
modelom, sa kojim promptom i zašto je izabrana finalna varijanta, da sledeći izvršilac
ne mora ponovo da izmišlja scenu. Prati `HIGGSFIELD-PRODUKCIJSKI-BRIEF.md` H07–H12.

## Status materijala

**Privremeno, ne finalno.** Scena je generisana. Ambalaža je preuzeta iz postojećeg 3D
brend rendera `public/images/3d/milk-bottles.png`, koji nosi zvanični logotip, ali nije
fotografija fizičke flaše. Pre objave vlasnik treba ili da potvrdi da render odgovara
stvarnoj ambalaži, ili da se generisana flaša zameni stvarnom fotografijom.

Katalog sadrži dve nesaglasne ambalaže: `public/images/catalog/kravlje-mleko-v2.*`
prikazuje krem papirnu etiketu sa zelenom kravom, a 3D render prikazuje tirkizni
okrugli logotip sa ćiriličnim natpisom. Ova razlika je otvorena stavka za vlasnika.

## Ulazni materijali

| Oznaka | Fajl | Poreklo | Potvrđeno |
| --- | --- | --- | --- |
| REF-PRODUCT-FRONT | `public/images/3d/milk-bottles.png` (1000×1100) | 3D render u projektu | Nosi zvanični logotip; nije fotografija |
| REF-LOGO | `public/images/mleko-i-mleko-logo.png` (4167×4167) | Zvanični logotip | Da |
| REF-DESKTOP-START | Higgsfield job `d35d1092-5931-4659-853b-a78cbd25dc65` | Generisano | Pregledano |
| REF-DESKTOP-END | Higgsfield job `a561ea59-cb5d-4307-acbc-83a1c86458bb` | Generisano | Pregledano |
| REF-MOBILE-START | Higgsfield job `daf3e347-1d40-4f83-9ad6-fba9535e4d5c` | Generisano | Pregledano |
| REF-MOBILE-END | Higgsfield job `b8c0bd78-36a4-42c1-a048-df737826dad9` | Generisano | Pregledano |

## Korišćeni modeli i parametri

| Korak | Model | Parametri | Trošak |
| --- | --- | --- | --- |
| Referentne slike | `gpt_image_2` | 16:9 i 9:16, quality `high`, resolution `2k`, referenca flaše u ulozi `image` | 6,5 kredita po slici |
| Video | `cinematic_studio_3_0` | 8 s, 1080p, `generate_audio: false`, uloge `start_image` i `end_image` | 80 kredita po generaciji |

Ukupno potrošeno: 4 slike + 3 video generacije, oko 266 kredita. Stanje pre rada: 1135.

Napomena za sledeći put: `cinematic_studio_3_0` je prvi put odbio zahtev uz preporuku
preseta „IN THE DARK“. Zahtev prolazi kada se preset eksplicitno odbije parametrom
`declined_preset_id`.

## Promptovi

Promptovi za slike i video su preuzeti iz `HIGGSFIELD-PRODUKCIJSKI-BRIEF.md` H07, H08 i
H09, uz dve dopune koje su bile potrebne za stvarnu ambalažu:

- U promptovima za slike dodat je opis stvarne etikete: tamnozeleni čep, okrugla
  tirkizna etiketa sa ručno crtanom kravom i kozom i ćiriličnim natpisom, uz izričitu
  zabranu redizajna, prevoda ili prekucavanja etikete.
- U korektivnom desktop promptu pojačan je uslov kontinuiteta objekata (vidi ispod).

## Pregled i razlog odbacivanja

Pregledani su kadrovi na 0, 1, 2, 3, 4, 5, 6 i 7,9 s, u oba smera.

| Generacija | Job | Odluka |
| --- | --- | --- |
| Desktop v1 | `5d65567a-c8b6-4216-81a3-8080bf2efb15` | **Odbačeno.** Oko 2 s u kadar ulazi druga flaša koja sipa mleko i nestaje do 4 s. Po H11 to je prekid kontinuiteta objekata i izvor mlaza koji ne sme biti vidljiv. |
| Desktop v2 | `bed6a83c-9f5c-428f-a03e-1811a626dfc7` | **Prihvaćeno.** Jedna flaša kroz ceo klip, mlaz ulazi izvan kadra, etiketa i čep očuvani, miran levi trećinski prostor za naslov. |
| Mobilni | `a8283b4b-954c-42d9-8673-fca848b3c1c7` | **Prihvaćeno iz prve.** Čist prelaz iz bliskog sipanja u otkrivanje proizvoda, bez dodatnih objekata. |

Ciljana izmena za desktop v2 bila je samo kontinuitet objekata. Ambalaža, svetlo, kadar
i model nisu menjani istovremeno, prema H10.

## Izvoz za web

Masteri (1920×1080 i 1080×1920, h264, 24 fps, 8,04 s, bez zvuka) nisu u repozitorijumu.
U `public/media/hero/` su optimizovane web verzije:

| Fajl | Rezolucija | Veličina | Budžet iz plana |
| --- | --- | --- | --- |
| `hero-desktop.mp4` | 1440×810 | 2,34 MB | do 5 MB |
| `hero-mobile.mp4` | 720×1280 | 1,45 MB | do 2,5 MB |
| `poster-desktop.webp` | 1440×810 | 60 KB | do 250 KB |
| `poster-mobile.webp` | 720×1280 | 27 KB | do 150 KB |
| `end-desktop.webp` | 1440×810 | 26 KB | — |
| `end-mobile.webp` | 720×1280 | 21 KB | — |

Komanda za izvoz, sa gustim ključnim kadrovima radi traženja pozicije pri skrolu:

```
ffmpeg -i <master> -an -vf scale=<w>:<h>:flags=lanczos \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf <26 desktop | 27 mobilni> \
  -preset slow -g 6 -keyint_min 6 -sc_threshold 0 -tune fastdecode -movflags +faststart
```

`-g 6` daje ključni kadar na svakih 0,25 s, što je bilo neophodno za glatko premotavanje.

## Kako zameniti materijal

1. Zameni fajlove u `public/media/hero/` istim imenima.
2. Ažuriraj stvarne dimenzije, trajanje i veličine u `public/media/hero/manifest.json` i
   u `app/lib/hero-media.ts`.
3. Kada materijal prikazuje potvrđenu ambalažu, promeni `status` iz `temporary` u
   `final` na oba mesta. Test `tests/hero-media.test.mjs` pada ako se dva zapisa ne slažu
   ili ako neki navedeni fajl ne postoji.
4. Ako materijala privremeno nema, postavi `heroMedia` na `null` u `app/lib/hero-media.ts`.
   Hero tada prikazuje statičnu kompoziciju iz postojeće fotografije proizvoda, bez
   praznog zadržanog prostora.
