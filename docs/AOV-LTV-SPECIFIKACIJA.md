# Mleko i Mleko — detaljna specifikacija za AOV i LTV, v2

Obavezni deo `OPUS-REDIZAJN-PLAN.md`. Namenjen izvršiocu sajta. Ovo nije prompt za video model. Sadrži precizna buduća ponašanja, uz razliku između postojećih mogućnosti, novih implementacija i komercijalnih odluka koje još nisu potvrđene.

**G01. Poslovni cilj i granice**

Cilj: povećati doprinos po isporuci i po kupcu kroz smislen izbor, ponovnu kupovinu i fleksibilnu pretplatu. Ne optimizovati samo iznos fakture. Veći broj budućih isporuka na istoj mesečnoj naplati nije dokaz da je povećana potrošnja po isporuci.

Primarne funkcije: jasni paketi, jedan relevantan dodatak, ponavljanje porudžbine, pregled i promena ritma pretplate. Pogodnosti koje troše novac uvode se tek sa tačnom cenom i proverom doprinosa.

Ovaj paket ne određuje aktuelne cene, novi prag besplatne dostave, procenat popusta, iznos kredita ili obećanu potrošnju mleka po domaćinstvu. Svaka takva vrednost mora imati potvrđen izvor. Ako nedostaje, pripremi mehanizam u test okruženju i drži ponudu isključenu u javnom prikazu.

**G02. Šta je već u kodu, a šta tek treba povezati**

Pregledano 9. septembra 2026; ponovo proveriti pre implementacije.

| Mogućnost | Uočena osnova | Značenje za implementaciju |
| --- | --- | --- |
| Paketi | `server/bundles.ts`, `app/components/bundle-offers.tsx` | Paket je skup stvarnih stavki, cena se izvodi iz njih. Nema zasebnog automatskog paket-popusta. |
| Korpa | `app/components/cart-provider.tsx` | Jedinstvena postojeća korpa; ključ razlikuje proizvod, način kupovine i ritam. |
| Obračun | `POST /api/cart` → `quoteCart` | Server vraća stavke, periode, popust, dostavu, ukupan iznos i preporuke. |
| Preporuke | `recommendedAddons` iz quote odgovora | Server trenutno isključuje proizvode u korpi i rangira aktivne proizvode po izračunatom doprinosu, zatim drugim poljima. Podrazumevane nulte troškove treba proveriti. |
| Besplatna dostava | `freeDeliveryThresholdMinor`, `freeDeliveryRemainingMinor` | Prag trenutno gleda subtotal celog obračuna pre promo-popusta, uključujući više termina pretplate. |
| Konverzija u pretplatu | `POST /api/orders/convert-to-subscription` | Postoji tokenizovana mutacija. Nije potvrđeno da postoje sve potrebne preview/eligibility provere za novi marketinški tok. |
| Izmene pretplate | `PATCH /api/account/subscriptions/[id]` | `expectedVersion` i idempotency ključ, cutoff i validacija stanja obavezni. |
| Dodatak sledećoj dostavi | `action: add_next_only` | Pravi zasebnu adjustment porudžbinu i može odmah pokrenuti naplatu. Cena je jednokratna cena proizvoda u pregledanom kodu. |
| Pauza, sporiji ritam i otkazivanje | `pause`, `resume`, `slow_down`, `skip_next`, `cancel`, `update_item` | Iskoristi postojeću logiku; otkazana pretplata je terminalna, ne može samo `resume`. |
| Poruke i outbox | `server/notifications.ts`, `server/integration-jobs.ts`, `server/outbox.ts` | Postoje servisne poruke i deduplikacija; marketinški scenariji nisu automatski time implementirani. |
| Oporavak korpe | `server/cart-recovery.ts` | Postoje pravila i saglasnosti; novi tokovi ne smeju duplicirati već planirane poruke. |
| Analitika | `server/analytics.ts` | Postoji dozvoljen spisak događaja. Novi naziv zahteva izmenu servera i odgovarajuću proveru. |

Važno: postojeći prikaz paketa može izostaviti neaktivan proizvod i ipak pokazati ostatak. Novi „Probaj oba“ ne sme nastaviti da nosi to ime ako jedna vrsta nije dostupna. Proveri kompletan sastav pre prikaza i dodavanja.

**G03. Prioriteti i podrazumevano aktiviranje**

