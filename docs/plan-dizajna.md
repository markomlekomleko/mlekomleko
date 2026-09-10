# Mleko i Mleko — plan dizajna i korisničkog iskustva

Datum: 5. septembar 2026. Status: predlog za implementaciju, zasnovan na originalnom brifu i postojećem projektu. Ovo nije gotov redizajn niti izveštaj o vizuelnoj proveri sajta u browseru.

Ambicija je autorski, prepoznatljiv sajt kvaliteta vrhunskog dizajn studija: dobra fotografija, precizna tipografija, dosledni detalji i lako poručivanje na telefonu. Uspeh merimo i time koliko jasno kupac razume svoju sledeću dostavu i obavezu plaćanja. Dizajnerska nagrada ostaje ambicija, ne obećani rezultat.

Povezani dokument: [plan kompletnog testiranja](plan-testiranja.md), sa redosledom izvršavanja, zavisnostima i 86 testnih celina.

## 1. Šta brif zapravo zahteva

Originalni brif na stranama 1 i 6 izričito traži moderan, sveden, vizuelno lep i intuitivan sajt, prvenstveno za mobilni telefon, bez previše koraka i zbunjujućih opcija. Ne zadaje paletu, konkretan font ili vizuelnu referencu. Zato su vizuelne odluke ispod naš predlog, izveden iz pregledanog postojećeg logotipa i proizvoda.

| Zahtev brifa | Dizajnersko rešenje | Provera |
|---|---|---|
| Odmah razumeti šta se prodaje. | Stvarno mleko/proizvod, jasan naziv i korist, vidljiv ulaz u prodavnicu u prvom ekranu. | Kratka proba razumevanja nakon 5 sekundi. |
| Izbor kupovine zasebno za svaki proizvod. | Dve osnovne opcije; ritam se pojavljuje tek za mesečnu pretplatu; količina je uvek vezana za taj artikal. | Mešovita korpa iz brifa. |
| Malo klikova i mobile-first. | Jedan jasan kupovni panel, sažeta korpa i checkout na jednoj stranici. | Novi kupac završava zadatak bez objašnjavanja. |
| Jasno kada stiže i koliko se plaća. | Prvi termin, broj preostalih termina i mesečni obračun u istoj zoni sa odlukom o kupovini. | Kupac tačno ponovi cenu i ritam pre potvrde. |
| Samostalno upravljanje. | Nalog počinje sledećom dostavom; izmene su uz odgovarajuću stavku. | Promena količine, dodavanje, preskakanje, pauza i otkaz. |
| Jednostavna operativa. | Admin prvo prikazuje izbor dana, zbir robe, listu kupaca i izvoz. | Tok „Dostave za petak“ iz brifa str. 9. |

## 2. Jedan vizuelni pravac: „Mleko, u svom ritmu“

Savremen izgled sa mirnom kompozicijom, velikim naslovima, belinom i fotografijama staklenih flaša pod prirodnim svetlom. Postojeći tirkizno-plavi i tamnoplavi logo ostaje glavni znak prepoznavanja. Toplinu donose svetlo, mleko i materijali u fotografiji.

**Prepoznatljiv detalj** je spoj dva proizvoda i ritma dostave: kravlje i kozje mleko fotografisani kao par, uz diskretan, funkcionalan niz narednih termina u kupovnom panelu. Taj motiv se prenosi sa početne na proizvod i nalog, gde dobija konkretnu ulogu u razumevanju rasporeda.

Kvalitet će nositi kompozicija i sadržaj: kontrolisani odnosi velikog i malog teksta, ritam praznog prostora, precizno poravnanje cena i jedinstvena fotografija. Pokret služi povratnoj informaciji korisniku. Plan ne predviđa obavezni uvodni ekran, preuzimanje skrolovanja, poseban kursor, pozadinski video ili efekte koji odlažu kupovinu.

Aktuelni kod ima krem pozadine, narandžasta dugmad, mnogo kartica, izraženo zaobljene slike i guste kupovne kontrole. To je zapažanje iz CSS-a i komponenata, a ne završna vizuelna ocena. Redizajn treba proveriti na stvarnim renderima pre prihvatanja.

## 3. Osnova vizuelnog sistema

### Paleta i površine

Vrednosti su početni tokeni za prototip, ne tvrdnja da postoji odobren brandbook. Logo se koristi iz originalnog fajla; ne precrtava se generativno i ne menja se njegov sadržaj.

