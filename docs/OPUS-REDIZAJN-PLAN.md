# Mleko i Mleko — izvršni plan za Opus

Datum: 9. septembar 2026. Ovaj dokument je samostalni brief za implementaciju. Novi vizuelni pravac zamenjuje prethodne dizajnerske planove. Postojeći podaci i poslovna pravila ostaju izvor istine.

**Dopuna v2 — obavezni detaljni izvršni paket**

Korisnik je zatražio mnogo preciznije instrukcije, uključujući AOV i LTV, da izvršilac ne izmišlja sadržaj ili poslovna pravila. Ovaj dokument je ulazna tačka. Čitaj zajedno sa sledećim dokumentima, ovim redom:

1. [Detaljna specifikacija sajta za Opus](OPUS-DETALJNA-SPECIFIKACIJA.md): izvori istine, tačan raspored, tekstovi, kontrole, stanja, mobilni prikaz i kriterijumi prihvatanja.
2. [AOV i LTV — funkcionalna specifikacija](AOV-LTV-SPECIFIKACIJA.md): paketi, preporuke, obračun dostave, ponovna kupovina, pretplata, komunikacija i merenje.
3. [Higgsfield — produkcijski brief](HIGGSFIELD-PRODUKCIJSKI-BRIEF.md): referentni materijali, kompozicija, vremenska mapa, gotovi promptovi, pregled grešaka i izvoz.

Pri razlici u detaljima, v2 dokument za odgovarajuću oblast precizira ovaj početni plan. Eksplicitne instrukcije korisnika ostaju najviši autoritet. Postojeći kod opisuje trenutno ponašanje; potvrđene greške se popravljaju uz test, a nova komercijalna pravila se ne izmišljaju. Higgsfield dobija produkcijski brief za medije; Opus dobija ceo paket za izradu sajta. Specifikacije ne podrazumevaju da alat za generisanje videa ume da implementira webshop.

Neobjavljene pogodnosti sa nepoznatom cenom ostaju isključene. Demonstracioni brojevi iz testova nikada se ne prikazuju kao aktuelna ponuda.

**1. Zadatak i očekivani rezultat**

Napravi kompletan redizajn prodajnog sajta Mleko i Mleko. Razmišljaj kao iskusan dizajner i frontend inženjer: prepoznatljiv brend, snažna prezentacija proizvoda, jednostavan izbor i brz završetak kupovine. Primarni uređaj je mobilni telefon. Početak sajta mora imati dinamičnu, glatku animaciju vezanu za skrol koja prirodno vodi do ponude.

Izvrši plan u fazama i nastavi samostalno kroz rutinske dizajnerske i tehničke odluke. Na kraju predaj funkcionalan redizajn, rezultate provera i precizan spisak eventualnih nedostajućih materijala. Nemoj predstavljati privremene fotografije, nedostupan video ili neproverenu naplatu kao završen produkcioni rezultat.

Prioriteti, ovim redom:

1. Kupovina je razumljiva i radi na telefonu.
2. Prvi ekran ostavlja jak, prepoznatljiv utisak.
3. Animacija ima ritam i neposredno prati skrol.
4. Brzina, pristupačnost i stabilnost ostaju dobre.
5. Fotografije, tekst i sve stranice deluju kao jedinstven brend.

**2. Obavezno upoznavanje sa projektom**

Pre pisanja koda pročitaj `AGENTS.md`, `CLAUDE.md` i relevantne lokalne Next.js vodiče u `node_modules/next/dist/docs/`. Instalirana verzija u trenutku pripreme plana je Next.js 16.3.4, uz React 19.2.6. Ponovo proveri `package.json` pri početku rada.

Pregledaj `git status` i sačuvaj sve postojeće korisničke izmene. Radno stablo već sadrži mnogo izmena; nemoj raditi reset, masovno vraćanje fajlova ili zamenu celog projekta. Pregledaj aktivne servere pre pokretanja novog.

Polazne tačke:

| Oblast | Fajlovi |
| --- | --- |
| Početna i zajednički izgled | `app/page.tsx`, `app/layout.tsx`, `app/components/site-shell.tsx` |
| Postojeći stilovi | `app/globals.css`, `app/pastoral.css`, `app/storefront.css` |
| Postojeći vizuelni uvod | `app/components/milk-scene.tsx`, `app/components/milk-scene-renderer.ts` |
| Ponuda i proizvodi | `app/components/product-card.tsx`, `app/prodavnica/store-view.tsx`, `app/proizvodi/[slug]/product-detail.tsx` |
| Dostava i paketi | `app/components/delivery-checker.tsx`, `app/components/bundle-offers.tsx` |
| Korpa i checkout | `app/components/cart-provider.tsx`, `app/korpa/cart-view.tsx`, `app/checkout/checkout-form.tsx` |
| Podaci i obračun | `server/storefront.ts`, `server/products.ts`, `server/settings.ts`, `server/commerce.ts`, `app/lib/frontend.ts` |
| Analitika i sadržaj | `app/components/analytics-provider.tsx`, `app/lib/content.ts`, `app/lib/seo.ts` |
| Testovi | `playwright.config.ts`, `tests/e2e/`, `tests/vercel/`, `package.json` |

Prvo vizuelno pregledaj pokrenuti sajt na telefonu i desktopu. Dijagnoza u ovom planu zasnovana je na kodu i delu lokalnih slika, a ne na kompletnom merenju živog sajta.

Prethodni dizajnerski dokumenti nisu kreativna ograničenja. Postojeće obračune, dostupnost, termine, mogućnosti pretplate, status plaćanja i uslove poslovanja proveravaj u stvarnim podacima. README trenutno opisuje naplatu i druge integracije koje zahtevaju zasebnu aktivaciju; redizajn sam po sebi ne aktivira te sisteme.

**3. Kreativni pravac**

Radna ideja: **Jutro počinje ovde.**

Savremen prehrambeni brend sa izraženom tipografijom, velikim kadrovima mleka i stakla, jasnim cenama i toplom atmosferom jutarnjeg stola. Razvij novi izgled bez oslanjanja na prethodni pastoralni raspored.

Početna paleta za vizuelnu proveru:

- Mlečnobela `#F7F3E9`: glavna pozadina.
- Kobaltno plava `#2146DB`: glavna akcija i prepoznatljive površine.
- Tamna `#17251F`: tekst.
- Boja putera `#F2D36A`: mali akcenti.

Proveri paletu uz stvarni logo i ambalažu. Sačuvaj prepoznatljivost zvaničnog logotipa. Proveri kontrast stvarnih kombinacija. Izaberi najviše dve porodice fontova, sa podrškom za srpsku latinicu i stvarno potrebnim težinama. Prednost imaju kvalitetna postojeća sredstva i fontovi sa odgovarajućom licencom.

Naslovi su snažni i kratki. Cene, količine i opcije koriste mirnu, čitljivu tipografiju. Izbegni nizove identičnih dekorativnih kartica, previše bedževa i stalno pokretanje svih elemenata. Ujednači ton obraćanja kroz ceo prodajni tok; početni predlog je direktno obraćanje u jednini.

**4. Animacija: konkretna dramaturgija**

Izvorni video: približno 8 sekundi, bez zvuka. Glavna animacija je vezana za napredak skrola, a ne za proteklo vreme. Osam sekundi materijala ne znači da kupac mora da čeka osam sekundi.

Jedan neprekinut kadar sa kontrolisanim ubrzanjem kamere i smirivanjem pri kraju. Na telefonu se čaša i flaša komponuju vertikalno; na desktopu proizvod ostavlja prostor za tekst levo. Ambalaža ostaje fizički stabilna, a pokret dolazi od sipanja, kamere i promena kompozicije.

