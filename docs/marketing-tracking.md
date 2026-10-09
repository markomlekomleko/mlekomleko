# Analitika, kampanje i izvori prodaje

Implementirano 17.09.2026. Lokalni testovi ne predstavljaju potvrdu prijema podataka u Google/Meta nalozima.

## Pristanak i identitet

Pre pristanka ne nastaju analytics identifikatori, attribution storage niti zahtevi analytics endpointu ili vendor skriptama. Neophodan je samo zapis izbora privatnosti. Analitika i marketing se čitaju posebno; gclid/fbclid se ne čuvaju bez marketing pristanka. Opoziv briše identifikatore i poznate first-party analytics cookies i ponovo učitava stranicu da ukloni postojeće vendor listenere.

Dozvoljeni first/last relevantni dodir kampanje ostaje do 90 dana u istom browseru. Interna navigacija i direktni povratak ne prepisuju kampanju. Novi UTM ili spoljašnji referrer ažurira poslednji dodir. Ne pokušava se povezivanje različitih uređaja, privatnih browsera ili posetilaca bez pristanka. UTM označavanje je potrebno za QR, influensere i poruke.

`anonymousId`, `sessionId`, `gaClientId`, `gaSessionId` putuju sa porudžbinom samo uz analytics pristanak. Backend dopušta samo ograničen skup bez kontakta, tokena ili adresa. `purchase` mogu da upišu samo server i potvrđena naplata; kreirana gotovinska porudžbina nije prihod. Identitet se koristi za povezivanje plaćene porudžbine sa posetom. Legacy zapisi bez identiteta ostaju nepovezani umesto izmišljene atribucije.

## Podešavanje spoljnih naloga

Direktni režim:

- `NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-...` i `GA4_API_SECRET` iz istog web streama. Browser šalje preglede/korpu/checkout; server šalje `purchase` sa RSD iznosom, stavkama, transaction ID i identitetom posete. Ne šalje se dupli browser purchase.
- `NEXT_PUBLIC_META_PIXEL_ID` uključuje Pixel uz marketing dozvolu. `META_CONVERSIONS_ACCESS_TOKEN` i eksplicitni podržani `META_GRAPH_API_VERSION` uključuju serverski Purchase uz oba pristanka. Koristi se hash anonimnog identiteta; kontakt kupca se ne prosleđuje. Pixel Purchase se ne duplira u browseru.
- `NEXT_PUBLIC_GOOGLE_ADS_ID=AW-...` uključuje Ads tag uz marketing dozvolu. **Za prodajne konverzije u Google Ads povezati GA4 nalog i uvesti GA4 `purchase` kao primarnu konverziju.** Ne dodavati paralelno drugi purchase conversion tag jer bi duplirao prodaju. Ovo podešavanje je u Ads nalogu i ne može biti potvrđeno iz repozitorijuma.

Alternativni GTM režim:

- `NEXT_PUBLIC_GTM_CONTAINER_ID=GTM-...` isključuje direktne GA4/Meta/Ads tagove. Container se preuzima tek uz oba pristanka jer može sadržati proizvoljne tagove.
- Koristiti dataLayer događaje i objekat `ecommerce`. Napraviti dataLayer promenljive `analytics_identity.gaClientId` i `analytics_identity.gaSessionId` i postaviti ih kao `client_id` / `session_id` u Google tagu da MP purchase koristi isti identitet. Isključiti automatski page_view i Enhanced Measurement promene istorije: aplikacija već emituje page_view pri SPA navigaciji. Tagovi u containeru moraju imati consent checks.
- Ne praviti browser purchase tag: confirmed purchase ide preko serverskog MP/CAPI toka. Konfigurisati isti GA4 stream i Meta Pixel u server promenljivama ako se koriste serverske kupovine.

Readiness u adminu pokazuje samo da li su promenljive prisutne. To nije dokaz uspešnog prijema. GA4 HTTP 2xx nije dokaz da je Google validirao događaj. Proveriti DebugView/Realtime, Meta Test Events i Ads uvoz sa kontrolisanom test porudžbinom pre puštanja kampanje. Produkcioni IDs/secrets, nalozi i odobrenje stvarnog finansijskog testa nisu dostupni u ovoj proveri.

## Izveštaj u adminu

Pregled sadrži tabelu kanal / izvor / kampanja → posete → proizvodi → korpa → checkout → broj porudžbina → plaćene porudžbine → prihod. Pretraga filtrira kanal/kampanju. Svaki korak broji različite browser sesije koje su ga dosegle, ne zbir klikova. To je pregled aktivnosti, ne tvrdnja da je svaki kupac redom prošao sve korake. Konverzija je udeo poseta koje imaju povezanu plaćenu porudžbinu u istom izabranom periodu; bez pristanka nema izmišljene posete. Datumi porudžbina su datumi nastanka, naplata je trenutni status; mesečne invoice porudžbine zadržavaju izvor prvobitne pretplate, a ne novu browser posetu.

