# Mleko i Mleko — detaljna specifikacija sajta, v2

Ovaj dokument precizira `OPUS-REDIZAJN-PLAN.md`. Namenjen je Opusu ili drugom izvršiocu koji ima pristup repozitorijumu. Uz njega su obavezni `AOV-LTV-SPECIFIKACIJA.md` i `HIGGSFIELD-PRODUKCIJSKI-BRIEF.md`. Dokument opisuje budući rezultat; imena predloženih novih komponenti nisu dokaz da one već postoje.

**D01. Kako razlikovati činjenicu od predloga**

Svaku zavisnost označi jednim od četiri statusa u radnom registru:

| Status | Značenje | Postupak |
| --- | --- | --- |
| PROVERENO | Pročitano iz aktuelnog izvora ili neposredno potvrđeno od vlasnika. | Koristi sa navedenim izvorom. |
| ODLUKA DIZAJNA | Precizno zadato ovim briefom, ne tvrdi ništa o poslovanju. | Implementiraj; prilagodi samo radi funkcionalnosti ili dokazane greške prikaza. |
| PREDLOG ZA TEST | Poslovna ili prodajna hipoteza. | Pripremi iza isključene opcije kada nisu potvrđeni potrebni podaci. |
| NEDOSTAJE | Materijal ili vrednost nema potvrđen izvor. | Bez izmišljanja; koristi navedeno rezervno ponašanje i nastavi nezavisan deo. |

Primer: kobaltna boja dugmeta je odluka dizajna; aktuelna cena mleka mora biti proverena; popust od 10% nije definisan ovim paketom i ne sme se samostalno uvesti.

Radni registar treba da sadrži: oznaku zahteva, status, izvor, datum provere, implementirani fajl i dokaz provere. Može biti Markdown tabela u `docs/redesign-implementation-report.md`, koji izvršilac tek kreira.

**D02. Izvori podataka i zabranjene pretpostavke**

| Podatak | Izvor | Kada nedostaje |
| --- | --- | --- |
| SKU, naziv, aktivnost, jedinica, cena | Proizvodi iz stvarnog storefront/API odgovora. | Ne kreirati izmišljeni proizvod ili cenu. Prikazati stanje nedostupne ponude. |
| Cena pretplate | Server, za dozvoljeni način kupovine. | Jednokratna cena samo ako server tako vraća; nema izmišljene uštede. |
| Zapremina fizičke flaše | Potvrđeni katalog/ambalaža; proveriti značenje jedinice. | Pisati neutralno „jedinica“ gde je potrebno; ne izjednačavati 1 kom i 1 L. |
| Dostava i rok za izmene | Server i aktuelna poslovna podešavanja. | Ne računati datum iz teksta na staroj stranici. Prikazati da je provera potrebna. |
| Cena dostave i zbir | Aktuelni `POST /api/cart` obračun. | Stanje učitavanja/greške; nema prividne besplatne dostave. |
| Logo i etiketa | Zvanični fajl koji je vlasnik potvrdio. | Postojeći potvrđeni logo; demo medij jasno evidentirati. Ne generisati novu etiketu. |
| Poreklo i svojstva mleka | Potvrđeni sadržaj i proizvodni podaci. | Izostaviti nepotvrđenu tvrdnju. |
| Fotografije ljudi i farme | Autentični materijali sa potvrđenim značenjem. | Sekciju prilagoditi raspoloživom sadržaju; generisana farma nije dokumentarna fotografija. |
| Recenzije i ocena | Stvarna evidencija kupaca. | Izostaviti blok; bez praznih zvezdica i izmišljenih imena. |
| Troškovi i marža | Privatni poslovni podaci. | Profitabilnost označiti kao neizračunatu. Nula u podrazumevanom polju nije potvrđen trošak. |

Trenutni kod pregledan 9. septembra 2026. sadrži jedan osnovni kalendar dostave i proveru poštanskog broja. Nemoj obećati posebne termine po gradu bez provere stvarne podrške. Stari FAQ i marketinški tekst mogu biti neusaglašeni sa serverom; tu razliku evidentiraj i otkloni u prikazu na osnovu potvrđenih pravila.

Koristi srpsku latinicu i jedninu u novom prodajnom tekstu. Placeholder obeležen vitičastim zagradama u ovom dokumentu predstavlja podatak za zamenu; nikada ga ne prikazuj korisniku doslovno.