| Napredak | Vizuelna radnja | Tekst i interfejs |
| --- | --- | --- |
| 0–15% | Odmah vidljiv makro kadar mlečnog talasa i mlaza koji ulazi u čašu. Prvi pokret skrola daje vidljivu promenu. | Naslov „Jutro počinje ovde.“; kratak opis ponude; dugme „Izaberi svoje mleko“. |
| 15–50% | Kamera se ubrzano, ali meko udaljava, uz blag bočni luk. Otkriva stvarnu flašu pored čaše. Mlaz ulazi sa gornje ivice kadra; flaša na stolu ne menja oblik. | Naslov se kratko pomera i povlači iz prostora proizvoda. Glavno dugme ostaje dostupno. |
| 50–80% | Kamera usporava u čistom kadru proizvoda. Svetlost kroz staklo i smirivanje površine daju život sceni. | Kratka poruka „Tvoje mleko. Tvoj ritam.“ i jasno naznačene vrste mleka. |
| 80–100% | Kadar se kroz blago smanjenje i zaobljenje medijskog okvira uklapa u sledeću sekciju. Pojavljuju se stvarne kontrole za kupovinu. | „Izaberi svoje mleko“ postaje naslov ponude. Na kraju se prirodno nastavlja običan skrol. |

Dinamičnost postiži promenom razmere, smerom pogleda, jasnim otkrivanjem proizvoda i promenom tempa. Ne praviti višesekundni gotovo nepomični zum. Izbegni nagle rezove, trešenje kamere, bleskanje, rotiranje cele stranice i promene oblika flaše. Ne menjaj brzinu videa ekstremno da bi sakrio lošu generaciju.

Početne vrednosti za prototip, koje treba podesiti prema testovima:

- Desktop: dodatni put skrola tokom zadržavanja scene oko 140–180% stabilne visine prikaza, zatim normalan tok.
- Telefon: dodatni put oko 70–100% stabilne visine prikaza. Ponuda počinje približno unutar prve dve visine ekrana od vrha stranice.
- Blago praćenje skrola: oko 0,15–0,3 s na telefonu, 0,25–0,45 s na desktopu. Izbegni dodatni sloj interpolacije koji bi udvostručio kašnjenje.
- Kratke reakcije dugmadi i korpe: oko 120–220 ms; sekcijski prelazi oko 250–450 ms.
- Brz skrol mora odmah voditi ka odgovarajućem delu priče. Animacija ne sme dugo nastavljati nakon što prst stane.

Ove vrednosti nisu merilo kvaliteta same po sebi. Ako telefon deluje usporeno ili se uvod razvlači, prvo skrati trajanje zadržavanja i kašnjenje.

**5. Mobilni dizajn je početna verzija**

Prvo razradi 390 px širine, proveri 360 px i mali ekran 375 × 667, a zatim proširi na tablet i desktop.

- Prvi ekran sadrži logo, razumljiv naslov, proizvod i glavni poziv na kupovinu. Bez čekanja da se video učita.
- Upotrebi zaseban vertikalni materijal. Običan centralni isečak desktop videa nije dovoljan.
- U gornjoj trećini kadra ostavi miran prostor za tekst, u donjem delu prostor za akciju; proizvod ne sme biti prekriven dugmetom.
- Kontrole najmanje 44 × 44 CSS px, ključna dugmad poželjno 48 px ili više. Osnovni tekst i polja oko 16 px, bez sprečavanja korisničkog uvećavanja.
- Proizvodi se prikazuju u preglednom vertikalnom rasporedu; izbegni obavezni horizontalni karusel za glavnu ponudu.
- Jedna donja traka za kupovinu pojavljuje se kada je relevantni glavni kontrolni panel van vidnog polja. Prikazuje ispravan zbir za trenutno odabran proizvod i jasan sledeći korak.
- Korpa, izbor količine i greške rade dodirom. Nijedna bitna informacija ne zavisi od hover efekta.
- Uvaži donju bezbednu zonu uređaja, otvaranje tastature i promenu orijentacije. Traka za kupovinu, poruka o kolačićima i otvorena korpa ne smeju se međusobno prekrivati.
- Rezerviši prostor za sve medije. Za zadržanu scenu proveri stabilnu visinu preko `svh` i stvarno ponašanje Safari adresne trake; ne oslanjaj se samo na `100vh`.
- Navigacija i preskakanje na ponudu rade i kada je animacija u toku, nedostupna ili ugašena.

**6. Higgsfield i prenos materijala do Opusa**