Pravila kanala razlikuju direktno, organsku/plaćenu pretragu, organske/plaćene društvene mreže, QR, influensere, email, poruke, referral i ručni unos. Kampanja može biti sačuvana, a da kompletan funnel nije zabeležen (npr. ad blocker, drugi dan, kasnija naplata).

## Reference

- [Google CSP direktive](https://developers.google.com/tag-platform/security/guides/csp)
- [Google ecommerce](https://developers.google.com/analytics/devguides/collection/ga4/ecommerce)
- [Uvoz GA4 konverzija u Google Ads](https://support.google.com/google-ads/answer/2375435)
- [Google Consent Mode](https://developers.google.com/tag-platform/security/guides/consent)
- [GA4 Measurement Protocol reference](https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference)
- [Meta Pixel reference](https://developers.facebook.com/docs/meta-pixel/reference/)
- [Meta server event parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event/)


## Status podešavanja — 09.10.2026.

Dorađen je lokalni cookie panel: zasebne opcije, čuvanje izbora, otvaranje iz podnožja, Google Consent Mode v2 sa početnim `denied` stanjem, opoziv Google/Meta dozvole pre reload-a, uklanjanje vendor cookies i sa roditeljskog domena, sinhronizacija izbora između tabova i rad kada je localStorage blokiran. U direktnom režimu Ads prepoznaje `gclid`, `gbraid` i `wbraid` sa trenutne stranice samo uz marketing dozvolu. Referrer za Google događaje sveden je na origin bez query parametara. Jedna gtag biblioteka se koristi i kada posetilac naknadno dozvoli drugu kategoriju.

Nalozi nisu kreirani niti povezani: dostupna Analytics sesija pokazuje Lukine naloge, bez traženog poslovnog Google profila 3&more DOO Beograd. Nisu uneseni izmišljeni ID-jevi ni korišćeni ID-jevi drugih sajtova. Produkcione promenljive i deploy nisu menjani. Search Console je namerno ostavljen za kasnije.

Provera: 10 ciljanih Node testova za pristanak i atribuciju prolazi; ESLint izmenjenih TS/TSX fajlova prolazi. Proveren je lokalni panel kroz browser, uključujući čuvanje analytics-only izbora i ponovno otvaranje iz podnožja. Globalni typecheck blokiraju ranije postojeće greške tipova u `server/profile.ts` (linije 18 i 20). Nije potvrđen prijem stvarnih događaja u GA4/Ads.

## Dovršavanje Google naloga

1. Na poslovnom Google profilu otvoriti Google Analytics i napraviti ili izabrati nalog `3&more DOO Beograd` i GA4 property `Mleko i Mleko`. Vremenska zona: Europe/Belgrade; valuta: RSD. Web stream treba da koristi potvrđeni produkcioni domen, ne localhost. Zabeležiti Measurement ID `G-…`.
2. U web streamu isključiti automatske preglede pri promeni browser istorije: sajt već šalje SPA `page_view`. Isključiti automatsko merenje formulara i automatsko prikupljanje korisničkih podataka; događaji kupovine već su eksplicitni. Ne slati ime, email, telefon, adresu ni login tokene kao event parametre.
3. Za serversku potvrdu plaćene kupovine napraviti Measurement Protocol API secret u tom istom streamu. Čuvati ga samo kao `GA4_API_SECRET` u tajnama hostinga. Postaviti `GA4_MEASUREMENT_ID` i `NEXT_PUBLIC_GA4_MEASUREMENT_ID` na isti ID. Browser identitet mora ostati isti kao u serverskom purchase događaju.
4. U Google Tag Manager-u napraviti nalog `3&more DOO Beograd`, zemlja Srbija, i Web container `Mleko i Mleko`. GTM režim uključiti tek kada je kontejner podešen i objavljen; inače ostaviti `NEXT_PUBLIC_GTM_CONTAINER_ID` prazan i koristiti direktni režim. Sam prazan GTM kontejner ne meri ništa.
5. U GTM napraviti Google tag sa GA4 ID-jem, `send_page_view=false`, `client_id={{analytics_identity.gaClientId}}`, `session_id={{analytics_identity.gaSessionId}}`, kao Data Layer Variable v2 promenljivama. Za događaje koristiti eksplicitne custom event triggere za `page_view`, `view_item_list`, `view_item`, `add_to_cart`, `view_cart`, `begin_checkout`, `add_payment_info` i odgovarajući GA4 Event tag koji čita `ecommerce` iz dataLayer-a. Page location/referrer uzimati iz sanitizovanog payload-a, ne iz punog URL-a stranice.
6. Za Google Ads tag koristiti stvarni `AW-…` ID i Conversion Linker. Zahtevati marketinške consent checks. Za sve GA4 tagove zahtevati `analytics_storage`, a za Ads `ad_storage`, `ad_user_data`, `ad_personalization`. Postojeći konzervativni GTM režim učitava kontejner samo uz oba pristanka; analytics-only izbor tada meri samo internu analitiku sajta. Za nezavisni GA4 analytics-only rad koristiti direktni režim dok se ne konfiguriše i proveri GTM consent template za odvojene kategorije.
7. Povezati GA4 i odgovarajući Google Ads nalog preko Product links → Google Ads links; uključiti auto-tagging. U Google Ads napraviti konverziju iz GA4 `purchase`, proveriti da je Primary i da broji svaku kupovinu. Za tu istu prodaju ne postavljati drugi primarni Ads purchase tag. Naplata, iznos RSD i `transaction_id` dolaze sa servera. Bez `GA4_API_SECRET` ovaj serverski tok neće slati kupovine u Google.
8. Uneti javne ID-jeve u build environment hostinga i ponovo napraviti/deploy-ovati sajt: Next ugrađuje `NEXT_PUBLIC_*` vrednosti tokom build-a. Proveriti GA4 Realtime/DebugView, GTM Preview/Tag Assistant i Google Ads dijagnostiku. Testirati odbijanje, analytics-only, sve dozvole, opoziv, SPA navigaciju i jednu potvrđenu test kupovinu bez dupliranja prihoda.

Ovo je pripremljen postupak; koraci u spoljnim nalozima još nisu izvršeni. Google uslovi korišćenja i eventualni ekran za prihvatanje pravnih uslova zahtevaju potvrdu vlasnika pri samom prihvatanju.

## Meta Pixel — kako se povezuje na ovaj sajt

Meta nalog ovom izmenom nije kreiran ni menjan. Nazivi koraka mogu varirati po jeziku i verziji Events Manager-a.

1. U Meta Business Suite otvoriti Events Manager za firmu. Izabrati postojeći dataset/pixel ili Connect data → Web, pa napraviti `Mleko i Mleko`. Izabrati ispravan oglasni nalog kao povezani asset i preuzeti numerički Pixel ID.
2. U direktnom režimu postaviti `NEXT_PUBLIC_META_PIXEL_ID` na taj ID i ponovo deploy-ovati sajt. Dodatni copy/paste Pixel snippet nije potreban: postojeći kod već učitava Pixel isključivo posle marketing saglasnosti.
3. Ako je uključen GTM režim, direktni Pixel je isključen. Pixel se tada postavlja u GTM i vezuje za postojeće dataLayer događaje uz marketinške consent checks. Koristiti jedan način instalacije da PageView i AddToCart ne budu duplirani.
4. Browser događaji u ovom projektu: `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `AddPaymentInfo`; aktivirana pretplata mapira se u `Subscribe`. Browser ne šalje `Purchase` na klik dugmeta ili na kreiranje neplaćene porudžbine.
5. Za stvarne plaćene kupovine uključiti Conversions API: token sačuvati kao serverski `META_CONVERSIONS_ACCESS_TOKEN`, a podržanu Meta API verziju kao `META_GRAPH_API_VERSION`. Koristi se isti `NEXT_PUBLIC_META_PIXEL_ID`. Token se nikada ne stavlja u `NEXT_PUBLIC_*`, GTM javni kod ili dokumentaciju. Server šalje `Purchase` uz saglasnost za analitiku i marketing, RSD vrednost, stavke i stabilan `event_id` za ponovljene isporuke.
6. U Events Manager-u proveriti Test Events i Diagnostics. Bez pristanka i uz analytics-only Pixel mora ostati blokiran; nakon marketing pristanka očekuju se dozvoljeni browser događaji. Pri opozivu prestaju dalji događaji. Za proveru CAPI koristiti odobrenu test kupovinu i serverske dijagnostičke rezultate; sam Pixel ID ne aktivira serverski Purchase.
7. Ostaviti Automatic Advanced Matching isključen dok se posebno ne definiše i odobri slanje korisničkih podataka. Ova implementacija ne šalje email, telefon ni adresu kupca kroz CAPI; kvalitet povezivanja oglasa je time ograničen.

Zvanična uputstva: [Google Consent Mode](https://developers.google.com/tag-platform/security/guides/consent), [GA4 konverzije u Google Ads](https://support.google.com/google-ads/answer/2375435), [Meta Pixel dokumentacija](https://developers.facebook.com/docs/meta-pixel/), [Meta video uputstvo](https://www.youtube.com/watch?v=KCiBfay679Q).
