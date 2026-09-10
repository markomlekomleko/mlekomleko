# Mleko i Mleko — precizan produkcijski brief za Higgsfield, v2

Ovaj dokument namenjen je pripremi slika i videa. Opus ili drugi izvršilac sajta čita ceo izvršni paket; Higgsfield dobija reference i odgovarajući prompt iz ovog dokumenta. Ne slati video modelu poslovna pravila, React instrukcije, raspored checkout-a ili plan analitike.

Detaljan prompt smanjuje nejasnoću, ali ne garantuje tačan rezultat generativnog modela. Zato su obavezni referentne slike, pregled izlaza i kriterijumi odbacivanja. Ne tvrditi da model može da garantuje identičnu etiketu ili savršenu fiziku samo zato što je to napisano u promptu.

**H01. Precizno traženi rezultat**

Napraviti dve verzije istog kratkog filmskog prizora: horizontalnu 16:9 za desktop i vertikalnu 9:16 za telefon. Svaka traje ciljano 8 sekundi, bez zvuka i bez rezova. Kadar počinje blizu mleka koje se sipa u čašu, zatim dinamično otkriva flašu pored nje i završava stabilnom kompozicijom proizvoda.

Video će se na sajtu pomerati unapred i unazad prema skrolu. Ne praviti reklamu sa automatskim rezovima, naslovnim karticama, naracijom, titlovima, muzikom ili završenim ekranom za kupovinu.

Utisak: kvalitetan mlečni proizvod, ukusna tekstura, jasno staklo, uredna scena, jutarnje svetlo. Dinamika dolazi iz vidljivog sipanja i kontrolisanog pokreta kamere. Dovoljno promena da svaka faza skrola otkrije nešto novo, uz stabilnu i čitljivu prezentaciju proizvoda.

**H02. Obavezni ulazni materijali i registar**

Pre generisanja popuni sledeću tabelu stvarnim putanjama ili potvrđenim identifikatorima. Navedene oznake su nazivi u briefu, ne stvarni već postojeći fajlovi.

| Oznaka | Šta treba obezbediti | Za šta se koristi |
| --- | --- | --- |
| REF-PRODUCT-FRONT | Oštra frontalna fotografija stvarne flaše, čepa i etikete. | Oblik, materijal, štampa i proporcije. |
| REF-PRODUCT-ANGLE | Stvarna flaša iz približno tri četvrtine, ako je dostupna. | Kontrola dubine i bočne geometrije. |
| REF-LOGO | Zvanični logo, ako je potreban za kasniju kompoziciju. | Identitet; ne nalaže generisanje novog logotipa. |
| REF-DESKTOP-START | Završena početna kompozicija 16:9. | Početna slika video generacije. |
| REF-DESKTOP-END | Završena krajnja kompozicija iste scene 16:9. | Cilj pokreta kamere. |
| REF-MOBILE-START | Posebno komponovan početni kadar 9:16. | Početna mobilna slika. |
| REF-MOBILE-END | Krajnji kadar iste mobilne scene 9:16. | Završna mobilna kompozicija. |

Za svaki unos zabeleži: putanju, dimenzije, poreklo, da li je stvaran proizvod ili generisana atmosfera i da li je potvrđen. Ne pokušavaj da koristiš tekst `REF-PRODUCT-FRONT` kao stvarni upload ID.

Ako zvanična ambalaža nema etiketu, sačuvaj je bez etikete. Ne izmišljaj brendiranu flašu. Ako nema potvrđene ambalaže, može se pripremiti test atmosfere sa demo flašom uz jasno označen razvojni status; takav video nije finalan prikaz proizvoda.

**H03. Zaključana scena**

U finalno otkrivenom kadru nalaze se tačno:

1. Jedna stvarna flaša odabranog proizvoda, uspravna i nepomična na podlozi, sa odgovarajućim zatvorenim čepom ako ga referenca prikazuje.
2. Jedna providna bezbojna čaša, jednostavnog oblika, bez štampe i bez drške.
3. Topla, svetla, mat podloga nalik finom kamenu ili mirnom stolu, bez upadljivih šara.
4. Jedan mali deo kobaltne tkanine pri zadnjoj/desnoj ivici, dovoljno diskretan da ne privlači pažnju sa mleka.