| Uloga | Predlog | Upotreba |
|---|---|---|
| Osnovna pozadina | `#FFFFFF` | Većina prodavnice, checkout-a i admina. |
| Tamna boja brenda | `#353A4A` | Tekst, glavni naslovi, jak kontrast. |
| Primarna akcija | `#2F7184` | Glavno dugme, aktivni izbor, ključni link. |
| Tamnija aktivna akcija | `#235A6A` | Hover/pressed i naglašen fokus uz obod. |
| Svetla plava površina | `#EAF3F5` | Odabran plan, blok sledeće dostave, blago razdvajanje. |
| Topla površina | `#F7F3E9` | Ograničeno uz fotografije i priču brenda. |
| Sekundarni tekst | `#50596A` | Opisi i pomoćni tekst koji se redovno čita. |
| Linije | `#D5DFE2` | Dekorativni razdelnici; za neophodne granice inputa koristiti dovoljno tamnu varijantu. |
| Statusi | Semantički success/warning/error tokeni | Uvek uz tekst/ikonu, ne samo boju. |

Sve stvarne kombinacije boja proveriti instrumentom. Logo boja ne mora automatski biti pristupačna u svakoj ulozi. Izbegavati korišćenje svetle plave za sitan tekst ili samo svetle linije kao jedinog znaka aktivne kontrole.

### Tipografija i raspored

- Zadržati postojeći Geist za UI, cene, formulare i admin. Izražajnost prvo postići proporcijom, rasporedom i težinom, bez obaveznog dodavanja još jednog fonta.
- H1: približno 42–52 px mobilno, 72–88 px desktop na početnoj; naslov proizvoda 32–40 px mobilno. Koristiti fluidne vrednosti i dozvoliti prirodan prelom dužeg srpskog naziva.
- Osnovni tekst 16–18 px; redovne labele 14–16 px; pomoćna metadata 12–13 px samo kada nije važna za odluku. Cene, rok i mesečni iznos nikada u sitnoj metadata ulozi.
- Glavni sadržaj do približno 1280 px; desktop mreža 12 kolona, tablet 8, telefon 4. Mobilne margine 16–20 px, vertikalni razmaci u ritmu 8 px.
- Kontrole najmanje 44 × 44 px kao naš UX cilj, primarna dugmad oko 48–52 px. Desktop ne dobija usitnjene kontrole radi veće gustine.
- Corner radius: 10–12 px kontrole, 16–20 px sadržajni paneli; senka samo kada objašnjava podizanje/modality. Fotografije prvenstveno u čistim pravougaonim kadrovima.
- Jedan glavni CTA po odluci. Režim, količina, datum i novac imaju jaču hijerarhiju od promocije.

Proveriti čćžšđ, latinicu i ćirilicu u imenima/adresama, cene sa većim brojem cifara, 200% uvećanje teksta, prelom redova i font fallback. Cilj pristupačnosti je [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/); konkretna provera je u T-79/T-80.

### Komponente i sva njihova stanja

Pre stranica pripremiti: navigaciju/mobilni meni, dugmad i linkove, input/select/radio, količinu i jedinicu, izbor kupovine, ritam, quote/sažetak cene, datum i rok, karticu proizvoda, red korpe, status/grešku, dijalog, prazan prikaz, loading prikaz, tabelu i kontrolu izvoza.

Za svaku komponentu: default, hover, focus, pressed, selected, disabled, loading i error kada imaju smisla. Za poslovne komponente dodati success, locked, paused, cancelled i conflict. Sve se potom proverava na pravom funkcionalnom toku, ne samo u izdvojenom katalogu komponenata.

## 4. Plan ekrana i ponašanja

### D-01 — Navigacija i zajednički okvir

Desktop: čitljiv postojeći logo, Prodavnica, Kako funkcioniše, Gde kupiti, O nama/Naše farme, uz nalog i korpu. Ostale stavke brifa ostaju lako dostupne kroz meni/footer; ništa se ne uklanja samo radi čistijeg headera.

Mobilno: logo, pristup korpi sa količinom i jasno označen meni. Meni otkriva sve osnovne stranice i nalog, ima Escape/zatvaranje i vraća fokus na dugme koje ga je otvorilo. Sticky header ne prekriva fokusirani sadržaj.