**D03. Sistem rasporeda**

Početne vrednosti koje treba implementirati pa vizuelno proveriti:

| Parametar | Telefon < 768 px | Tablet 768–1199 px | Desktop ≥ 1200 px |
| --- | --- | --- | --- |
| Spoljna margina sadržaja | 20 px; 16 px na 360 px | 32 px | 48 px, maksimalna širina sadržaja 1360 px |
| Razmak između velikih sekcija | 48–64 px | 72 px | 96 px |
| Razmak unutar prodajnog panela | 12–20 px | 16–24 px | 16–24 px |
| Osnovni tekst | 16 px / 1,5 | 16–18 px / 1,5 | 18 px / 1,5 |
| Hero naslov | 44–56 px / oko 1,0 | 64–80 px | 88–112 px |
| Naslov sekcije | 30–36 px | 40–48 px | 48–64 px |
| Dugme glavne akcije | 52 px minimalne visine | 52 px | 52 px |
| Zaobljenje kontrola | 12 px | 12 px | 12 px |
| Zaobljenje većih fotografija | 20 px | 24 px | 28 px |

Cene i osnovni tekst nikada se ne smanjuju da bi blok stao u zamišljenu visinu. Pusti da se tekst prelomi i da sekcija poraste. Na svim kontrolama omogući vidljivu fokus oznaku. Sekundarne akcije imaju jasan tekst i dovoljnu veličinu, bez nadmetanja sa glavnim dugmetom.

Paleta iz početnog plana je odluka dizajna za prototip; proveri kontrast i usklađenost sa logotipom pre finalizacije. Font odaberi iz dostupnih, licenciranih opcija sa č, ć, š, ž i đ; zapiši stvarno ime izabranog fonta. Ne tvrdi da je plaćeni font dostupan bez fajla ili licence.

**D04. Zaglavlje**

Telefon: levo logo, desno korpa sa brojem jedinica i dugme menija. Visina oko 64 px plus bezbedna zona uređaja. Desktop: logo, „Mleko“, „Kako dostavljamo“, „Naše poreklo“, „Moj nalog“, korpa. „Mleko“ vodi na ponudu na početnoj ili na prodavnicu sa druge rute. Provera dostave dostupna je u meniju i kod ponude.

Na vrhu je dozvoljena jedna kratka informativna traka samo ako postoji aktuelna potvrđena poruka. Nema izmišljenog odbrojavanja, lažne ograničene zalihe ili neaktivnog kupona. Izbegni istovremeno fiksiranje trake, velikog zaglavlja i dodatnog promotivnog bloka na telefonu.

Mobilni meni: pravi dijalog ili panel sa jasnim zatvaranjem, kontrolisanim fokusom i povratkom fokusa na dugme menija. Ne otvarati automatski pri prvom dolasku.

**D05. Prvi ekran i veza sa animacijom**

Tekst prvog ekrana:

- H1: „Jutro počinje ovde.“
- Opis, kada su obe vrste i ambalaža potvrđeni: „Kravlje i kozje mleko u povratnim staklenim flašama.“
- Glavno dugme: „Izaberi svoje mleko“ → `#izaberite-mleko`.
- Sekundarni tekstualni link: „Proveri dostavu“ → odgovarajući obrazac.
- Mala oznaka kretanja: „Skroluj i otkrij“, dekorativna u odnosu na kupovne kontrole.

Prostor za proizvod, tekst i dugmad mora postojati i u prvom HTML prikazu. Medij nema ugrađene naslove i dugmad. Na velikom telefonu može se koristiti tekst preko mirne gornje oblasti kadra. Na kratkom ekranu tekst i akcije prebaci u sopstveni blok iznad/ispod medija i skrati zadržavanje scene; nemoj rezati dugme da bi zadržao naslov ogromnim.

Na 375 × 667 px proveri prvi ekran sa stvarnom adresnom trakom, koliko to alat dozvoljava. Ako kompletan osnovni sadržaj ne može da stane uz normalan font i dugme, prioritet imaju naslov, razumljiv proizvod i akcija; indikator skrola i sekundarne poruke se sklanjaju. Korisnik sa uvećanim tekstom dobija normalan tok bez prisilne visine.