| Prioritet | Obuhvat | Podrazumevano ponašanje |
| --- | --- | --- |
| P0 | Izbor količine, paketi bez novog popusta, jedna preporuka, jasna cena i ritam, postojeće akcije naloga, ispravni događaji. | Implementirati sa proverljivim katalogom i postojećim pravilima. |
| P1 | Ponovi porudžbinu, pregled pre konverzije, dodatak sledećoj dostavi, priprema lifecycle poruka, simulacija praga dostave. | Implementirati funkcije sa potpunim proverama; slanje poruka i nova pogodnost ostaju neaktivni bez uslova. |
| P2 | Nagrađivanje lojalnosti, referral krediti, segmentirani win-back i eksperimenti sa pogodnostima. | Detaljno pripremiti konfiguraciju/testove; ne uvoditi nepoznatu novčanu obavezu. |

Ako uvedeš opcije za aktiviranje, jasno ih dokumentuj kao nove. Predložene oznake `bundlesEnabled`, `crossSellEnabled`, `lifecycleCampaignsEnabled` i `loyaltyEnabled` nisu trenutno potvrđena polja baze. Uvedi ih kroz odgovarajuću migraciju/config putanju, bez lažnog čitanja nepostojećeg API polja. Za P2 je bezbedna početna vrednost isključeno.

**G04. Paketi — tačan sadržaj i prikaz**

Prvo preuzmi i mapiraj postojeće aktivne pakete. Sledeći raspored je predlog nove prezentacije za potvrđene proizvode. Ako postojeći paket već pokriva namenu, koristi njegov stvarni ID i sastav. Ako nije definisan, možeš napraviti lokalnu probnu konfiguraciju; nemoj objaviti novu cenu, popust ili izmeniti živi katalog bez potvrđenih vrednosti.

Predlog za katalog u kojem je jedna prodajna jedinica potvrđeno 1 L i dozvoljena količina 1 L:

| Paket | Sastav za prototip | Naslov | Opis | Akcija |
| --- | --- | --- | --- | --- |
| Manji izbor | 2 × 1 L odabrane vrste | „Prva dostava“ | „Manja količina za prvo upoznavanje.“ | „Izaberi paket“ |
| Veći izbor | 4 × 1 L odabrane vrste | „Za tvoje domaćinstvo“ | „Veća količina, uz izbor tvog ritma.“ | „Izaberi paket“ |
| Kombinacija | 1 × 1 L kravljeg + 1 × 1 L kozjeg | „Probaj oba“ | „Kravlje i kozje mleko u istoj dostavi.“ | „Izaberi paket“ |

Ovo nisu preporuke koliko neko treba da popije. Ne dodavati tvrdnje „za celu nedelju“, „za porodicu od četiri člana“ ili „najprodavanije“ bez podataka. Ako jedinica nije 1 L ili minimalna količina to ne dozvoljava, prilagodi sastav potvrđenim pravilima i zapiši razliku.

Paket kartica: naziv → stvarni sadržaj sa jedinicama → cena proizvoda po prvoj zajedničkoj dostavi → oznaka da dostava nije uključena kada nije → dugme. Najviše jedna oznaka „Predlog“ može označiti urednički izbor. „Najpopularnije“ zahteva stvarne prodajne podatke.

Na telefonu pakete prikaži posle direktnog izbora dva proizvoda kao kompaktan blok „Lakši izbor“. Jedna otvorena kartica/panel može prikazati ceo sastav; sva tri naziva moraju biti vidljiva bez obaveznog horizontalnog skrolovanja. Na desktopu tri kolone ako ima tri validna paketa.

Klik „Izaberi paket“ otvara pregled, ne naplatu. Prikazati jednokratno kao početni izbor novog kupca, ili stvarni način kupovine ako je odabran postojeći eksplicitno pretplatni paket. Svaka promena načina kupovine vraća novu cenu. Završno dugme je „Dodaj paket u korpu“.

Dodavanje paketa mora biti jedna logička akcija: prvo proveri sve stavke; zatim ih dodaj zajedno u korpu ili prikaži grešku. Ako postojeća korpa ima istu stavku sa istim ritmom, jasno spoji količine. Sa istim proizvodom i drugim ritmom zadrži zasebnu stavku. Ne šalji po jedan duplirani događaj za stavku i zatim još jedan koji ponovo broji istu prodaju; dogovori jednu semantiku `add_to_cart` za ovu akciju.

Paket bez popusta ima cenu zbira. Ušteda se prikazuje samo kada je dokaziva i poređenje koristi iste količine i isti period. Pretplatna cena nije dokaz dodatnog paket-popusta.

