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

## Uvećanje desktop klipa na 4K

Datum: 12. septembar 2026. Desktop klip je bio 1440×810, pa ga je pregledač na 2K i 4K
ekranima dodatno uvećavao i scena je izgledala meko. Master je bio samo 1080p, tako da
prava 4K verzija nije mogla da se dobije ponovnim izvozom iz postojećeg materijala.

| Korak | Vrednost |
| --- | --- |
| Ulaz | prihvaćena desktop generacija `bed6a83c-9f5c-428f-a03e-1811a626dfc7` (1920×1080) |
| Model | `bytedance_video_upscale`, preset `aigc`, 4K, 24 fps |
| Job | `b1ddc652-0782-48c9-9a0e-265e4bb04c65` |
| Izlaz | 3840×2160, 24 fps, 8,04 s, 19,3 MB pre izvoza za web |

Uvećanje je stvarno vratilo detalj, nije samo preuzorkovalo. Isečak 1:1 na ivici čaše je
oštar, dok je prethodni izvoz na istom mestu bio zamućen. SSIM izvoza prema 4K masteru:
crf 26 → 0,9936, crf 30 → 0,9917, crf 33 → 0,9895. Izabran je crf 30.

**Interpolacija na 48 fps je uklonjena.** Prethodni izvoz je bio interpoliran sa 24 na
48 fps. Merenje ispod pokazuje da na 4K pregledač ne stiže da prikaže ni izvornih 24 fps,
pa 48 fps ne bi prikazalo nijedan frejm više a koštalo bi oko 1 MB.

## Merenje brzine traženja pozicije

Traženje pozicije, a ne broj izvornih frejmova, određuje koliko različitih frejmova skrol
može da prikaže. Mereno u Chromium-u (Playwright, headless, bez usporavanja procesora),
prosek preko 4 s uzastopnih traženja na zagrejanom dekoderu:

| Klip | ms po traženju | traženja/s | različitih frejmova u sporom skrolu od 4 s |
| --- | --- | --- | --- |
| 1440×810 48 fps (prethodni izvoz) | 7,3 | 137 | 383, ceo klip |
| 1920×1080 24 fps | 11,3 | 88 | 193, ceo klip |
| 2560×1440 24 fps | 20,6 | 49 | 193, tesno |
| **3840×2160 24 fps (trenutni)** | **67,1** | **14,9** | **60 od 193** |

Klip ima 193 frejma. Da bi spor skrol od 4 s prošao kroz sve, potrebno je oko 48
traženja u sekundi. Na 4K dekoder stigne 15, dakle oko trećinu. Scena je oštrija u
mirovanju, ali tokom skrola vidno stepenasta, i to na brzoj mašini bez usporavanja.
Praktičan plafon za ovu scenu je 2560×1440. Odluka o 4K je svesna i doneta uz ove
brojke; zamena je samo ponovni izvoz iz istog 4K mastera.

## Izvoz za web

Masteri (4K desktop iz uvećanja gore, 1080×1920 mobilni, h264, 24 fps, 8,04 s, bez zvuka)
nisu u repozitorijumu. U `public/media/hero/` su optimizovane web verzije:

| Fajl | Rezolucija | Veličina | Budžet iz plana |
| --- | --- | --- | --- |
| `hero-desktop.mp4` | 1920×1080 | 4,08 MB | do 5 MB |
| `hero-mobile.mp4` | 720×1280 | 1,45 MB | do 2,5 MB |
| `poster-desktop.webp` | 2560×1440 | 206 KB | do 250 KB |
| `poster-mobile.webp` | 720×1280 | 27 KB | do 150 KB |
| `end-desktop.webp` | 2560×1440 | 83 KB | — |
| `end-mobile.webp` | 720×1280 | 21 KB | — |

### Zašto je desktop izvoz 1080p, a ne 4K

Rezolucija izvoza određuje koliko je skrol gladak. Scena se pomera tako što se traži
pozicija u klipu, a jedno traženje košta otprilike jedno dekodiranje frejma, pa veći
frejm znači ređe osvežavanje. Mereno u Chrome-u, 60 uzastopnih traženja po frejmu:

| Izvoz | Medijana traženja | Plafon scene | Veličina |
| --- | --- | --- | --- |
| 3840×2160, crf 30 | 50 ms | 20 fps | 7,74 MB |
| 2560×1440, crf 30 | 23 ms | 43 fps | 4,05 MB |
| 1920×1080, crf 30 | 14 ms | 72 fps | 2,67 MB |
| **1920×1080, crf 26** | **14 ms** | **72 fps** | **4,08 MB** |

4K klip je bio ograničen na 20 frejmova u sekundi bez obzira na to koliko glatko skrol
stiže do JavaScript-a, i to se videlo kao stepenice. Gušći ključni kadrovi tu ne pomažu:
na 2560×1440 svaki izvoz ispod `-g 3` staje na 14,7 ms, jer ostaje cena dekodiranja
jednog frejma. Protok takođe skoro ne utiče, pa je crf spušten sa 30 na 26 — isto
traženje pozicije, bolji kvalitet, i klip je ponovo unutar budžeta od 5 MB iz plana.

Klip se učitava samo od 768 px naviše; mobilni korisnici i dalje dobijaju 1,45 MB.

Poster i završni kadar ostaju na 2560×1440, izvučeni iz 4K mastera — to su mirne slike,
bez troška traženja pozicije. Puna 4K rezolucija bi probila budžet od 250 KB, a poster
je LCP element.

Komanda za desktop izvoz, sa gustim ključnim kadrovima radi traženja pozicije pri skrolu:

```
ffmpeg -i <4k-master> -an -vf scale=1920:1080:flags=lanczos \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 26 \
  -preset slow -g 6 -keyint_min 6 -sc_threshold 0 -tune fastdecode -movflags +faststart
```

Mobilni izvoz je nepromenjen: `scale=720:1280:flags=lanczos` i crf 27.

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
