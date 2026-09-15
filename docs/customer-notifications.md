# Promene naloga i obaveštenja

## Povezani tokovi

- Kreiranje jednokratne porudžbine → potvrda mejlom, WhatsApp za postojeći nalog sa potvrđenim brojem i uključenim obaveštenjima.
- Kreiranje pretplate i prihvatanje ponude posle jednokratne kupovine → potvrda aktivacije.
- Dodavanje/uklanjanje proizvoda, količina/ritam, dodatak za jednu dostavu, preskakanje, pauza, nastavak i otkazivanje → poseban događaj i opis promene sa linkom `/nalog`.
- Administratorska izmena porudžbine → obaveštenje kupcu; evidentirana uplata i mesečni obračun imaju svoje poruke.
- Otvorena administracija proverava podatke svakih 15 sekundi i pri povratku na prozor. Osvežavanje se odlaže dok administrator popunjava formu ili čuva izmene. Lista pretplata prikazuje proizvode/količine/ritam, pauzu i preskočene datume.
- Otvorene liste pripreme ažuriraju se posle izmene pretplate. Zaključane dostave ostaju nepromenljive.

## Dostave i podsetnici

Podrazumevani dani dostave su utorak i petak. Nedeljna ili dvonedeljna pretplata zadržava dan i ritam svoje prve dostave; dostupnost dva dana ne znači dve automatske dostave nedeljno. Obračun uključuje oba dana, filtrirana prema ritmu kupca.

`/api/jobs/scheduled` se poziva jednom dnevno u 08:00 UTC, u skladu sa Hobby planom. To je 09:00 zimi / 10:00 leti u Beogradu; Hobby može kasniti do 59 minuta. Ponedeljkom/četvrtkom priprema i šalje podsetnike za sutra. Oba kanala obrađuju se u istom pozivu. Ponovljeni pozivi koriste isti ključ prema izvornoj porudžbini/pretplati i datumu. Provera ne zavisi od privremenog ID-a liste dostave, koji se menja pri regenerisanju.

Primer: „Poštovani, vaša sledeća isporuka je sutra, u utorak (15. septembar 2026).” Sadržaj uključuje stavke i link do naloga. Odložena poruka se ne šalje ako više nije dan pre dostave ili je dostava u međuvremenu uklonjena.

WhatsApp ima odvojen red od mejla: neuspeh jednog kanala ne blokira drugi. Saglasnost za WhatsApp se proverava i pri zakazivanju i neposredno pre slanja. Neuspešni događaji se ponavljaju, a posle pet pokušaja vide se u administraciji za ručnu proveru.

## Produkciono uključenje

Ovo je pripremljeno u kodu; lokalni testovi ne dokazuju prijem u stvarnom inboxu.

1. Na hostingu podesiti `APP_ORIGIN` na javni HTTPS domen, `CRON_SECRET`, `EMAIL_MODE=provider`, `EMAIL_PROVIDER`, `EMAIL_API_KEY` i `EMAIL_FROM`. Za Infobip je potreban i `INFOBIP_BASE_URL`.
2. Za WhatsApp podesiti provider, ključ, sender, jezik i odobrene šablone iz `.env.example`.
3. `WHATSAPP_UPDATE_TEMPLATE` mora biti odobren servisni šablon sa **jednim** parametrom u telu i **statičkim** URL dugmetom koje otvara `https://JAVNI_DOMEN/nalog`:

   > Poštovani, {{1}} Detalje možete pregledati na svom nalogu.

   Parametar sadrži konkretnu promenu, npr. „Vaša sledeća isporuka je preskočena. Preskočena isporuka: 15. septembar 2026. Sledeća dostava: 22. septembar 2026.” Naziv dugmeta: „Upravljaj dostavama”. Stari šablon bez parametara nije kompatibilan: napraviti i odobriti novi naziv, pa ga upisati u promenljivu okruženja. Autentikacioni šablon ostaje odvojen.
4. Deploy uključuje dnevni raspored iz `vercel.json`. Izmene kupca šalju se odmah kroz API; automatski ponovni pokušaji neuspelih poruka izvršavaju se dnevno. Za češće retry-e potreban je Pro ili spoljni scheduler sa istom Bearer autentikacijom. Lokalni `next dev` ne izvršava cron sam.
5. Posle podešavanja proveriti stvarni prijem na namenskoj test adresi i broju, uz saglasnost vlasnika. Status „sent” ovde znači da je servis prihvatio zahtev; ne znači potvrđen prijem/čitanje poruke.

Izvori: [Infobip šabloni i parametri](https://www.infobip.com/docs/tutorials/send-whatsapp-template-messages), [Vercel cron konfiguracija i tajna](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

## Automatizovana provera

`tests/connected-delivery-flows.test.mjs` izvršava stvarne API tokove nad zasebnom SQLite bazom u memoriji i simuliše spoljne servise. Pokriva sve akcije pretplate, obe vrste kupovine, admin prikaz/pripremu, oba dana podsetnika, izbegavanje duplikata, povlačenje saglasnosti i ponavljanje posle greške.