Cookie odluke su jasne i nenametljive, sa lako dostupnim odbijanjem i naknadnom promenom izbora. Ako je prikaz modal, fokus i pozadina se ponašaju kao modal. T-63, T-67, T-79/T-80.

### D-02 — Početna: odmah proizvod i put do kupovine

Redosled:

1. Kratak naslov, npr. „Mleko, u vašem ritmu.“ i jedna konkretna rečenica o proizvodima/dostavi, zasnovana na potvrđenim poslovnim podacima.
2. Jedna glavna fotografija kravljeg i kozjeg mleka. Na desktopu široka kompozicija sa prostorom za naslov; na mobilnom sadržaj i CTA ostaju vidljivi pre nego što fotografija zauzme ceo ekran.
3. Primarna akcija „Izaberi mleko“, sekundarni tekstualni link „Kako funkcioniše“.
4. Kompaktna provera zone i sledećeg termina, jasno prikazana kao informacija o isporuci.
5. Dva glavna proizvoda, zatim sažeto objašnjenje kupovine i povratne ambalaže.
6. Kratka priča o stvarnom poreklu sa stvarnim materijalom, nekoliko relevantnih FAQ odgovora i završni ulaz u prodavnicu.

Ograničiti ponavljanje istih poruka i dugmadi u svakoj sekciji. Ako postoje paketi, prikazati ih sekundarno; individualni izbor iz brifa ostaje jednostavan. T-01, T-63, T-79/T-82.

### D-03 — Prodavnica

Na telefonu dati prednost čitljivim karticama sa jasnim nazivom, fotografijom, jedinicom, cenom i jednim putem ka izboru. Kod malog kataloga nema potrebe da ekran zatrpaju filteri; postojeće filtere učiniti sažetim i dostupnim.

Predlog: osnovna kartica vodi dugmetom „Izaberi“ na proizvod; postojeće brzo dodavanje sačuvati kao kompaktnu sekundarnu mogućnost koja otvara isti kupovni panel. Tako ostaje funkcionalnost, a sva objašnjenja režima kupovine dolaze iz jedne zajedničke komponente.

Proizvodi u L i komadima imaju različite pravilne oznake. Stvarnu uštedu prikazati samo ako je podržana cenama i odgovarajućim obračunom. T-01–T-07, T-74.

### D-04 — Proizvod: najvažniji kupovni ekran

Desktop: fotografija približno 55% širine, kupovni panel 45%. Mobilno: kratko zaglavlje proizvoda, kompaktna fotografija, kupovni panel i ključne činjenice. Informacije o sastavu/čuvanju/poreklu mogu se proširiti niže; ključna deklaracija i upozorenja se ne skrivaju iza marketinga.

Redosled izbora prati eksplicitno prikazan primer na strani 1 brifa:

1. „Kako želiš da poručiš?“ — **Jednokratno / Mesečna pretplata**.
2. Samo za pretplatu: „Koliko često želiš dostavu?“ — **Svake nedelje / Svake 2 nedelje**.
3. „Količina po dostavi“ — brzi izbor 2/4/8 L za mleko i ručni unos, uz odgovarajuću jedinicu za svaki proizvod.
4. Sažetak: cena po dostavi, prvi termin, stvaran broj termina i obračun za tekući mesec. Dostava se prikazuje ili jasno označava da ulazi u zajednički obračun korpe.
5. „Dodaj u korpu“ i neposredna povratna informacija sa sačuvanim izborom.

Podrazumevani izbor za novog kupca predlažemo „Jednokratno“; kad kupac dođe kroz eksplicitni izbor pretplate, panel zadržava tu nameru. Brif ne propisuje podrazumevani režim, pa ovo ostaje označena UX odluka koja se proverava u prototipu.

**Primer informacione hijerarhije, sa izmišljenim testnim podacima:**

```text
Kravlje mleko                         250 RSD / L

Kako želiš da poručiš?
[ Jednokratno ]  [ Mesečna pretplata ✓ ]

Koliko često želiš dostavu?
[ Svake nedelje ✓ ]  [ Svake 2 nedelje ]

Količina po dostavi                 [ −  3 L  + ]

Prva dostava                              8. januar
Termini ovog meseca                      8 · 15 · 22 · 29
Mleko po dostavi                               750 RSD
Mleko za preostala 4 termina                  3.000 RSD
Dostava se obračunava jednom po terminu u korpi.

[ Dodaj u korpu ]
```

