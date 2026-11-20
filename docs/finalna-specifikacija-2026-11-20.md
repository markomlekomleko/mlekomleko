# Finalna specifikacija sajta — odluke (20. 11. 2026)

Implementirano u commit-u „Final site spec…“ (migracije 0022 i 0023). Vlasnik je potvrdio:

1. Pretplata: samo nedeljni ritam, paket od 4 stvarno realizovane dostave.
2. Jednokratni dodatak litara naplaćuje se po ceni pretplate (250 RSD/l).
3. Ako kupac otkaže obnovu, popust od 350 RSD (nagrada za vernost) ostaje otvoren kredit.
4. Kupac ne može da ukloni proizvod ni da smanji količinu, ni za naredni paket — samo da doda ili otkaže obnovu.
5. Poklon od 2 l automatski ide uz sledeću realizovanu dostavu; kupac ne bira datum.
6. `loyaltyStartDate` (dan migracije) i doplate nemaju posebnu admin kontrolu; doplate se evidentiraju kao porudžbine.

Upisano 20. 11.: Glišić — Deliblato; druga domaćica — Slobodanka Dragojević, Mramorak; adrese
Beo šoping centar (Vojislava Ilića 141) i Lidl Bežanijska kosa (Partizanske avijacije bb) sa Google mapa;
link ka recenzijama je Google Maps lista „Mlekomat Mleko i Mleko“ (sve lokacije sa stvarnim recenzijama).

Čeka materijal: fotografije laboratorijskih izveštaja (`app/lib/analyses.ts`) i fotografija osnivača
(`app/o-nama/page.tsx`). Pitanja za klijenta: `docs/klijent/Mleko-i-Mleko-pitanja-za-potvrdu.docx`.

Provera admina i kupovine: `docs/qa-2026-11-20.md`. Pitanja za klijenta su proširena na 14.