Pozadina je svetla, mirna i van fokusa. Nema ljudi, ruku, životinja, farme kroz prozor, kroasana, sira, jogurta, meda, dodatnih flaša, biljaka ili dekoracije koja nije navedena. Time se izbegava sugerisanje proizvoda koji nisu u ponudi.

Mleko ulazi u čašu iz izvora van gornje ivice kadra. Stacionarna zatvorena flaša na stolu nije izvor mlaza. Ne sme se otvoriti, levitirati ili sama sipati. Mlaz je usmeren u čašu i ne dolazi iz zida ili površine flaše. Posuda iz koje se sipa ostaje van kadra tokom celog snimka.

Čaša počinje delimično napunjena; nivo raste prirodno do približno dve trećine visine, bez prelivanja. Mleko je belo sa toplim refleksijama, tečno i uverljivo. Male površinske oscilacije su poželjne; bez lepljivih niti, guste kreme koja se ponaša kao plastika ili velikih prskanja.

Svetlo dolazi stabilno iz gornjeg levog pravca. Senke zadržavaju isti smer i kontinuitet. Ambalaža ne menja oblik, boju, veličinu čepa ili raspored štampe. Promena prividne veličine sme da dolazi samo od perspektive i udaljavanja kamere.

**H04. Kompozicija desktop završnog kadra**

Koordinate su vizuelne smernice za izradu referentnih slika: x od leve ivice, y od gornje, u procentima kadra. Nisu očekivanje da video model numerički precizno tumači koordinate; kompoziciju treba vidljivo ostvariti u priloženim slikama.

- Odnos 16:9; referentni master ciljano 1920 × 1080 ili veći istog odnosa ako alat to podržava.
- Flaša: centar približno x=76%, y=52%; visina oko 62% kadra; cela flaša i čep u kadru, kontakt sa stolom vidljiv.
- Čaša: centar približno x=57%, y=70%; visina oko 27% kadra. Ne prekriva etiketu flaše.
- Miran prostor za HTML naslov: približno x=6–40%, y=16–60%.
- Prostor za HTML akciju: približno x=6–40%, y=65–85%.
- Donja ivica stakla i njegova senka ne smeju biti odsečeni.
- Nema stvarnog teksta na levoj strani slike. Prostor se samo ostavlja mirnim za web dizajn.

Početna desktop slika je bliži pogled na istu čašu i mlečni talas. Desni deo scene nosi radnju; leva oblast ostaje dovoljno mirna za naslov. Flaša može biti van početnog bliskog kadra i otkriva se pomeranjem kamere, bez nastajanja ili preliva iz drugog objekta.

**H05. Kompozicija mobilnog završnog kadra**

- Odnos 9:16; referentni master ciljano 1080 × 1920 ili odgovarajuća podržana rezolucija.
- Flaša: centar približno x=62%, y=53%; visina oko 46% kadra. Čep i dno potpuno vidljivi.
- Čaša: centar približno x=33%, y=65%; visina oko 23% kadra. Dovoljno razdvojena od flaše da se oba oblika čitaju.
- Gornji prostor y=5–26% miran je za naslov.
- Donji prostor y=83–96% miran je za akciju; stvarne HTML kontrole dodatno uvažavaju safe-area telefona.
- Ključni proizvod je unutar približno x=12–90%, y=29–79%.
- Ambalaža, svetlo, podloga i plavi akcenat odgovaraju desktop verziji. Mobilni raspored je zasebna scena istog identiteta, ne centralni crop horizontalnog videa.

Početni mobilni kadar zadržava mirnu gornju oblast i radnju u srednjem delu. Kod kraćih uređaja izvršilac sajta može staviti tekst u zaseban HTML blok; u generisanoj slici i dalje nema teksta ili nacrtanih dugmadi.

**H06. Vremenska mapa — osam sekundi izvornog materijala**