Ne pretpostavljaj da Opus ima iste konektore ili alate kao okruženje u kojem je napisan ovaj plan. Lokalna Higgsfield aplikacija nije preduslov ovog toka: plan predviđa generisanje preko dostupnog povezanog alata ili web interfejsa i zatim prenos izvezenih materijala u projekat.

Pri pripremi plana povezani Higgsfield katalog je prikazao Kling v3.0 sa početnom i završnom slikom, trajanjem 3–15 sekundi i formatima 16:9, 9:16 i 1:1. To je kandidat za prvi probni kadar, a ne garancija najboljeg rezultata. Dostupnost, parametre i cenu proveri u okruženju koje stvarno izvršava generaciju.

Tok rada:

1. Popiši postojeće slike i potvrdi koje prikazuju stvaran proizvod. Lokalne demo slike ne tretiraj automatski kao zvaničnu ambalažu.
2. Pripremi usklađenu početnu i završnu sliku za horizontalni kadar; zatim zaseban par za vertikalni kadar.
3. Ako je Higgsfield dostupan izvršiocu i generisanje je odobreno u toj sesiji, generiši jednu probnu varijantu. Prvo proveri ambalažu i fiziku, pa radi najviše još dve ciljane varijante prema konkretnoj grešci.
4. Ako pristup nije dostupan, pripremi folder sa referencama, promptovima, potrebnim podešavanjima i uputstvom za web interfejs. Traži samo konkretan nedostajući izvoz i nastavi nezavisan rad na sajtu.
5. Tokom čekanja koristi jasno dokumentovan privremeni poster i kratak pokret postojećih slojeva. To je razvojna zamena; finalna filmska animacija ostaje otvorena stavka.
6. Pre integracije pregledaj početak, sredinu i kraj, a zatim ceo klip unapred i unazad. Proveri teksturu mleka, etiketu, geometriju stakla, svetlo i prostor za tekst.

Predložena isporuka u `public/media/hero/`:

| Fajl / grupa | Namena |
| --- | --- |
| `hero-desktop.mp4` | Optimizovan desktop izvoz. |
| `hero-mobile.mp4` | Posebno komponovan i optimizovan mobilni izvoz. |
| `poster-desktop.webp`, `poster-mobile.webp` | Početni kadar, brzo učitavanje i zamena kada nema animacije. |
| `end-desktop.webp`, `end-mobile.webp` | Kontrola finalne kompozicije i priprema prelaza. |
| `manifest.json` | Stvarne dimenzije, trajanje, formati, žarište kompozicije i putanje dostupnih materijala. |

Originalne velike video fajlove čuvaj van javnog paketa i uobičajenog Git repozitorijuma. Ako se nakon merenja odabere sekvenca slika, manifest opisuje i njene stvarne kadrove. Nemoj generisati prazne reference na nepostojeće fajlove.

**7. Prompt za Higgsfield**

Koristi odgovarajuće početne i završne referentne slike. Prompt je kreativni brief; konkretne parametre postavi prema trenutno dostupnom modelu.

> Create an approximately eight-second premium dairy commercial in one continuous, physically plausible shot. Match the supplied opening and closing reference images. Begin with an extreme close-up of milk flowing from beyond the top edge into a clear glass, forming a beautiful small wave. Start the visible action immediately. Pull the camera back with a short, confident acceleration and a subtle lateral arc, revealing the exact supplied milk bottle standing steadily beside the glass on a refined breakfast surface. Settle into the final product composition with soft deceleration. Preserve the bottle silhouette, cap, label, printed artwork, glass proportions and liquid appearance throughout. Use warm directional morning light, clean highlights, rich milk texture, a restrained cobalt-blue accent and a premium editorial food-photography finish. The camera movement should feel energetic, precise and smooth, with a clear reveal and a calm final hold. Keep clean negative space for website typography. No cuts, no shaky camera, no object morphing, no extra bottles appearing, no invented packaging, no generated titles, no added logos, no audio. The standing product bottle must remain stationary while the pouring stream enters from outside the frame.

Za mobilnu verziju dodaj:

> Compose specifically for a vertical 9:16 mobile screen. Keep the bottle and glass within the central safe region, with clean space in the upper third for a short headline and in the lower region for a website button. Arrange the scene for this vertical frame rather than cropping a horizontal composition. Preserve the same lighting, materials and visual identity.

Ako model ne sačuva štampu na flaši, koristi kontrolisanu kompoziciju zvanične ambalaže preko generisane scene. Ne prihvataj izmenjenu etiketu kao završen materijal. Ključni sadržaj, zvanični logo i sve kontrole ostaju HTML elementi.

**8. Struktura početne i prodajni tok**

1. Filmski uvod sa odmah dostupnim dugmetom i jasnim opisom ponude.
2. Izbor kravljeg ili kozjeg mleka, stvarna cena po jedinici, količina i dodavanje u korpu.
3. Provera lokacije, sledećeg termina i cene dostave, dostupna i iz zaglavlja i blizu kupovnih kontrola.
4. Objašnjenje jednokratne i redovne dostave, sa stvarnim obračunom.
5. Poreklo, stvarni ljudi i fotografije farme.
6. Tri kratka koraka: izbor, dostava, vraćanje flaša.
7. Autentična iskustva kada postoje, zatim praktična pitanja i odgovori.
8. Završni poziv na kupovinu.

Na kartici ili u neposredno otvorenom izboru omogući tok: vrsta → litre po dostavi → jednokratno / nedeljno / dvonedeljno → dodaj u korpu. Ponudi postojeće količine 2, 4, 8 L i drugi unos ako stvarna pravila to i dalje podržavaju.

Prikaži cenu po litru, izabranu količinu, zbir proizvoda po dostavi i trošak dostave čim je poznat. Kod pretplate jasno razlikuj zbir po isporuci od iznosa koji se naplaćuje za konkretan period. Ne pretpostavljaj da svaki mesec ima četiri dostave. Dok obračun nije dostupan, prikaži jasno stanje učitavanja umesto izmišljenog zbira.

Sačuvaj mogućnost mešovite korpe, različit ritam po stavci i postojeći serverski konačni obračun. Ne implementiraj drugu, konkurentsku korpu. Bočna korpa mora koristiti postojeći `CartProvider`; postojeća stranica `/korpa` ostaje dostupna.

Stranica proizvoda: velika fotografija, jasan panel za kupovinu, poreklo, količina, upotreba i čuvanje iz potvrđenih podataka. Proveri da obećanja u novom tekstu odgovaraju stvarnom proizvodu i uslovima. Ne izmišljaj recenzije, zdravstvene prednosti, sertifikate, sniženja ili preostalu zalihu.

Checkout: pregledni koraci ili kratke grupe polja, sačuvani unosi, vidljive greške i konačni troškovi pre potvrde. Izbegni uvođenje obavezne registracije ako je postojeći tok ne zahteva.

**9. Tehnički pristup animaciji**

Predlog: izolovana klijentska komponenta hero animacije uz GSAP ScrollTrigger, sa posebnim podešavanjima kroz `gsap.matchMedia()`. Zadrži običan skrol browsera. Naslov, linkovi i početni poster dolaze u početnom HTML-u.

ScrollTrigger podržava vezivanje napretka, zadržavanje sekcije i kratko ublažavanje praćenja. Koristi samo potrebne funkcije; dodatna biblioteka za preuzimanje skrola nije deo početnog rešenja. Dokumentacija: [ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/) i [matchMedia](https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/).

Prvo uporedi dva mala prototipa istog kadra:

- Video sa izvozom prilagođenim čestom traženju pozicije: najnoviji cilj napretka, bez gomilanja zahteva za svaku staru poziciju. Testiraj odziv dekodera i premotavanje na Safari i Chrome. MP4 i zbijeni ključni kadrovi sami po sebi ne garantuju glatkoću.
- Sekvenca slika na canvasu ako video primetno kasni: ograničena rezolucija, kontrolisan broj unapred dekodiranih kadrova oko trenutne pozicije i oslobađanje starih. Ne učitavati sve dekodirane slike u memoriju telefona. Biraj broj kadrova i DPR na osnovu merenja; 60 Hz interfejs nije isto što i 60 izvornih video kadrova u sekundi.