Klik na „Izaberi svoje mleko“ mora preskočiti celu zadržanu oblast. Cilj nije virtualna pozicija u samom videu, već vidljiv naslov i prve kontrole ponude, uz uračunato zaglavlje. Za reduced-motion koristi neposredan skok bez animiranog putovanja kroz stranicu.

Animacioni materijal preciziran je u posebnom Higgsfield briefu. Promena oblika medijskog okvira i otkrivanje kartica izvode se kodom; video ih ne generiše.

**D06. Stanja hero komponente**

| Stanje | Vidljiv rezultat | Dopušten prelaz |
| --- | --- | --- |
| Poster | Optimizovana slika, naslov, dugmad; potpuna funkcionalnost. | Učitavanje medija nakon prioritetnog sadržaja. |
| Učitavanje | Isti poster, bez prekrivajućeg spinnera. | Spreman ili greška. |
| Spreman | Medij dekodiran i kontroler može pouzdano prikazati ciljnu poziciju. | Aktiviranje pre ulaska ili na stabilnoj tački bez skoka layouta. |
| Aktivan | Jedan napredak kontroliše medij i HTML slojeve. | Izlazak, smanjeno kretanje, greška. |
| Izvan scene | Poslednji/prvi relevantni kadar; nema stalnog renderovanja. | Povratak u scenu obnovi tačnu poziciju. |
| Reduced-motion / kvar | Statična završena kompozicija i normalan tok dokumenta. | Bez beskonačnih ponovnih pokušaja. |

Zadrži prirodno skrolovanje browsera. Kasno učitan medij ne sme iznenada dodati stotine piksela prostora ispred korisnika. Planiraj dimenzije unapred ili odloži aktiviranje do sledećeg prikladnog ulaska. Isključi stari Three.js renderer na rutama sa novim uvodom.

**D07. Sekcija ponude: tačan sastav**

Sidro: `izaberite-mleko`. H2: „Izaberi svoje mleko“. Uvod: „Odaberi količinu i koliko često želiš dostavu.“

Na telefonu proizvodi idu jedan ispod drugog, sa dovoljno kompaktnom fotografijom da se do cene i izbora stiže kratkim skrolom. Na desktopu dve kolone za dve glavne vrste. Ako aktivni katalog ima drugačiji broj proizvoda, raspored prilagodi stvarnim podacima; ne dupliraj karticu zbog simetrije.

Svaki proizvod sadrži, ovim redom:

1. Stvarnu fotografiju sa tačnim opisom; naziv je link do stranice proizvoda.
2. Naziv i jednu kratku potvrđenu rečenicu opisa.
3. Cenu po prodajnoj jedinici. Cenu po litru prikazuj samo ako se zapremina može pouzdano izračunati.
4. Polje „Količina po dostavi“ sa brzim opcijama 2, 4 i 8 L samo ako proizvod i backend stvarno koriste litre; inače opcije u ispravnoj jedinici.
5. „Druga količina“ otvara numeričko polje sa postojećim serverskim ograničenjima. Negativno, nula, decimalno ili preveliko ne sme neprimetno postati druga količina.
6. Izbor „Jednokratno“ / „Redovna dostava“. Novom kupcu je početno jednokratno; postojeći eksplicitni izbor se pamti za isti proizvod u toku sesije.
7. Kod redovne dostave prikazati „Svake nedelje“ / „Svake 2 nedelje“ i datum početka koji vraća server.
8. Zbir za izabrani proizvod po prvoj isporuci, odvojeno od ukupnog obračuna ako postoji više termina.
9. Dugme „Dodaj u korpu“ i link „Detalji proizvoda“.

Promena režima ne dodaje proizvod sama. Količina, ritam i način kupovine čine jedan eksplicitan izbor. Pre dodavanja nepodržana pretplata mora biti onemogućena, a objašnjenje vidljivo.

Ako se menja više izbora brzo, prikaži isključivo odgovor poslednjeg relevantnog serverskog zahteva. Tokom obračuna ne prikazuj staru cenu kao konačnu za novi izbor. Pre potvrde kupovine server ponovo proverava ceo sadržaj.

**D08. Provera dostave**

Polje: „Poštanski broj“, pet cifara, numerička tastatura, dugme „Proveri dostavu“. Ako pravila projekta podržavaju drugačiji format, primeni potvrđena pravila i izmeni validaciju dosledno.

Stanja i tekst:

| Stanje | Tekst / ponašanje |
| --- | --- |
| Nije uneto | „Proveri da li dostavljamo na tvoju adresu.“ |
| Neispravan format | „Unesi poštanski broj od pet cifara.“ |
| Provera | „Proveravamo dostavu…“; onemogućen dupli submit. |
| Podržano | „Dostavljamo na tvoju lokaciju.“ i serverom potvrđen sledeći datum. |
| Nepodržano | „Ova lokacija trenutno nije u zoni dostave.“; ponudi kontakt, bez obećanja proširenja. |
| Mrežna greška | „Provera trenutno nije dostupna. Pokušaj ponovo.“; unos ostaje sačuvan. |

Podržan poštanski broj nije sam po sebi dokaz slobodnog termina ili kapaciteta. Prikaz konačne dostupnosti mora odgovarati serveru. Dostava u korpi uvek koristi aktuelni obračun. Promena lokacije poništava prethodni rezultat; stari pozitivan odgovor se ne sme prikazati za novi unos.

**D09. Korpa i akcije koje naplaćuju**

Bočna korpa koristi postojeći `CartProvider`. Na telefonu može zauzeti ceo ekran; na desktopu panel približno 440–480 px. Vrh: „Tvoja korpa“, broj stavki i dugme zatvaranja. Sredina: stavke. Dno: zbir i primarna akcija. Sadržaj se skroluje unutar panela, a ukupni iznos ostaje dostupan bez prekrivanja poslednje stavke.

Stavka: slika, naziv, količina po isporuci, jednokratno ili ritam, cena za relevantni obračun, kontrole izmene i uklanjanje. Za pretplatu prikazati broj termina i omogućiti pregled datuma. Ne sabirati različite ritmove u nejasnu jedinstvenu „cenu dostave“.

Ispod stavki ide najviše jedna preporuka iz AOV specifikacije. Posle nje ukupan obračun: proizvodi, stvarni popust, dostava, kredit kada postoji, ukupan iznos i period. Ako iznos nije trenutno potvrđen, dugme za finalnu naplatu nije aktivno.

Glavna akcija obične korpe: „Nastavi na poručivanje“. Dodavanje u običnu korpu nije naplata. Akcija dodatka postojeće pretplate može stvarno napraviti i naplatiti novu porudžbinu; ona zahteva poseban pregled sa iznosom i eksplicitnim dugmetom, prema AOV/LTV specifikaciji.

Prazna korpa: „Korpa je prazna.“ i „Izaberi mleko“. Greška obračuna čuva stavke i nudi ponovni pokušaj. Nedostupan proizvod jasno označi i zatraži uklanjanje ili drugi izbor; nemoj ga tiho zameniti.

**D10. Donja mobilna traka**

Na stranici proizvoda ili aktivnom konfiguratoru pojavljuje se tek kada je primarno dugme izvan prikaza. Levo: naziv ili kratka oznaka izbora i relevantni iznos. Desno: „Dodaj u korpu“.

Na početnoj, pre nego što je kupac izabrao proizvod, eventualna traka može sadržati samo „Izaberi mleko“ i voditi do ponude. Ne prikazuj proizvoljan zbir niti dodaj unapred odabran skuplji paket.

Traka se skriva kada su otvoreni meni, korpa, modal, tastatura u unosu ili dijalog saglasnosti koji bi je prekrio. Sadržaj ima donji razmak jednak stvarnoj visini trake i safe-area prostoru. Nikada dve konkurentske fiksne kupovne trake.

**D11. Sekcije poverenja i sadržaja**

Posle ponude/paketa dolaze:

- „Kako stiže do tebe“: izbor → potvrđen termin → preuzimanje i povrat ambalaže prema stvarnim pravilima. Kratke rečenice, tri jasna koraka.
- „Odakle dolazi tvoje mleko“: potvrđen tekst i autentični materijal. Ako nema materijala za farmu, koristi proverene informacije o poreklu proizvoda i link ka detaljima.
- „Tvoj ritam dostave“: jednokratno, nedeljno ili dvonedeljno, uz jasnu mogućnost izmene do navedenog roka. Ne pisati „u bilo kom trenutku“ ako postoje cutoff pravila.
- „Pre prve porudžbine“: stvarna pitanja o dostavi, pakovanju, čuvanju, plaćanju i promenama pretplate. Cene i datumi se ne kopiraju u statičan FAQ koji se kasnije razilazi sa obračunom.
- Završni blok: „Spremno za tvoje sledeće jutro?“ i dugme do ponude. Bez novih neproverenih obećanja.