Prihvatni slučajevi: jedna komponenta nedostupna → paket ne može da se doda kao potpun; promenjena cena → novi pregled; dvostruki dodir tokom dodavanja → jedna korisnička akcija; neuspeh → prethodna korpa ostaje ispravna.

**G05. Jedna relevantna preporuka u običnoj korpi**

Mesto: ispod stavki, iznad sažetka plaćanja. Najviše jedna preporuka. Ne prekrivati checkout modalom i ne zahtevati odgovor da bi se nastavilo.

Pravila izbora, po redu:

1. Ako je korpa prazna, preporuka se ne prikazuje.
2. Ako je prisutna samo jedna vrsta mleka, traži drugu stvarno aktivnu vrstu iz serverom vraćenih kandidata.
3. Ako obe vrste već postoje, ne prikazuj isti cross-sell. Ne ubacuj sir, jogurt, med ili druge proizvode samo zato što postoji demo fotografija.
4. Ako postoji više kandidata, koristi potvrđenu relevantnost i privatni serverski rang. Troškove i maržu nikada ne šalji u javni UI.
5. Ako nema validnog kandidata, blok potpuno izostaje.

Tekst kada je u korpi samo kravlje mleko:

> Probaj i kozje mleko.
> Dodaj {količina i jedinica} samo ovoj dostavi.
> +{iznos prema jednokratnoj ceni}
> Dugme: „Dodaj u korpu“

Preporuka se dodaje kao `one_time`, bez cadence vrednosti. Ako obična korpa već sadrži pretplatu, nova jednokratna stavka ide u isti obračun uz prvu predviđenu isporuku prema serveru. Ne menjati ostale stavke u pretplatu i ne obećavati besplatnu dostavu bez quote odgovora.

Posle dodavanja ažuriraj stavke i quote, pokaži kratko „Dodato“ uz dostupno uklanjanje. Ne dodavati novi overlay sa sledećom ponudom. Nakon zatvaranja preporuke ne vraćaj je u istoj sesiji za isti sadržaj korpe.

Ako server tokom akcije odbije proizvod, prikazati „Ovaj proizvod trenutno nije dostupan.“ i sačuvati originalnu korpu. Cena koja se promenila zahteva jasno ažuriranje pre naplate.

**G06. Dodatak postojećoj sledećoj dostavi — poseban tok**

Ovo nije običan `addItem`. Postojeći `add_next_only` može odmah pokrenuti finansijsku operaciju. Prikazati ga samo prijavljenom kupcu koji ima aktivnu, izmenjivu i identifikovanu pretplatu sa dostupnom sledećom isporukom.

Mesto: kartica sledeće dostave na nalogu. Naslov „Dodaj samo sledećoj dostavi“. Izbor iz stvarnog kataloga, jedinica, količina i jednokratna cena. Navedi „Ovo ne menja tvoj redovni paket.“ samo ako implementacija zaista ne menja trajne stavke.

Prvi klik otvara pregled. Pregled mora sadržati: konkretan proizvod, količinu, datum, cenu proizvoda, eventualne dodatne troškove, način plaćanja i šta se događa klikom. Dugme za karticu koristi „Poruči i plati {iznos}“ kada stvarno pokreće naplatu. Za gotovinu „Potvrdi dodatak — {iznos} za plaćanje“ uz stvarno pravilo kada se plaća. Ne koristiti neodređeno „Sačuvaj“ za akciju koja naplaćuje.

Tehnički:

- Autentifikacija i vlasništvo proveravaju se na serveru.
- Koristi stvarni `subscriptionId`, najnoviji `expectedVersion` i jedan idempotency ključ za jednu potvrdu. Ponovni pokušaj neizvesnog istog zahteva koristi isti ključ i identičan payload.
- `409` sa promenom verzije: osveži stanje i prikaži novi pregled; ne potvrđuj automatski izmenjenu naplatu.
- Prošao rok: „Izmene za ovu dostavu su zatvorene.“; ne prebacuj dodatak na drugi datum bez izbora korisnika.
- Kartična potvrda zahteva stvarni payment rezultat. Ako provider zahteva dodatnu akciju, prikaži je; ne prijavljuj uspešnu naplatu unapred.
- Greška naplate ne sme biti predstavljena kao uspešno plaćen dodatak. Posle timeout-a proveri rezultat/idempotentni odgovor pre novog pokušaja.
- Dodatak mora biti prikazan u nalogu i uključen tačno jednom u projekciju isporuke. Ne sme postati trajna stavka sledećeg meseca.

