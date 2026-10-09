# Paketi, isporuke i Fiscomm — 9. oktobar 2026.

## Pravilo koje je implementirano

Paket nije kalendarski mesec. Svaka kupljena stavka ima nepromenljivu količinu po isporuci `qᵢ`, cenu `pᵢ` i broj isporuka `nᵢ ∈ {1, 2, 4}`. Jednokratna stavka ima 1, dvonedeljna 2, nedeljna 4. Kupac može kombinovati sva tri tipa, uključujući isti proizvod u različitim ritmovima.

- Kupljena količina: `Qᵢ = qᵢ × nᵢ`.
- Vrednost proizvoda pre popusta: `S = Σ pᵢ × qᵢ × nᵢ` (u parama, ceo broj).
- Naplata: `T = S − popust + dostava − primenjeni kredit`.
- Za početni zajednički datum broj poseta je `max(nᵢ)`; dostava se naplaćuje jednom po poseti, ne po artiklu.
- Stvarno uručena količina `Uᵢ` sabira se iz potvrđenih količina svakog reda, uključujući eksplicitno usaglašene istorijske količine. Ne izvodi se iz proteklog vremena ili broja klikova.
- Preostala količina: `Rᵢ = max(0, Qᵢ − Uᵢ − Cᵢ)`, gde je `Cᵢ` količina poništena kroz završen tok povraćaja.
- Redovno zatvaranje i konačni račun traže ispunjene kupljene količine; povraćaj koristi zaseban finansijski tok.
- Zaključavanje rezerviše robu za pripremu, ali ne povećava `Uᵢ`. Delimična ili neuspela dostava prenosi neuručeni ostatak bez nove naplate.

Postoji tačno sedam nepraznih kombinacija tipova korpe: J, N, D, J+N, J+D, N+D, J+N+D. Količine, datumi i nizovi promena nisu konačan skup, pa ih ne rešavamo nabrajanjem svake kupovine, već istim pravilima i ograničenjima za sve vrednosti. Jedinstveni otvoreni paket po pretplati sprečava novu naplatu dok prethodni nije ispunjen.

## Matrica situacija