Sažetak ne izmišlja cenu u browseru: koristi serverski quote/iste poslovne podatke kao korpa. Mobilni sticky CTA pojavljuje se tek kada osnovno dugme izađe iz vidljivog dela, uz naziv iznosa i očuvane izbore; nikada ne prekriva grešku, tastaturu ili cookie odluku. T-02–T-07, T-33/T-34.

### D-05 — Korpa

Svaki red jasno kaže: artikal, količina **po dostavi**, jednokratno/pretplata, ritam i iznos. Kontrole se menjaju u kontekstu reda. Na vrhu je sledeći termin; ispod stavki je jedan sažetak sa proizvodima, popustom, dostavom i ukupnom obavezom.

Primer iz brifa mora biti čitljiv bez računanja napamet: 3 L mleka weekly, jedan jogurt biweekly i jedan sir samo sledeći put. Mesečni zbir i iznos naredne fizičke dostave imaju različite oznake. Pre izbora načina plaćanja koristiti „Ukupno za tekući mesec“, ne pretpostaviti da kupac plaća odmah.

Promena proizvoda ili cene prikazuje razumljivu poruku pre nastavka. Sačuvati postojeći promo unos, ali ga vizuelno smestiti ispod glavnog sažetka. T-04–T-12, T-73.

### D-06 — Checkout i potvrda

Jedna stranica, grupisana u Podaci / Dostava / Plaćanje. Na telefonu jedan vertikalni tok, na desktopu obrazac i sticky sažetak. Prikazati samo potrebna polja, koristiti autofill i pravu vrstu tastature. Ne tražiti registraciju pre kupovine.

Kod gotovine jasno: „Plaćate pri prvoj dostavi“ i „Ceo iznos za tekući mesec“ kada je pretplata. Kod kartice objasniti iznos sada i, ako je provider podržava, narednu automatsku mesečnu naplatu. Ne prikazivati aktivnu mogućnost koju pravi provider još ne podržava.

Završno dugme kaže šta potvrđuje; tokom obrade ima stabilnu širinu i jasan status. Greške su uz polja i u sažetku grešaka, uz pomeranje fokusa, sa očuvanim podacima. Kod neizvesnog ishoda prvo proveriti status; poruka ne navodi kupca na novu potencijalno duplu porudžbinu.

Potvrda: broj porudžbine, stvarni payment status, sledeći termin, iznos i link ka email prijavi/nalogu. Postojeća ponuda konverzije u pretplatu je sekundarna i zahteva svestan izbor. Postojeći recovery tok ostaje dostupan, uz tačno objašnjenje kanala koji je operativan. T-08–T-16, T-75/T-76/T-78.

### D-07 — Prijava i korisnički nalog

Prijava: jedno email polje, potvrda slanja, ponovno slanje uz ograničenje, jasan istek linka. Email je početni kanal prema dopuni brifa; SMS/WhatsApp se ne prikazuju kao završen login.

Nalog otvara glavni panel **„Sledeća dostava — [datum]“** sa stvarno planiranim stavkama, rokom i statusom naplate. Tehnički `sub_...` ID ne treba da bude naslov korisničkog iskustva; može ostati pomoćni podatak za podršku.

Akcije uz proizvode: promeni količinu, promeni ritam, ukloni. Jedno jasno „Dodaj proizvod“ nudi **redovno / samo sledećoj dostavi**; trajno dodavanje trenutno zahteva dopunu funkcionalnosti i ne sme ostati samo nacrtano.

Promene količine/ritma prvo prikazuju novu vrednost, termin i finansijsku razliku, pa „Sačuvaj izmenu“. Predlog je da poslovno značajna promena ne nastaje neočekivano samo izlaskom iz inputa. Preskakanje i pauza objašnjavaju pogođeni termin i datum povratka.

Trajno otkazivanje dostupno je jasnim imenom uz jednu potvrdu posledica. Postojeće alternativne retention akcije ostaju opcione; razlog otkazivanja ne postaje prepreka. Ako je sledeća isporuka zaključana, poruka jasno razlikuje tu isporuku i buduće cikluse.