Postojeći kod nema dokazano kompletan nepromenljiv preview ugovor za ovaj novi UI. Ako je potreban, dodaj read-only obračun koji deli istu serversku logiku i proveru cene pri potvrdi. Ako se cena promeni između pregleda i potvrde, vrati novi iznos na pregled umesto tihe naplate većeg iznosa. Naziv i rutu novog preview API-ja dokumentuj kao novu implementaciju.

Testovi: dupli dodir; timeout pa retry; promena cene; stara verzija pretplate; zatvoren cutoff; pauzirana/otkazana pretplata; neuspešna naplata; stvarna isporuka i odsustvo dodatka u sledećem ciklusu.

**G07. Prag besplatne dostave — precizna semantika**

Ne menjaj prag samo da bi se pojavila motivaciona traka. U pregledanom `quoteCart` kodu:

- `subtotalMinor` uključuje količine svih obračunatih isporuka.
- Prag se poredi sa tim subtotalom pre promo-popusta.
- Ako je prag dostignut, naknada dostave za taj obračun je nula.
- `freeDeliveryRemainingMinor` opisuje nedostajući iznos na nivou tog obračuna.

Zato frontend ne sme taj broj nazvati „još X do besplatne sledeće dostave“ kada se odnosi na više termina. Nemoj lokalno računati drugi prag po isporuci. Eventualna promena na prag po isporuci je nova poslovna odluka sa zajedničkom izmenom quote-a, checkout-a, mesečnog billing-a i testova.

Do potvrde komercijalne politike traka može ostati isključena, uz tačan serverski zbir. Ako se koristi postojeće potvrđeno pravilo:

| Stanje | Prikaz |
| --- | --- |
| Prag isključen ili nepoznat | Nema motivacione trake. |
| Korpa prazna | Nema trake. |
| Jednokratna korpa ispod praga | „Do besplatne dostave nedostaje {iznos proizvoda}.“ |
| Obračun pretplate ispod praga | „Do besplatne dostave za ovaj obračun nedostaje {iznos proizvoda}.“ + pregled perioda/termina. |
| Prag dostignut i quote potvrđuje nultu naknadu | „Dostava za ovaj obračun je bez naknade.“ |
| Obrada ili neuspešan quote | Sakriti pozitivno obećanje; prikazati proveru troškova. |

Dostignut prag računa se iz istog serverskog odgovora kao cena. Zadržati razliku između 0 kao „isključeno“ i stvarno potvrđene besplatne dostave. Uklanjanje stavke ili promena ritma ponovo obračunava pogodnost. Promo kombinacije moraju slediti ista serverska pravila; ne pretpostavljati da se pogodnosti sabiraju.

Za izbor novog praga pripremi simulaciju na istorijskim korpama: sadašnji doprinos, doprinos uz pogodnost, verovatno potreban dodatak i broj korpi koje dobijaju pogodnost bez ikakve promene ponašanja. Ne zaključuj povećanje potrošnje iz same simulacije. Poredi stvarne rezultate kontrolne i test grupe kada saobraćaj to dozvoli.

**G08. Ponovi prethodnu porudžbinu**

Mesto: istorija porudžbina i kartica na nalogu za kupca bez iste već planirane dostave. Akcija „Ponovi izbor“ otvara pregled novih uslova; ne pokreće direktnu naplatu i ne kopira stari payment status.

U pregled prenesi SKU i količine iz prethodne relevantne jednokratne kupovine. Učitaj današnje cene, dostupnost, pravila i sledeći termin. Ne kopiraj stari kupon, istorijsku besplatnu dostavu ili završeni rok za izmenu kao važeće.

Ako korpa već ima stavke, ponudi jasan izbor „Dodaj ovom izboru“ i „Zameni sadržaj korpe“. Ne briši korpu bez radnje korisnika. Stavke sa različitim ritmom ostaju različite.

Ako postoji isporuka za isti termin, prikaži obaveštenje i link „Pogledaj zakazanu dostavu“. Korisnik može eksplicitno odabrati dodatnu narudžbinu, ali se duplikat ne kreira automatski.

Nedostupan proizvod označi pojedinačno i traži uklanjanje/promenu; drugi proizvod se ne ubacuje sam. Promenjena cena se prikazuje kao sadašnja cena, uz kratku napomenu da je izbor obračunat po aktuelnoj ponudi.

**G09. Pretvaranje ponovljene kupovine u pretplatu**

Predlog prikaza: posle dve uspešno plaćene i isporučene kupovine sa istim ili sličnim izborom, ili na nalogu gde kupac sam izabere ovu opciju. Dve kupovine su početno pravilo za test, ne dokazana optimalna vrednost.