| Situacija | Ponašanje |
|---|---|
| Nedeljni paket kupljen poslednjeg petka u mesecu | Naplaćuju se i duguju tačno 4 isporuke. Kraj meseca ga ne zatvara. |
| Dvonedeljni paket | Tačno 2 isporuke u početnom razmaku 14 dana. |
| Mešovita korpa | Jednokratni deo ide jednom; svaka redovna stavka ima sopstveni brojač. Paket čeka sve stavke. |
| Isti proizvod u dva ritma | Dve zasebne kupljene stavke; količine se sabiraju samo za pakovanje. |
| Uplata nije potvrđena / kartica odbijena | Paket ostaje vidljiv kao neplaćen; ne ulazi u pripremu. Nema avansa. |
| Uplata posle roka pripreme | Ceo neiskorišćen paket pomera se na sledeći dostupan termin svog ritma, uz poštovanje pauze. Stara zaključana lista ostaje ista. |
| Kasna uplata otkazanog neplaćenog paketa | Odbija se ponovno aktiviranje. Potrebna je nova porudžbina ili zasebno usaglašavanje stvarne uplate. |
| Uplata celog paketa | Red za izdavanje avansa; Fiscomm se poziva sa serverskim ključem. |
| Priprema ili izvoz liste | Ne smatraju se isporukom. |
| Potvrda buduće isporuke | Odbija se. |
| Prva, druga ili treća nedeljna isporuka | Povećava se brojač; nema konačnog računa. |
| Četvrta potpuna nedeljna / druga potpuna dvonedeljna | Paket se zatvara i u istoj DB transakciji upisuje događaj za konačni račun. Delimično uručene količine mogu zahtevati dodatnu posetu; paket čeka ostatak. |
| Preskočena nedelja | Pomera se raspored; nema kredita, gubitka robe ni nove naplate. |
| Pauza | Najviše 3 kalendarska meseca od dana zahteva, sa skraćenjem na poslednji važeći dan meseca. Brojači i cene ostaju isti. |
| Pauza prelazi u sledeći mesec | I dalje isti paket; obračun preskače novi račun. |
| Povratak posle pauze | Nastavak sa sačuvanim ritmom kupljenog paketa. |
| Neuspela redovna dostava | Ne troši paket. Roba ulazi u sledeću redovnu posetu. |
| Neuspela jednokratna stavka mešovitog paketa | Prenosi se u narednu redovnu posetu bez nove naplate. |
| Ponovljena potvrda / konkurentne potvrde | Brojač se ne duplira; jedinstveni događaj zatvaranja. |
| Promena količine, proizvoda ili ritma | Menja konfiguraciju narednog paketa; već kupljene stavke ostaju iste. Ovo je podrazumevano pravilo dok vlasnik ne traži doplate/refundacije tekućeg paketa. |
| Promena cene u katalogu | Ne menja kupljenu cenu ni zahtev već izdatog avansa. |
| Dodatak samo sledećoj dostavi | Zasebna porudžbina, sa sopstvenom naplatom; nije promena plaćenog paketa. |
| Otkazivanje neplaćenog paketa | Otkazuje porudžbinu i pretplatu. |
| Otkazivanje plaćenog paketa | Isključuje obnovu; preostale dostave se izvršavaju, zatim pretplata postaje otkazana. |
| Uklanjanje poslednje stavke | Isto pravilo kao otkazivanje; ne ostavlja praznu pretplatu za naplatu. |
| Obnova | Novi paket tek posle završetka prethodnog, sa tadašnjim izborom i cenama. Dnevni zaštićeni posao pokreće proveru. |
| Proizvod nedostupan za obnovu | Obnova se zadržava, ne naplaćuje se nedostupan proizvod. Kupljeni paket ostaje obaveza. |
| Jednokratna porudžbina pa izbor pretplate | Jednokratna ostaje zasebna; novi paket počinje sledeće nedelje ili za 14 dana, prema izboru. |
| Promena nakon roka pripreme | Zaključana lista se ne menja. |
| Promena plaćanja u „refundiran“ preko običnog padajućeg menija | Za paket je odbijena: status u aplikaciji nije povraćaj novca niti fiskalna refundacija. |
| Izostala poreska oznaka ili neaktiviran servis | Dokument ostaje na čekanju, sa jasnom porukom. Nijedna stopa se ne pogađa. |
| Timeout, nečitljiv odgovor ili nepoznat ishod servisa | Sačuvani zahtev se ne šalje ponovo preko opšteg dugmeta za retry; potrebna je provera arhive kod provajdera. |
| Fiscomm potvrdio izdavanje, pad pre ažuriranja prikaza | Sačuvani odgovor popravlja prikaz bez novog POST-a. |
| Avans još nije izdat kada se završi paket | Konačni račun čeka izdati avans. |
| Email nije poslat | Zaseban trajni događaj se ponavlja; račun se ne izdaje ponovo. |
| Stara pretplata po kalendarskom obračunu | Nije automatski pretvorena niti ponovo naplaćena. Obnova vraća `legacy_review_required`; neophodno je usaglašavanje postojećih uplata/isporuka. |

## Granice koje ostaju eksplicitne

Ova izmena ne povezuje banku: kartično plaćanje i recurring kartična naplata i dalje zahtevaju bankarski adapter. Gotovinska uplata celog paketa može da se evidentira kroz admin pre isporuke. Fiscomm izdavanje nije naplata kupcu.

Delimično uručenje je ugrađeno po količinama svakog reda. Ugrađen je i zahtev za povraćaj svih preostalih, nezaključanih proizvoda odabrane porudžbine: pregled iznosa, odobrenje, zaustavljanje pripreme i idempotentno lokalno izvršenje. Obračun deli popust tačno u parama i ne vraća automatski cenu dostave. Stvarni prenos novca i fiskalni korektivni dokument čekaju bankarski/fiskalni adapter; do tada izvršenje u stvarnom režimu ostaje blokirano. Proizvoljna zamena već plaćenih proizvoda uz doplatu i vraćena roba posle uručenja zahtevaju zasebno finansijsko usaglašavanje. Otkazivanje obnove ne glumi povraćaj.

Samostalna jednokratna porudžbina i dodatak zadržavaju postojeći tok `normal/sale` posle evidentiranja uplate. Ako se naplaćuju pre prometa i za njih je potreban avans, njihov fiskalni trenutak mora posebno da se usaglasi. Ovaj zadatak uvodi lanac avans → konačni račun za pakete pretplate.

Pravni trenutak prometa kod sukcesivnih isporuka i poreske oznake potvrđuje knjigovođa. Implementacija prati zatraženo poslovno pravilo i ne predstavlja potvrdu poreske usklađenosti svakog mogućeg ugovora.

## Fiscomm protokol i podešavanje