Izaberi jedan primarni način prikaza prema dokazima. Telefon učitava mobilni materijal, desktop odgovarajući veći; ne oba. Stari Three.js uvod ne sme istovremeno raditi iza nove scene.

Za animaciju slojeva koristi prvenstveno transformacije i providnost. Ne radi React state update za svaki kadar. Sve posmatrače, tajmere, dekodere i animacije očisti pri izlasku sa stranice. Proveri povratak browser Back dugmetom i vraćanje pozicije skrola.

Ako medij zakaže, nema pristupa mreži ili je uključeno smanjeno kretanje, poster i kupovina ostaju funkcionalni bez praznog zadržanog prostora. Nemoj menjati dužinu stranice naglo usred korisnikovog skrola kada video kasno stigne.

**10. Brzina i kriterijumi za glatkoću**

Početni budžeti za prototip, prilagodljivi nakon merenja:

- Mobilni poster do približno 150 KB; desktop poster do približno 250 KB.
- Mobilni video ciljano do 2,5 MB; desktop do 5 MB. Ako kvalitet ili seek izvoz traže više, uporedi alternative i dokumentuj odluku.
- Početna kupovna sekcija ne čeka animacione materijale. Fotografije ispod prvog ekrana učitavaju se odloženo.
- Cilj oko 60 fps za pomeranje interfejsa na referentnom telefonu, bez ponovljivih zastoja ili niza zamrznutih kadrova. Ovo je cilj koji treba izmeriti, a ne unapred obećan rezultat.
- Na sporijem uređaju prvo smanji rezoluciju i broj slojeva. Ako animacija i dalje zapinje, aktiviraj jednostavniji prikaz sa punom funkcionalnošću kupovine.