Konflikt dva prozora pokazuje da postoje noviji podaci i nudi pregled/osvežavanje. Ne kaže samo „Greška 409“. T-17–T-32, T-37/T-38/T-77.

### D-08 — Admin: priprema dostave na prvom mestu

Primarni radni ekran:

```text
Dostave za [ petak, datum ▼ ]        Status: otvorena / zaključana
Rok za izmene: [datum i vreme]

PRIPREMITI                 KUPCI I PORUDŽBINE
Kravlje mleko   ... L      Ime · adresa · artikli · napomena
Kozje mleko     ... L      Status uplate i ID porudžbine
Jogurt         ... kom

[ CSV za Spoke ] [ Excel + priprema ]       [ Zaključaj dostavu ]
```

Naslov izvodi stvarni dan iz izabranog datuma. Jedan pogled daje operativnu celinu; prodajni grafikoni i marža su sekundarni. Lista i zbir jasno označavaju kada su osveženi i da li su finalni.

Desktop koristi čitljivu tabelu sa zaglavljem, potrebnim filterima i pregledom porudžbine. Na telefonu red se otvara kao pregled sa punom adresom i napomenom. Brojevi su poravnati, jedinice uvek vidljive. Važne akcije ostaju dostupne tastaturom.

Zaključavanje ima potvrdu sa posledicama i razlogom za izuzetak. Ručna izmena porudžbine prikazuje finansijski i logistički efekat. Integracione greške govore koji nalog je pogođen i koju dozvoljenu akciju operater može da izvrši. T-41–T-62.

### D-09 — Sadržajne i servisne stranice

| Stranica | Sadržaj i kompozicija |
|---|---|
| Kako funkcioniše | Tri kratka koraka, zatim precizno objašnjenje jednokratno/pretplata, mesečne naplate, rokova i flaša. |
| Gde kupiti | Pregled stvarnih prodajnih mesta sa adresom, vrstom proizvoda i potvrđenim podacima; sekundarno online dostava. Map link tek kada je adresa verifikovana. |
| O nama / Naše farme | Stvarna priča, ljudi, poreklo i dokumentovane činjenice. Zadržati postojeće zasebne URL-ove i urediti međusobnu navigaciju. |
| FAQ | Kratka pitanja, jasni odgovori, semantički disclosure; jedinstvene informacije o ceni/roku sa ostalim ekranima. |
| Kontakt | Stvarni kanali i radno vreme ako je potvrđeno; jasan ulaz u nalog za samostalne izmene. |
| Dostava / lokalne strane | Zone, stvarni termini, cena i provera dostupnosti; Beograd i Novi Sad koriste sopstvene potvrđene podatke. |
| Uslovi / privatnost / reklamacije / pravila pretplate | Miran čitljiv tekst, jasna struktura i stvarne politike; sadržajna provera pre objave. |
| 404 / greška / učitavanje | Isti vizuelni jezik, kratak razlog i sledeća korisna akcija; bez beskonačnog spinnera ili otkrivanja tehničkih detalja. |

SEO naslovi, metadata, postojeći canonical URL-ovi, serverski sadržaj i strukturirani podaci moraju ostati usklađeni sa vidljivim prikazom. Ovo je nastavak postojećeg `docs/seo-plan.md`, ne novi nepovezan SEO projekat. T-63–T-66.

## 5. Plan fotografije i Higgsfield materijala

Higgsfield je dostupan kao mogućnost za fazu implementacije. U ovoj fazi planiranja nisu pokretane generacije. Model, podržani referentni materijali i trošak proveravaju se neposredno pre generisanja; ovaj plan ne zaključava promenljiva imena modela ili broj kredita.

Prvo pregledati postojeće originalne fajlove i odobrene fotografije proizvoda. Potrebne su tačne flaše, etikete, zapremine i izgled sadržaja. Za komercijalni packshot generisati svetlo/scenu uz provereno očuvanje stvarnog proizvoda; ako se etiketa ili oblik menjaju, rezultat se odbacuje ili koristi originalna fotografija.