Tekst:

> Želiš isti izbor redovno?
> Sačuvaj količinu i izaberi ritam dostave. Datum, rok za izmene i obračun videćeš pre potvrde.
> Dugme: „Podesi redovnu dostavu“.

Pre potvrde prikazati proizvode, količinu po terminu, nedeljni/dvonedeljni ritam, prvi budući validan datum, sve termine obračuna, ukupan iznos, kada se plaća i pravila izmene. Ne tvrditi „uštedu“ ako redovna cena nije niža.

Postojeća conversion ruta koristi token, može odbiti istekao/iskorišćen token i u pregledanom kodu računa početak iz datuma izvorne porudžbine + 7 dana. Za kasnije lifecycle pozive proveri da li je to i dalje budući dozvoljen datum. Ako nije, proširi serverski tok zajedničkim kalendarom i odgovarajućim testovima; nemoj popravljati datum samo u tekstu na frontendu.

Proveri da izvor pripada kupcu, da ispunjava uslove kampanje i da već nije pretvoren u istu aktivnu pretplatu. Jednokratni token i idempotentno kreiranje štite od duplog aktiviranja. Ako je token istekao, ponudi novi autentifikovan pregled prema stvarnim mogućnostima, bez zaobilaženja provere.

**G10. Zadržavanje i otkazivanje**

Na nalogu prikaži najbližu dostavu i tri primarne mogućnosti: „Promeni izbor“, „Preskoči dostavu“, „Pauziraj“. Link „Otkaži redovnu dostavu“ ostaje lako pronaći.

Pri otkazivanju pitanje o razlogu je opciono. Jedna odgovarajuća alternativa je dozvoljena; nema niza prepreka.

| Razlog | Ponuda | Pravilo |
| --- | --- | --- |
| Ostaje mi mleka | „Smanji količinu“ ili „Pređi na svake 2 nedelje“. | Kupac pregleda novu količinu/obračun i potvrđuje. |
| Putujem | „Pauziraj do datuma“. | Datum i povratak usklađeni sa serverom. |
| Preskupo mi je | Manji izbor ili ređi ritam. | Bez automatskog, neodobrenog popusta. |
| Problem sa dostavom/proizvodom | Kontakt za rešavanje konkretnog problema. | Otkazivanje i dalje dostupno, kontakt nije obavezan. |
| Želim da otkažem | Direktna potvrda otkazivanja. | Bez prisilnog poziva ili obaveznog objašnjenja. |

Posle potvrde prikaži stvarni datum efekta, status već zaključane dostave i eventualni kredit iz servera. Ne obećavaj trenutni povraćaj novca ako backend evidentira kredit za sledeći obračun. `cancelled` se razlikuje od `paused`; ponovno pokretanje otkazane pretplate zahteva novi dozvoljeni tok.

**G11. Komunikacija između isporuka**

Ovde se pripremaju automatizacije aplikacije, ne automatsko slanje poruka tokom implementacije. Koristi postojeći outbox i proverene kanale. Nove marketinške poruke ostaju u režimu nacrta/testa dok nema stvarnog aktivnog provajdera, odgovarajuće saglasnosti i odluke da se kampanja uključi.

Početni raspored za test:

| Tok | Okidač i uslov | Sadržaj i akcija | Kada se ne šalje |
| --- | --- | --- | --- |
| Provera prve isporuke | 18–24 h posle prve stvarno označene uspešne isporuke. | „Da li je sve stiglo kako treba?“ → prijava problema/kontakt. | Isporuka nije završena, već postoji otvorena reklamacija ili je poruka već poslata. |
| Ponovna kupovina | 24 h pre sledećeg relevantnog cutoff-a, za jednokratnog kupca sa potvrđenim/izabranim interesovanjem za ponavljanje. | „Ponovi prethodni izbor za {datum}.“ → novi pregled korpe. | Isti termin već naručen, aktivna odgovarajuća pretplata, nema odgovarajuće saglasnosti. |
| Podešavanje ritma | Posle druge plaćene i isporučene kupovine koja ispunjava uslove. | „Podesi redovnu dostavu“. | Kupac već ima isti redovan izbor, prethodno odbio ponudu u tekućem periodu ili nema saglasnosti. |
| Izmena sledeće isporuke | Pre stvarnog roka izmene, npr. 24 h ranije, samo ako poruka tada još ima smisla. | Sadržaj isporuke, datum, rok; akcija „Uredi dostavu“. | Rok je prošao, pauzirano ili otkazano; servisni podsetnik i prodajna ponuda moraju biti pravilno razdvojeni. |
| Povratak kupca | Dva propuštena očekivana ciklusa samo kada pouzdano znamo očekivani ritam. | „Tvoj prethodni izbor je dostupan“ samo ako jeste → pregled. | Pauza/putovanje, prigovor, nema poznatog ritma, otvorena reklamacija, odjava. |

