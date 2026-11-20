# Finalna specifikacija sajta — odluke (20. 11. 2026)

Implementirano u commit-u „Final site spec…“ (migracije 0022 i 0023). Vlasnik je potvrdio:

1. Pretplata: samo nedeljni ritam, paket od 4 stvarno realizovane dostave.
2. Jednokratni dodatak litara naplaćuje se po ceni pretplate (250 RSD/l).
3. Ako kupac otkaže obnovu, popust od 350 RSD (nagrada za vernost) ostaje otvoren kredit.
4. Kupac ne može da ukloni proizvod ni da smanji količinu, ni za naredni paket — samo da doda ili otkaže obnovu.
5. Poklon od 2 l automatski ide uz sledeću realizovanu dostavu; kupac ne bira datum.
6. `loyaltyStartDate` (dan migracije) i doplate nemaju posebnu admin kontrolu; doplate se evidentiraju kao porudžbine.

Čeka materijal klijenta: mesto gazdinstava i ime druge domaćice (`app/lib/producers.ts`), fotografije
laboratorijskih izveštaja (`app/lib/analyses.ts`), fotografija osnivača i potvrda izjave (`app/o-nama/page.tsx`),
link ka Google recenzijama (`GOOGLE_REVIEWS_URL` u `app/components/home/hero-slider.tsx`), adrese mlekomata
Beo šoping centar i Lidl Bežanijska kosa (`app/gde-kupiti/page.tsx`).