| Asset | Namena | Specifikacija i izvor |
|---|---|---|
| IMG-01 | Glavna fotografija početne. | Stvarne flaše kravljeg i kozjeg mleka kao par; široki desktop kadar oko 3:2 i posebno planiran 4:5 mobilni crop, prostor za tekst na desktopu. Higgsfield uz originalne reference. |
| IMG-02…N | Fotografije svakog aktivnog proizvoda. | Ujednačen 1:1 ili 4:5 packshot i potreban detalj; isti ugao/svetlo/merilo. Broj prati stvarni katalog, ne izmišljene proizvode. |
| IMG-STORY | Jedna fotografija svakodnevne upotrebe. | Mleko i stvarna ambalaža na stolu, mirno jutarnje svetlo, prirodni materijali; sekundarna priča na postojećoj stranici. |
| REAL-FARM | Poreklo i stvarni proizvođači. | Autentične fotografije stvarnih farmi/ljudi iz odobrenih izvora; AI scena nije dokaz porekla. |
| LOGO | Postojeći identitet. | Originalni logo ostaje neizmenjen. Potražiti originalni vektor ako postoji; odobrene izvedene veličine iz originala. |

**Početni Higgsfield brief za IMG-01:**

> Premium editorial dairy product photograph using the supplied real Mleko i Mleko bottles as exact product references. Preserve bottle shape, cap, label artwork, spelling, logo, packaging volume and proportions. Two bottles, cow milk and goat milk, in soft morning side light on a clean white surface, subtle deep blue and teal accents, realistic milk opacity, restrained natural shadow, calm precise composition, clear negative space on the left for live website typography, product group on the right. No invented certifications, no additional text, no interface, no extra products. Compose for both a wide desktop crop and a useful vertical mobile crop.

**Brief za packshot:** ista referentna ambalaža, neutralna pozadina, cela flaša bez odsecanja, dosledna visina u kadru, etiketa čitljiva, meka kontaktna senka. Sve varijante proveriti jednu uz drugu; broj litara, kapa ili logo ne smeju slučajno da se promene između slika.

Proces: reference i lista potrebnih mesta → precizan brief → generisanje potrebnih asseta → pregled identiteta/realizma/kadrova → optimizovani izvozi → integracija → provera na telefonu. Fotografija ne sadrži naslov, cenu ni dugme; tekst ostaje dostupan u HTML-u. Postojeća OG slika i metadata se zadržavaju; nova social kampanja nije obavezni deo ovog obuhvata.

## 6. Pokret, pristupačnost i brzina