| Vreme | Kamera | Mleko i objekti | Obavezan vizuelni rezultat |
| --- | --- | --- | --- |
| 0,0–1,2 s | Bliski, stabilan početak; od prvih kadrova blag pomak unazad. | Mlaz već ulazi u čašu; vidi se mali talas. | Trenutan život u kadru, bez praznog uvoda i bez fade-in iz crnog. |
| 1,2–4,0 s | Ubrzavanje u kontrolisanom udaljavanju, sa blagim bočnim lukom; nema naglog panovanja. | Flaša se otkriva zato što kadar obuhvata više iste scene. Sipanje ostaje u čaši. | Najizraženija promena veličine i otkrivanje proizvoda. |
| 4,0–6,4 s | Meko usporavanje prema završnoj kompoziciji. | Mlaz se postepeno prekida do kraja ove faze; površina se smiruje. | Jasna flaša, čitljiva geometrija i sve manje kretanja kamere. |
| 6,4–8,0 s | Stabilan završetak sa veoma blagim preostalim pomakom ili mirnim kadrom. | Preostali sitni talasi na mleku, objekti miruju. | Kvalitetan finalni kadar koji može da ostane prikazan na sajtu. |

Ukupan bočni luk je mali, vizuelno približno 5–10°, a ne kruženje od 90° oko proizvoda. Cilj nije dron ili akcioni sport. Promena tempa mora da se vidi između bliskog početka, otkrivanja i završnog smirivanja.

Nemoj zahtevati od modela da tokom snimka prebacuje horizontalni kadar u vertikalni, flašu u UI karticu ili mleko u logo. Svaki video je jedan format. Web prelaz se radi odvojeno.

**H07. Izrada početnih i završnih slika**

Prvo pripremi kvalitetan završni kadar sa potvrđenom flašom. Zatim pripremi kompatibilan početni kadar istog seta. Početna i završna slika moraju biti dva pogleda na istu scenu: isti objekti, ista strana etikete, ista vrsta stola i isto svetlo.

Ako alat podržava više referenci, koristi ih prema stvarno dokumentovanim ulogama. Ne tvrdi da model može da primi dodatnu referencu ili određeni broj slika dok nije potvrđeno u interfejsu/API-ju.

Brief za završnu referentnu sliku:

> Create a premium editorial dairy product photograph using the supplied real product bottle reference. Preserve the exact bottle, cap and existing label artwork; if the real bottle has no label, keep it unlabelled. Place one bottle upright and stationary beside one simple transparent drinking glass filled approximately two thirds with milk. Use a warm pale matte surface, a quiet softly blurred background and one restrained cobalt fabric accent near the rear right edge. Keep directional morning light from the upper left, natural glass reflections and stable contact shadows. No people, hands, extra food, extra bottles, new branding or written copy. Compose the product placement and empty typography zones exactly as shown in the supplied layout reference. The result is an image for a website background, not a complete website mockup.

Brief za početnu referentnu sliku:

> Create the close opening view of the same approved dairy scene. Show the same clear glass with milk pouring into it from beyond the upper frame edge, forming a small realistic surface wave. Preserve the approved light direction, surface and visual identity. The stationary product bottle will be revealed later by the camera pulling back and may be outside this close crop. Keep the designated typography area quiet. Do not introduce new objects, hands, text, logos, excessive splashes or a different glass shape. This image must be visually compatible with the supplied final frame as another view of the same physical scene.

Ove instrukcije su za pripremu slika; finalna kompozicija i očuvanje zvaničnih sredstava moraju se proveriti. Po potrebi koristi kontrolisanu montažu stvarne flaše umesto generisanja nove ambalaže.

**H08. Gotov prompt za desktop video**

Uz prompt priloži potvrđenu početnu i završnu desktop sliku u odgovarajuće uloge alata. Postavi 16:9 i 8 s ako su podržani; ako nisu, izaberi najbližu podržanu dužinu i dokumentuj kako se ista vremenska mapa proporcionalno prilagođava.