Zvanična dokumentacija: [API vodič](https://fiscomm.rs/za-programere/dokumentacija/), [OpenAPI](https://api.fiscomm.rs/openapi.json), [detaljni ugovor](https://api.fiscomm.rs/llms-full.txt). Poreska osnova za vezivanje avansa i konačnog prometa: [Poreska uprava](https://www.purs.gov.rs/eFiskalizacija/odgovori_najcesca_pitanja.html).

- `POST /receipt/advance/sale` izdaje avans.
- `POST /receipt/advance/finalize` referencira njegov PFR broj i vreme; vraća `refundReceipt` i `finalReceipt`. Iznos `advanceAmount` na zatvaranju prati primer iz OpenAPI specifikacije; to nije nova kartična naplata.
- Tri dokumenta su sačuvana sa vezama original → zatvaranje avansa → konačni račun, PDF/linkom i PFR vremenom.
- Koristimo `settings.returnIfOrderNumberExists`, ali se ne oslanjamo samo na njega: dokumentovani prozor provajdera je približno 14 dana, dok paket može trajati mesecima. Zato postoji trajni dnevnik svakog POST-a i blokada nepoznatog ishoda.
- Računanje popusta deli eventualnu razliku u parama između jedinica; zbir fiskalnih stavki mora biti jednak naplaćenom iznosu.
- Svaka poreska oznaka proverava se prema aktivnim oznakama naloga pre izdavanja. Za proizvode se podešava u adminu; za dostavu kroz `FISCOMM_DELIVERY_TAX_LABEL`.
- Ključ je sačuvan samo u ignorisanoj `.env.local`; nema ga u dokumentaciji ili klijentskom kodu. Na hosting se prenosi kao serverska tajna, nikad kao `NEXT_PUBLIC_*`.
- `FISCAL_PROVIDER=fiscomm`; `FISCOMM_MODE=disabled` dok ne budu potvrđene oznake i test izdavanja. Lokalni izolovani test koristi `mock`. `live` šalje stvarne API zahteve, a nalog/certifikat kod Fiscomm određuje poresko okruženje.

Read-only provera ključa i poreskih oznaka uspela je 9. oktobra 2026. za THREE & MORE DOO / Prodavnica - Online prodaja. Nijedan pravi račun, refundacija ili naplata nisu napravljeni tokom implementacije.

## Admin postupak

1. **Podešavanja → Proizvodi:** naziv, opis, cena, fotografija sa računara, precrtana cena/bedž i poreska oznaka. **Popusti:** postojeći promo kodovi.
2. **Pregled:** današnja ukupna količina po proizvodu i broj jednokratnih/redovnih isporuka.
3. **Kupci:** otvoreni paketi, uplata, ritam, `isporučeno / kupljeno`, preostala pakovanja i datum/pauza.
4. **Dostave:** datum, količine za pripremu i po kupcu; završite pripremu, pa nakon uručivanja kliknite **Potvrdi isporuku**. **Nije isporučeno** čuva preostali paket.
5. **Podešavanja → Fiscomm:** proverite vezu i oznake; u naprednim integracijama su dokumenti i greške. Zatvaranje avansa i konačni račun pokreću se automatski posle poslednje potvrde.

## Migracija i provera

Migracije `0016_prepaid_packages.sql` do `0019_delivery_item_sources.sql` postoje za SQLite i PostgreSQL. Uvodi pakete, kupljene stavke, povezivanje isporuke sa stavkom, kontrolu obnove, poreske oznake, veze fiskalnih dokumenata i skladište fotografija. Fotografije su trajno sačuvane u bazi; nije potreban zapis u prolazni disk hostinga.

Promene nisu objavljene na produkciju i produkciona baza nije migrirana. Lokalna razvojna baza je migrirana posle rezervne kopije `.data/backups/mleko-before-packages-2026-10-09.sqlite`. Izolovana lokalna baza služi za pregled. Potrebno je primeniti migraciju pre aktivacije novog koda, usaglasiti stare pretplate i postaviti serverske tajne i poreze.

Testovi obuhvataju stvarne API rute nad SQLite bazom, konkurentne potvrde, ponavljanje, mešovite ritmove, pauzu, preskakanje, neuspelu isporuku, obnovu, nepromenljivost kupljene cene/količine, Fiscomm ugovor sa mock HTTP odgovorima, nepoznat ishod, nedostajuće poreze i otpremanje slike. Uspeh mock testa nije potvrda stvarno izdatog fiskalnog dokumenta.

Završna provera: 324 automatizovana testa prolaze, bez neuspešnih, preskočenih ili TODO testova. TypeScript, ESLint i produkciono kompajliranje prolaze. Dokazi za svih 200 pitanja su u [funkcionalnom izveštaju](funkcionalna-provera-200-pitanja.md), a browser provere u [zapisniku](audit-200/browser-results.json).


## Dopunjene funkcionalnosti i korišćenje

- **Proizvodi:** galerija i otpremanje fotografija, sastav, alergeni, nutritivne vrednosti, vremenski ograničena akcijska cena i kopiranje proizvoda. Kupljene cene ostaju sačuvane.
- **Popusti:** ograničenje po kupcu, prva kupovina i eksplicitno dozvoljeno kombinovanje najviše pet kodova. Svaki naredni popust primenjuje se na preostalu vrednost robe.
- **Kupovina:** odvojeni podaci firme/PIB i adresa računa, snimak adrese svake porudžbine, izbor termina, minimalna korpa i dozvoljene zone. Naredna gostujuća kupovina ne menja raniju adresu.
- **Nalog kupca:** profil, saglasnost za SMS, primena nove adrese na buduće izmenjive isporuke i zahtev za povraćaj. Raniji nastavak pauze bira prvi odgovarajući izmenjivi datum, a produženje ne zaobilazi ukupnu granicu tri meseca.
- **Dostave:** unesite stvarno uručenu količinu pre potvrde. Neuručeni ostatak ostaje obaveza, i kod jednokratne porudžbine i kod dodatka sledećoj isporuci.
- **Podešavanja → Poslovanje:** neradni dani, zone i termini uređuju se običnim poljima; magacin prikazuje lotove i rokove, prijem robe i zamenu rezervacije. Kontrola zaliha je opciona. Rezervacija celog paketa zahteva lot koji traje dovoljno dugo, što treba uzeti u obzir za sveže mleko. Kapacitet termina proverava nove porudžbine za izabrani datum; pomerene ponovljene posete zahtevaju operativnu proveru kapaciteta.
- **Zaposleni:** vlasnik, menadžer, dostavljač i finansije imaju različit pristup, proveren i na serveru. Dostavljač dobija listu dostava; deaktivacija naloga ukida pristup postojeće sesije. Dnevnik izmena beleži stvarnog prijavljenog korisnika.
- **Finansije i poruke:** trajni pokušaji naplate, odobrenja povraćaja, statusi poruka, ponovno slanje postojećeg računa bez novog fiskalnog izdavanja i usaglašavanje starih plaćenih paketa. Nepoznat rezultat kod provajdera zaustavlja automatsko ponavljanje.

## Povezivanje servisa kasnije

1. **Baza:** napraviti rezervnu kopiju, primeniti sve migracije na odabrani PostgreSQL servis i izvršiti integracionu proveru i probni oporavak. Lokalna SQLite kopija i oporavak testirani su; produkcioni PostgreSQL još nije potvrđen. Skripta `scripts/verify-local-backup.mjs` proverava samo lokalne SQLite datoteke.
2. **Resend:** postaviti `EMAIL_PROVIDER=resend`, `EMAIL_MODE=provider`, `EMAIL_API_KEY` i potvrđeni `EMAIL_FROM`. Potpisani callback je `/api/webhooks/email`, sa `RESEND_WEBHOOK_SECRET`. Testirani su potpis, ponavljanje događaja i obrnuti redosled; stvarni inbox zahteva povezivanje naloga.
3. **SMS/WhatsApp:** povezati Infobip nalog i odobrene podatke/šablone iz `.env.example`. SMS zahteva pristanak i prethodno potvrđen broj; u produkciji nije dovoljno uključiti simulaciju.
4. **Raiffeisen:** dostaviti konkretan merchant API ugovor, test nalog i podatke za potpisivanje callbacka. Trajni pokušaji, ograničen retry, potvrda plaćanja i tok povraćaja su pripremljeni, ali adapter za stvarnu početnu/recurring naplatu i povraćaj mora se implementirati prema tom ugovoru. Nazivi ruta banke nisu nagađani.
5. **Fiscomm:** potvrditi poreske oznake i računovodstvena pravila, a zatim proći stvarni testni avans i završni dokument. Stari paketi traže usaglašavanje originalnog fiskalnog zahteva pre završnog izdavanja. Nijedan pravi račun nije izdat tokom ovih provera.

Lokalne migracije 0017–0019 primenjene su na razvojnu i izolovanu preview bazu posle provere rezervnih kopija. Produkciona baza i hosting nisu menjani. Za demo i automatizovane testove koriste se isključivo sintetički kupci i lokalni mock režimi.