- UI reakcije približno 120–180 ms, dijalog 180–240 ms, diskretna pojava sadržaja najviše oko 300 ms. Bez čekanja animacije da bi klik bio prihvaćen.
- Podržati `prefers-reduced-motion`; sva značenja ostaju dostupna bez animacije i hover-a. Nema obaveznog autoplay videa.
- Slike imaju dimenzije, stabilan odnos stranica i potrebne responsive izvode, npr. 480/768/1200 px kada to kadar zahteva. AVIF/WebP uz fallback; ključna LCP slika se ne učitava lenjo.
- Početni interni budžet, koji se proverava merenjem: mobilni hero oko 200 KB ili manje, kartica oko 80 KB, fontovi ukupno oko 150 KB kompresovano, početni transfer ključne kupovne rute oko 1 MB bez spoljnog payment ekrana. Budžet prilagoditi stvarnom kvalitetu i početnoj meri, uz obrazloženje odstupanja.
- Fokus ostaje vidljiv i neprekriven sticky elementima, greške se najavljuju, radio izbori imaju grupe i jasne labele, status nije prepoznatljiv samo po boji.
- Cilj stvarnih poseta je p75 LCP ≤2,5 s, INP ≤200 ms i CLS ≤0,1, uz zasebnu laboratorijsku proveru pre objave. [Web Vitals](https://web.dev/articles/vitals)

## 7. Kako dokazujemo kvalitet dizajna

**Prva proba** na mobilnom prototipu pre detaljne implementacije. **Druga proba** na funkcionalnom staging-u posle integracije. Predlog je pet reprezentativnih korisnika u svakom krugu; to je kvalitativno otkrivanje problema, ne statistički dokaz konverzije.

Zadaci:

1. Posle 5 sekundi objasniti šta se prodaje i kako se poručuje.
2. Napraviti korpu 3 L weekly + jogurt biweekly + sir jednom.
3. Pre potvrde reći: kada stiže, koliko puta ovog meseca, koliko se plaća i kada se plaća.
4. Ući u nalog, promeniti količinu i dodati artikal samo narednoj dostavi.
5. Preskočiti, pauzirati i pronaći trajno otkazivanje.
6. Kao operater izabrati datum, pročitati zbir i izvesti listu za Spoke.

Početni interni kriterijumi: najmanje 4/5 korisnika završe glavnu kupovinu bez pomoći, svih pet pravilno razume mesečnu obavezu pre potvrde, niko ne uključi pretplatu slučajno. Meriti vreme, pogrešne klikove, povratke i nejasne reči. Cilj posle prvog merenja: jednostavna kupovina do približno 2 minuta bez vremena banke/emaila; promena količine i preskakanje do oko 30 sekundi. Ne tretirati brzinu kao važniju od razumevanja iznosa.

Za završnu internu kritiku koristiti dimenzije slične [Awwwards evaluaciji](https://www.awwwards.com/about-evaluation/): dizajn, upotrebljivost, kreativnost i sadržaj. Sledeća skala je naš kriterijum, ne ocena spoljnog žirija:

| Dimenzija | Interni cilj |
|---|---|
| Vizuelna doslednost | 9/10: sve ključne stranice dele isti jezik, čitljivu tipografiju i dosledne detalje. |
| Upotrebljivost | 9/10 i prolaz zadataka iznad; nijedan kupac ne mora da nagađa obavezu. |
| Prepoznatljivost | 9/10: stvarni logo, proizvod i autorska fotografija čine sajt prepoznatljivim. |
| Sadržaj | 9/10: konkretne reči, stvarni podaci, dosledni termini i bez neproverenih tvrdnji. |
| Mobilni kvalitet | Bez kritičnih problema pri dodiru, autofill-u, tastaturi, zoom-u i promeni orijentacije. |

Lepa početna nije dovoljna za prihvatanje. I korpa sa dugim nazivom, neuspešno plaćanje, zaključana isporuka i admin tabela sa mnogo redova moraju izgledati namerno i ostati razumljivi.

## 8. Redosled izrade i konkretne isporuke

| Korak | Isporuka | Kriterijum završetka |
|---|---|---|
| 1. Inventar sadržaja i UI-ja | Popis postojećih ekrana/komponenata, tačni proizvodi, logo i lista stvarnih fotografija. | Razdvojeni potvrđeni podaci i otvorene poslovne odluke iz QA plana. |
| 2. Mobilni tokovi | Wireframe proizvoda, korpe, checkout-a, naloga i admin dostave. | Svaki zahtev brifa ima mesto; svaki ekran ima loading/error/empty stanje. |
| 3. Vizuelna osnova | Tokeni, tipografska skala, komponente i obrađeni početna/proizvod/nalog na mobilnom i desktopu. | Jedan dosledan autorski pravac, proveren kontrast i jasna hijerarhija. |
| 4. Prototip i prva proba | Povezan kupovni i servisni tok; zapis poteškoća i korekcija. | Korisnici razumeju režim, raspored i iznos. |
| 5. Fotografije | Potrebni Higgsfield/originalni asseti i evidencija referenci. | Očuvan identitet proizvoda, dobra rezolucija/crop i prihvatljiva težina. |
| 6. Implementacija po celinama | Prvo zajednički stil i proizvod/korpa/checkout, zatim nalog/admin, potom početna i sadržajne strane. | Svaka celina prolazi povezane testove pre prelaska na finalno doterivanje. |
| 7. Završna kritika i druga proba | Screenshot matrica, vizuelne korekcije, accessibility/performance i funkcionalni UAT. | Zatvoreni blokirajući nalazi i ispunjeni kriterijumi oba plana. |

Planirane tačke u kodu: `app/globals.css` i `app/components/site-shell.tsx` za osnovu; zajedničke kupovne kontrole kroz karticu/detalj; `app/korpa/cart-view.tsx`, `app/checkout/checkout-form.tsx`, `app/nalog/account-view.tsx` i `app/admin/admin-dashboard.tsx` za tokove. Zadržati postojeće rute, serverske obračune, SEO i poslovne zaštite; potrebne funkcionalne dopune eksplicitno vezati za testove.

Pri implementaciji ne menjati framework, bazu ili payment arhitekturu samo radi izgleda. Trošak i rizik eventualne promene platforme vode se zasebno. Konačna isporuka ovog pravca je dosledan, brz i pristupačan funkcionalni sajt sa stvarnim sadržajem, uz dokaze kvaliteta opisane u planu testiranja.