Nemoj pretpostaviti nedeljnu potrošnju na osnovu samo jedne kupovine. Ako ritam nije poznat, ponudi kupcu podešavanje podsetnika na nalogu; automatski predlog ostaje isključen.

Predlog ograničenja: najviše jedna promotivna poruka po kupcu u sedam dana, kroz sve kanale zajedno. Servisne poruke imaju poseban režim i ne koriste se kao zaobilazni kanal za promocije. Ograničenje je odluka za početni test, dokumentovana i podesiva.

Svaka planirana poruka ima jedinstveni ključ kampanja + kupac + relevantna isporuka/ciklus. Pre samog slanja ponovo proveri status isporuke, saglasnost, novu kupovinu i vreme cutoff-a. Promena rasporeda poništava stari posao. Koristi `Europe/Belgrade` i postojeći poslovni kalendar, bez tvrdog dodavanja 24 sata kroz promenu računanja vremena.

Tekst za ponovnu kupovinu, sa potvrđenim podacima:

> Zdravo, {ime ako je dostupno}.
> Ako želiš isti izbor za {datum}, možeš da ga pregledaš i poručiš do {rok}.
> {stavke sa količinama}
> Cene i dostupnost potvrđuju se u pregledu porudžbine.
> Akcija: „Pregledaj prethodni izbor“.

Ime, adresa i sadržaj porudžbine koriste se samo u odgovarajućem privatnom toku. Ne dodavati ih u analitičke događaje ili javne linkove. Klik na poruku nikada sam ne kreira naplatu.

**G12. Lojalnost i preporuke — P2**

Ostaviti isključeno dok nisu definisani: broj kvalifikovanih isporuka, iznos nagrade, minimalan doprinos, rok važenja ako postoji, uslovi korišćenja, kombinovanje sa drugim pogodnostima i pravila povraćaja.

Predlog mehanike lojalnosti: nagrada se stiče posle N uspešno plaćenih i isporučenih fizičkih dostava, ne N faktura. Vrednosti N i iznos R su nepoznati; ne postavljati ih proizvoljno u produkciju. Prikaz napretka postoji tek kada su pravila potvrđena i brojanje pouzdano.

Referral: nagrada tek kada preporučeni novi kupac završi kvalifikovanu kupovinu i isporuku prema potvrđenim pravilima. Jedna kvalifikovana preporuka ima jedan zapis nagrade. Ponavljanje webhook-a ne izdaje dupli kredit. Ne tretirati svaku novu email adresu kao dokaz novog domaćinstva; definisati pravila zloupotrebe pre uključivanja.

Postojeći `credits_ledger` služi i za obračunske korekcije. Nagradni kredit mora imati jasan izvor i semantiku; ne mešati ga sa povratom ranije plaćenog iznosa i ne brojati ga dvaput kao trošak. Ako šema ne podržava potrebnu evidenciju, dodati eksplicitnu proširivu strukturu i migraciju.

Stanja nagrade za novu implementaciju: pending → eligible → issued → redeemed; zasebno void kada pravila dozvoljavaju poništavanje. Nemoj obećati naknadno oduzimanje već potrošene nagrade bez jasnih pravila. Izvršilac priprema dokaziv tok, ne izmišlja uslove.

**G13. Merenje koje ne naduvava rezultat**

Dogovori i dokumentuj poresku osnovu izveštaja; prihode i troškove poredi na istoj osnovi. Javne cene su prema postojećem prikazu, a interni izveštaj mora jasno reći šta uključuje. Ovo su operativne metrike, ne zamena za finansijsko knjigovodstvo.