> Create one continuous eight-second 16:9 premium dairy product shot that matches the supplied start and end images. This clip is intended for a website animation controlled by scrolling, so every stage must remain clean and readable when paused or viewed in reverse. Begin immediately with a close view of milk pouring from beyond the upper frame edge into the approved clear glass, creating a small natural surface wave. Keep the left-side typography area quiet. During approximately the first 1.2 seconds, begin a small backward camera move. From 1.2 to 4.0 seconds, accelerate smoothly into a confident pullback with a very small lateral arc, revealing the exact approved product bottle standing steadily to the right of the glass. The bottle is already present in the physical scene; reveal it through framing, never through morphing or appearing. From 4.0 to 6.4 seconds, ease the camera into the supplied final composition while the pouring stream tapers off. From 6.4 to 8.0 seconds, settle into a polished final product view with only small residual ripples in the milk. Preserve the exact real bottle silhouette, cap, label artwork, materials and proportions. The standing bottle stays closed and stationary and is not the source of the pouring stream. Use the approved warm matte surface, upper-left morning light, clean glass highlights and subtle cobalt accent. Keep the bottle and glass on the right, with clear negative space on the left. Make the reveal energetic and precise, then finish calmly. No edits, no cuts, no shaky camera, no rapid orbit, no bottle rotation, no object morphing, no extra objects, no overflowing milk, no text, no subtitles, no added logos, no UI graphics and no audio.

**H09. Gotov prompt za mobilni video**

Uz prompt priloži zasebnu početnu i završnu mobilnu sliku. Postavi 9:16. Ovaj prompt je kompletan; ne zahteva da alat vidi desktop razgovor.

> Create one continuous eight-second 9:16 premium dairy product shot for a mobile website, matching the supplied vertical start and end images. Compose natively for a phone screen. Keep the upper part of the image quiet for a short website headline and the bottom area quiet for a website action button; do not render any text or buttons. Begin immediately with a close view of milk pouring from beyond the upper frame edge into the approved clear glass, forming a small realistic wave. During the first 1.2 seconds, start a subtle camera pullback. From 1.2 to 4.0 seconds, smoothly accelerate the pullback with only a small lateral arc to reveal the exact supplied bottle on the center-right, with the glass lower and to its left. Keep both objects inside the approved central composition. From 4.0 to 6.4 seconds, decelerate into the supplied final vertical frame while the stream stops naturally. From 6.4 to 8.0 seconds, hold the refined product composition with only residual milk ripples. Preserve the real bottle shape, cap, existing label artwork, proportions and contact with the surface. The standing bottle remains closed and stationary; the stream comes from outside the frame, not from that bottle. Use warm light from the upper left, a pale matte surface, a clean softly blurred background and the approved small cobalt accent. Make the change from close texture to clear product reveal dynamic, smooth and readable on a small screen. This is a native vertical composition, not a crop of a wide shot. No scene cuts, no camera shake, no extreme orbit, no morphing, no extra bottles or food, no hands, no overflowing milk, no written text, no added logos, no website mockup and no audio.

**H10. Izbor modela i iteracije**

Kling v3.0 je u ranijoj proveri povezanog kataloga bio kandidat koji podržava početnu i završnu sliku. Izvršilac mora ponovo proveriti svoj pristup, dostupne parametre i cenu. Ne pretpostavljati da maksimalan paket naloga znači neograničen broj generacija određenog modela.

Redosled: jedna početna generacija → pregled → jedna ciljana izmena → po potrebi još jedna ciljana izmena. Ne menjaj istovremeno ambalažu, svetlo, kadar i model kada popravljaš samo jednu grešku. Posle neuspešnih ciljanih pokušaja zabeleži problem i predloži kontrolisanu kompoziciju ili jednostavniji pokret iste scene. Nemoj trošiti neograničeno pokušavajući da promptom rešiš trajno pogrešnu geometriju.

Primeri korekcija koje se dodaju uz originalne reference:

- Flaša menja etiketu: „Preserve the supplied printed artwork without changes throughout; reduce lateral camera motion and keep the approved front label orientation.“ Ako i dalje ne uspe, koristiti odvojenu stvarnu ambalažu u montaži.
- Kadar je dosadan: „Make the close-to-wide reveal visibly stronger during the middle third; shorten the initial near-static phase while preserving smooth acceleration and a calm finish.“
- Kadar je previše brz: „Reduce the lateral arc and remove abrupt speed changes; keep the main change as a controlled pullback.“
- Telefon seče čep: ponovo pripremiti završnu referentnu sliku sa punim proizvodom u centralnoj oblasti; ne oslanjati se samo na dopisivanje „do not crop“.
- Mleko ima lošu fiziku: smanjiti mlaz i visinu pada, izbaciti prelivanje i koristiti mirniju referentnu površinu. Pregledati ceo klip ponovo.