Sekciju recenzija uključi samo sa autentičnim sadržajem. Javni raspored ne sme otkrivati oznake poput „nedostaju marketinški podaci“; to ide u izveštaj implementacije.

**D12. Stranica proizvoda, nalog i checkout**

Proizvod koristi isti konfigurator kao početna, uz više fotografija i detalja. Sačuvaj isti izbor pri otvaranju detalja kada je to izvodljivo, bez slučajnog dodavanja u korpu. Na desktopu fotografije levo, konfigurator desno; na telefonu fotografija, naziv, cena i kontrola bez dugog uvoda.

Nalog prvo prikazuje sledeću isporuku, sadržaj, rok izmene i iznos. Zatim postojeće akcije pretplate i istoriju. Prazan nalog nudi ponovnu kupovinu ili izbor proizvoda. Pauzirana i otkazana pretplata imaju različite poruke i akcije prema serveru.

Checkout zadržava potrebna polja i postojeći tok. Grupisanje: kontakt → adresa i dostava → način plaćanja → pregled. Na telefonu to može biti jedna kratka stranica sa grupama, bez izmišljenog višekoračnog procesa koji komplikuje postojeću logiku.

Pri grešci ostaju popunjena polja; fokus ide na prvu relevantnu grešku. Konačno dugme jasno opisuje akciju i iznos kada to omogućava payment tok. Kartični podaci ostaju kod stvarnog payment provajdera. Gotovinska porudžbina nije „plaćena“ samo zato što je potvrđena.

**D13. Dokazi prihvatanja**

Za svaki dokaz sačuvaj uređaj/browser, širinu i datum. Fizički uređaj i emulacija imaju različitu oznaku.

| ID | Scenario | Očekivanje |
| --- | --- | --- |
| UI-01 | Prvi dolazak na 390 px, video još nije učitan. | Vidljivi naslov, proizvod/poster i funkcionalan link do ponude. |
| UI-02 | Klik do ponude usred animacije. | Ponuda vidljiva ispod zaglavlja, bez zadržavanja u praznom kadru. |
| UI-03 | 375 × 667 px, 200% uvećan tekst. | Nema preklapanja kontrola ni zaključavanja sadržaja u visini ekrana. |
| UI-04 | Brza izmena količine 2 → 8 → 4. | Poslednja izabrana količina i njen obračun su prikazani. |
| UI-05 | Nedostupan proizvod ili pretplata. | Odgovarajuća akcija blokirana sa razumljivom porukom. |
| UI-06 | Dodavanje, zatvaranje korpe, povratak i reload. | Stavke i eksplicitni izbor ostaju konzistentni. |
| UI-07 | Otvaranje menija, korpe i saglasnosti. | Jedan aktivan dijalog; nema naslaganih donjih traka. |
| UI-08 | Mrežna greška provere dostave ili obračuna. | Unosi ostaju, greška vidljiva, mogući ponovni pokušaj. |
| UI-09 | Redovna i jednokratna stavka zajedno. | Jasni periodi i zbir iz servera. |
| UI-10 | Tastatura/Tab/Escape. | Kontrole dostupne, fokus vidljiv i vraćen po zatvaranju. |
| UI-11 | Reduced-motion i nepostojeći medij. | Potpuna kupovina, statičan kvalitetan uvod i normalan skrol. |
| UI-12 | Animacija napred/nazad i browser Back. | Nema duplih renderera, crnih kadrova ili promene položaja bez korisničke radnje. |

Vizuelno proveri početak, 25%, 50%, 75% i kraj animacije na telefonu i desktopu. Screenshot nije dovoljan dokaz glatkoće: potreban je snimak skrolovanja i trag performansi na dostupnom uređaju. Koristi relevantne postojeće testove iz glavnog plana. Ne menjaj poslovni rezultat da bi test prošao.

**D14. Završna predaja**

Izveštaj treba da sadrži: šta je stvarno implementirano, putanje medija, koje cene i podešavanja su korišćeni, aktivne i isključene AOV/LTV funkcije, screenshotove, rezultate testova, fizičke/emulirane uređaje i otvorene spoljne zavisnosti. Nepostojeće linkove, generisane rezultate i procente poboljšanja ne navoditi kao činjenice.