| Metrika | Definicija za ovaj projekat |
| --- | --- |
| AOV jednokratne kupovine | Neto prihod od proizvoda za kvalifikovane jednokratne porudžbine / njihov broj. Jasno navedi tretman povrata, dostave i poreza. |
| Vrednost po isporuci | Prihod od stvarno isporučenih proizvoda, pravilno raspodeljenih popusta i povrata / broj fizičkih kvalifikovanih isporuka. |
| Doprinos po isporuci | Prihod proizvoda + naplaćena dostava − proizvodi − ambalaža − dostavna ruta pripisana isporuci − payment trošak − drugi direktni troškovi. |
| Stopa druge isporuke | Kupci sa drugom kvalifikovanom isporukom u 30 dana / kupci prve isporuke za koje je prošlo svih 30 dana. |
| Realizovana vrednost kupca D30/D60/D90 | Kumulativni neto prihod/doprinos od stvarnih isporuka u prvih 30/60/90 dana po kupcu, uz korekcije. |
| Zadržavanje pretplatnika | Udeo početne grupe sa definisanim aktivnim statusom; odvojeno prijaviti pauzirane i kupce sa stvarnom narednom plaćenom/isporučenom dostavom. |
| Udeo dodataka | Isporuke sa potvrđenim dodatkom / isporuke koje su bile podobne za ponudu dodatka. |
| Doprinos po poseti | Pripisani doprinos / kvalifikovane posete sa jasno navedenim ograničenjem analitičke saglasnosti. |

Realizovani doprinos po kupcu za 90 dana nije ceo budući LTV. Projekciju LTV-a označi kao projekciju sa modelom i pretpostavkama. Ne izvoditi „doživotnu vrednost“ iz dva meseca bez ograničenja.

Mesečna faktura se može odnositi na više dostava. Adjustment porudžbina može biti dodatak istoj fizičkoj isporuci. Grupisanje samo po `orders.id` ne rešava ovu metriku. Proveri mapiranje kroz `delivery_orders`, `delivery_items`, izvorne porudžbine, pretplate i dodatke. Isti kupac i datum ne moraju u svakom budućem modelu značiti jedno zaustavljanje; dokumentuj stvarnu jedinicu dostave.

Isključiti buduće, otkazane i neuspešne isporuke iz realizovanog prihoda po isporuci. Predujam za buduće isporuke prikazati odvojeno. Popuste raspodeliti po dokumentovanom pravilu na pripadajuće stavke/termine, uz očuvanje ukupnog iznosa do najmanje novčane jedinice. Istorijske prodaje koriste istorijske troškove kada postoje, ne današnju cenu nabavke.

Nulte podrazumevane troškove označiti kao nedostajuću potvrdu, posebno trošak rute. Ne množi procenjeni trošak iz jednog polja brojem isporuka dok ne utvrdiš da li polje već predstavlja ceo obračun. Povrat novca, obračunski kredit i promotivna nagrada nisu isti događaj.

**G14. Analitički događaji**

Koristi postojeće nazive gde odgovaraju: `view_item`, `select_item`, `add_to_cart`, `begin_checkout`, `subscription_selected`, `delivery_cadence_selected`, `subscription_converted`, `add_to_next_delivery`, `subscription_paused`, `subscription_cancelled`. Proveri stvarni `eventNames` spisak u `server/analytics.ts`; spisak u integracionim ugovorima trenutno nije identičan.

Nova potrebna izlaganja ponudi možeš uvesti kao dokumentovane događaje, npr. `offer_viewed` i `offer_dismissed`, tek uz serversku validaciju. Ovo su predloženi nazivi, ne postojeći API ugovor. Izlaganje se beleži kada je ponuda zaista vidljiva, npr. najmanje 50% bloka tokom jedne sekunde, jednom po ponudi i sesiji. Metod jasno dokumentuj.

Svojstva: stabilan offer ID, vrsta ponude, verzija pravila, proizvod, izabrana količina i jedinica, režim, iznos sa naznačenom osnovom (`per_delivery` ili `billing_total`), varijanta eksperimenta kada postoji. Ne slati troškove nabavke, adresu, email, telefon, token ili tekst reklamacije.

`purchase` ostaje serverom potvrđen događaj naplate uz deduplikaciju. `order_created`, dodavanje u korpu i otvaranje zahvalnice nisu zamena. Marketinška analitika poštuje postojeću saglasnost; autorizovana operativna evidencija isporuka služi zasebno za tačno brojanje poslovnih rezultata.

**G15. Proverljivi primeri — ISKLJUČIVO TEST PODACI**

Sledeće cene, količine i kalendar su izmišljene test-fixture vrednosti. Nikada ih ne sejati u živi katalog niti prikazati kao komercijalnu ponudu.

Pretpostavke testa: jedna jedinica = 1 L; kravlje jednokratno 250 RSD, pretplata 230 RSD; kozje jednokratno 400 RSD, pretplata 370 RSD; dostava 350 RSD po terminu; prag isključen osim gde je naveden; test-kalendar sa tačno četiri preostala nedeljna termina. Sve računice implementirati u integer minor jedinicama.