Core Web Vitals ciljevi: LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 na 75. percentilu stvarnih poseta, posebno za mobilne i desktop uređaje. Lokalni Lighthouse i tragovi performansi su razvojna provera; ne predstavljaju dokaz da su terenski ciljevi već ispunjeni. [Objašnjenje pragova](https://web.dev/articles/defining-core-web-vitals-thresholds).

Praktična definicija prihvatljive animacije: prvi pokret prsta daje vidljiv odgovor; brzo skrolovanje i promena smera ne stvaraju crn kadar; scena ne skače kada se Safari traka sakrije; tekst je čitljiv; korisnik može odmah do ponude; po izlasku iz uvoda prestaje nepotrebno renderovanje.

**11. Faze implementacije i dokaz završetka**

| Faza | Rad | Dokaz da je završena |
| --- | --- | --- |
| A — Uvid | Pregled koda, aktivnog sajta, podataka, materijala i stanja Git-a. | Kratka lista postojećih funkcija, nedostajućih materijala i početnih screenshotova. |
| B — Novi dizajn | Razrada prvog ekrana, ponude i kupovne kontrole prvo na telefonu, zatim na desktopu. | Stvarni prikazi na 390 i 1440 px; naslov, proizvod, cena i akcija imaju jasnu hijerarhiju. |
| C — Animacioni prototip | Tri dela priče, odgovor na skrol, mobilni i desktop kadar, poster i režim smanjenog kretanja. | Snimak ponašanja, merenje na uređajima i dokumentovan izbor videa ili sekvence. |
| D — Kupovina | Izbor, korpa, provera dostave, proizvod i checkout. | Ispravne količine, ritmovi i konačni iznosi kroz postojeće API-je. |
| E — Ostatak sajta | Zajednički izgled prodavnice, informativnih stranica, prijave i naloga; sadržaj i SEO. | Vizuelno usklađene ključne rute i očuvane funkcije. Admin dobija izmene samo ako ih integracija stvarno zahteva. |
| F — Završna provera | Responsive, pristupačnost, performanse i regresija. | Rezultati komandi i pregled uređaja, screenshotovi i otvorene stavke sa tačnim uzrokom. |

Faze su kontrolne tačke kvaliteta, ne automatski zahtevi za novo odobrenje. Kada nedostaje medij ili pristup, završi nezavisan deo i precizno izdvoji zavisnu stavku. Ne menjaj produkciona podešavanja i ne objavljuj sajt samo zato što je lokalni redizajn završen.

**12. Završna provera**

- Širine 360, 390, 430, 768, 1024 i 1440 px; mali ekran 375 × 667; portret i pejzaž gde je smisleno. Nema horizontalnog prelivanja.
- Stvarni iPhone Safari i Android Chrome kada su dostupni. Emulaciju jasno označi kao emulaciju, ne kao proveru fizičkog uređaja.
- Spor i brz skrol, promena smera, direktan link do ponude, osvežavanje usred stranice, Back navigacija i otvaranje korpe tokom uvoda.
- Spora mreža, nedostupan video, smanjeno kretanje, tastatura i uvećan tekst. Stranica ostaje upotrebljiva.
- Količine i ritam u mešovitoj korpi, ponovno učitavanje korpe, nedostupan proizvod, podržana i nepodržana dostava, serverska greška i prikaz stvarnog konačnog obračuna.
- Fokus u bočnoj korpi: zatvaranje, Escape, povratak fokusa i pravilna blokada pozadine. Ikonice imaju razumljive pristupačne nazive.
- Očuvani metapodaci, kanonski linkovi, semantička struktura i postojeća analitička saglasnost.
- Zadrži tačnu semantiku postojećih događaja. `purchase` ostaje vezan za potvrđenu naplatu; otvaranje stranice uspeha nije novi dokaz kupovine.
- Proveri postojeće skripte; pokreni `npm run lint`, `npm run typecheck`, odgovarajuće postojeće testove (`npm test`, `npm run test:vercel`, `npm run test:e2e`) u izolovanom test režimu prema konfiguraciji projekta. Dodaj ciljane testove samo za nove bitne ponašajne rizike, posebno izbor proizvoda, korpu i fallback animacije.
- Ranije postojeći pad testa razlikuj od nove regresije. Prijavi šta nije moglo da se izvrši i zašto.

Uspeh posle objave meri kroz završene kupovine i prihod po poseti, dodavanje u korpu, odustajanje na dostavi i checkout-u, uz podelu po uređaju. Poređenje animiranog i statičnog uvoda radi kada postoji dovoljno saobraćaja za smislen zaključak. Duže gledanje animacije samo po sebi nije prodajni uspeh.

**13. Očekivana završna isporuka Opusa**

Predaj izmenjen kod, uredno povezane stvarne materijale, screenshotove ključnih prikaza i kratak izveštaj o proverenim funkcijama i uređajima. Zabeleži performanse i odluku o načinu animiranja. Ako finalni Higgsfield materijal nedostaje, isporuči gotov paket za njegovo generisanje i tačno uputstvo za zamenu privremenog materijala; označi filmski deo kao nedovršen.

**Poruka za početak rada u Opusu:**

> Pročitaj `docs/OPUS-REDIZAJN-PLAN.md` i sva tri povezana v2 dokumenta, pa sprovedi paket u ovom repozitorijumu. Prethodne dizajnerske pravce zanemari. Prvo uradi mobilnu verziju, zatim desktop. Animacija treba da bude dinamična, glatka i kratka, sa neposrednim odzivom na skrol i odmah dostupnom kupovinom. Pročitaj `AGENTS.md` i lokalnu Next.js dokumentaciju pre koda, sačuvaj postojeće korisničke izmene. Koristi stvarne proizvode i serverske cene; ne izmišljaj količine pakovanja, pogodnosti, tvrdnje ili rezultate testiranja. Sprovedi AOV/LTV funkcije označene P0; P1 i P2 pripremi i aktiviraj samo prema uslovima u specifikaciji. Higgsfield produkcijski brief koristi isključivo za medije. Ako nemaš pristup generisanju, pripremi konkretan paket za web interfejs i nastavi sve nezavisne faze. Ne traži potvrdu za rutinske odluke. Završi implementaciju i relevantne provere i navedi tačne preostale spoljne zavisnosti.