**H11. Kontrola kvaliteta i razlozi za odbacivanje**

Obavezno pregledati ceo klip normalnom brzinom, zatim sporije i unazad. Izdvojiti kadrove na 0, 1, 2, 3, 4, 5, 6, 7 i kraju. Pregledati i finalni web izvoz, ne samo veliki original.

| Provera | Prihvatljivo | Odbaciti / popraviti |
| --- | --- | --- |
| Identitet | Isti oblik, čep i potvrđena štampa. | Promena slova, logotipa, čepa, širine ili vrste ambalaže. |
| Objekti | Jedna flaša, jedna čaša; stabilan kontinuitet. | Dupliranje, nestajanje, nastajanje ili spajanje. |
| Sipanje | Mlaz ulazi u čašu, nivo raste i ostaje ispod ruba. | Mlaz iz zatvorene flaše, prolazak kroz staklo, prelivanje, nestanak tečnosti. |
| Svetlo | Kontinuirane senke i refleksije. | Treperenje, promena pravca svetla i skok ekspozicije. |
| Kamera | Jasan pomak od teksture do proizvoda, kontrolisan tempo. | Statičan klip gotovo bez otkrivanja, trzaj, rez ili prevelika rotacija. |
| Telefon | Flaša i čaša u centralnoj oblasti, čep i dno vidljivi. | Odsečen proizvod ili važan detalj ispod prostora za dugme. |
| Prostor za web tekst | Mirna zona uz dobar kontrast u ključnim kadrovima. | Mlaz/etiketa prelaze preko celog prostora za tekst bez mogućnosti čitljivog prikaza. |
| Finalni kadar | Stabilan i dovoljno oštar da ostane na ekranu. | Motion blur, deformacija ili prazna završna sekunda. |
| Čistoća materijala | Bez neplaniranih grafika ili teksta. | Generisani CTA, titlovi, novi logo ili drugi neželjeni elementi. |

Test prostora za tekst radi se kompozicijom stvarnog HTML naslova preko kadrova u prototipu sajta. Sam pregled videa bez naslova ne dokazuje da je kompozicija dobra za sajt.

Ako isti proizvod ne može da se očuva u generisanom pokretu, prihvatljiva rezervna produkcija je stvarna izrezana fotografija flaše u prvom planu uz generisano sipanje/pozadinu i kontrolisan pokret slojeva. Senke, perspektiva i odnos prema čaši moraju vizuelno biti usklađeni. Rezultat se proverava po istim kriterijumima.

**H12. Isporuka materijala i integracija**

Izvesti stvarno dostupne fajlove, zabeležiti rezoluciju, trajanje, fps, veličinu, codec i audio status. Ne označavati fajl „4K“ ili „60 fps“ ako rezultat to nije. Veštačko uvećavanje ne rešava pogrešnu etiketu ili lošu fiziku.

Za svaku verziju predati: odabrani video master, početni poster, završni kadar i pregled kontakt-kadrova za QA. Izvršilac sajta pravi optimizovane web verzije iz odabranog mastera i proverava prikaz; nema potrebe da telefon preuzima ogroman master.

Finalna javna struktura prati glavni plan: `public/media/hero/hero-desktop.mp4`, `hero-mobile.mp4`, `poster-desktop.webp`, `poster-mobile.webp`, `end-desktop.webp`, `end-mobile.webp` i manifest sa stvarnim podacima. Napraviti samo fajlove koji zaista postoje i ne vraćaju grešku. Manifest treba da evidentira i da li je materijal privremen ili finalan.

Čuvati izvorni prompt i identifikator generacije kada postoje, naziv korišćenog modela, reference i razlog izbora finalne varijante. Ovo omogućava sledećem izvršiocu da nastavi bez ponovnog izmišljanja scene.

Ako Opus nema direktan pristup Higgsfieldu, predaje ova dva gotova video prompta i stvarne referentne slike osobi/alatu koji ima web pristup. Nakon izvoza u projekat integracija nastavlja iz istih fajlova. Status bez izvoza: „Interfejs spreman, finalni medij nedostaje“; ne „animacija završena“.