| Test | Unos | Očekivan obračun |
| --- | --- | --- |
| AOV-01 | 2 L kravljeg, jednokratno. | Proizvodi 500; dostava 350; ukupno 850 RSD. |
| AOV-02 | Prethodnoj korpi dodat 1 L kozjeg samo jednom. | Proizvodi 900; dostava 350; ukupno 1.250 RSD; nema pretplate. |
| AOV-03 | Paket 4 L kravljeg bez popusta. | Proizvodi 1.000; dostava 350; ukupno 1.350 RSD; nema izmišljene uštede. |
| AOV-04 | 2 L kravljeg nedeljno, četiri termina. | Proizvodi po terminu 460; proizvodi obračuna 1.840; dostava 1.400; obračun 3.240 RSD. |
| AOV-05 | AOV-04 + 1 L kozjeg jednokratno u običnoj korpi. | Proizvodi 2.240; dostava 1.400; ukupno 3.640 RSD; kozje samo na prvom terminu. |
| AOV-06 | Prag 3.000 RSD za postojeću semantiku, AOV-04. | Nedostaje 1.160 RSD proizvoda do praga obračuna; ne 2.540 po pojedinačnoj dostavi. |
| AOV-07 | Prag 3.000; 4 L kravljeg nedeljno, četiri termina. | Proizvodi 3.680; dostava 0; obračun 3.680 RSD po sadašnjem pravilu. |
| AOV-08 | AOV-07 + validan test promo 10% na proizvode. | Popust 368; dostava ostaje 0 prema postojećoj proveri praga pre popusta; ukupno 3.312 RSD. |
| AOV-09 | Postojećoj aktivnoj pretplati `add_next_only` 1 L kozjeg. | Zaseban dodatak 400 RSD po pregledanom kodu, jedna adjustment porudžbina, ne trajna pretplatna stavka. |
| AOV-10 | Isti addon zahtev ponovljen sa istim ključem. | Isti rezultat, bez druge naplate i duplog dodatka. |
| AOV-11 | Poslednja akcija izbora 4 L posle ranijih 2 i 8. | UI koristi poslednju količinu i pripadajući quote; zakašnjeli odgovori ne vraćaju staru cenu. |
| AOV-12 | Jedna mesečna faktura, četiri isporuke i addon uz jednu od njih. | Četiri fizičke isporuke kada je dodatak stvarno spojen; ne pet zbog broja računa. |

Dodatno testirati neaktivnu komponentu paketa, kupca sa postojećom istom dostavom, token koji je istekao, cutoff preko promene vremena, dupli job poruke i odjavu između planiranja i slanja. Ako stvarni serverski ugovor promeni rezultat, najpre razjasni da li je promenjeno pravilo ili otkriven bug; ne prilagođavaj samo prikaz da broj „izgleda dobro“.

**G16. Eksperimenti i uslov uspeha**

Prvo zabeleži osnovno stanje i kvalitet podataka. Zatim testiraj jednu veću hipotezu odjednom: prikaz paketa → preporuka → ponovna kupovina → pogodnost dostave. Ne menjati istovremeno prag, cene, paket i kampanju pa pripisati rezultat jednom dugmetu.

Za svaki test unapred zapiši: ko je podoban, varijanta, primarna metrika, period praćenja, potrebna veličina uzorka prema stvarnoj osnovi i minimalnom efektu koji je poslovno važan. Ne određuj proizvoljan broj dana kao dokaz uspeha. Kod malog saobraćaja koristi kvalitativne uvide i jasno označene opisne rezultate.

Paketi/preporuke uspevaju ako povećaju doprinos po podobnoj poseti ili kupcu uz prihvatljivu konverziju i bez povećanih problema sa isporukom. LTV tokove proveravaj po grupama kupaca sa istim vremenom praćenja; mlađu grupu ne poredi direktno sa starijom koja je imala više vremena da kupuje.

Prati i: odustajanje na ceni dostave, reklamacije, povrate, višak mleka prijavljen kroz povratnu informaciju, otkazivanje ubrzo nakon aktivacije i stopu odjave sa poruka. Povećan AOV uz manji ukupan doprinos nije uspešan rezultat.

**G17. Šta se predaje**

Funkcionalni P0 tokovi; provereni P1 tokovi gde su uslovi ispunjeni; jasno isključene kampanje i pogodnosti bez potvrđenih vrednosti; matrica događaja; testovi; izveštaj o stvarnim podacima i nedostajućim troškovima. Ne prikazivati prazan ili demonstracioni dashboard kao dokaz rasta AOV/LTV.
