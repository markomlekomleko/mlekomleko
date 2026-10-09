# Integracija dizajna i izbora dostave — 9. oktobar 2026.

Dizajn sa `origin/redesign-jm` (ea79bea) spojen je sa novijim lokalnim funkcionalnostima. Pre spajanja sačuvan je commit `eb50296`, pa su novija prijava kodom, kontakt forma, korisnički nalog, unapred plaćeni paketi i administracija zadržani.

## Izgled

Primena dizajnerove teal/navy palete, Archivo/Fraunces/Geist tipografije, ravnih površina i jasnih okvira na prodavnicu, proizvod, korpu, checkout, javne sadržajne strane i korisnički nalog. Dekorativne fotografije van hero sekcije zamenjene su ilustracijama izvedenim iz dizajnerovih znakova; fotografije proizvoda imaju zajednički okvir i ostaju vidljive bez odsecanja flaše. Postojeći hero video, tekst i scroll kontroler ostaju sačuvani.

Mobilni meni, korpa, analitička saglasnost, kontakt forma, forma računa za firmu i izbor vremena dostave ostaju funkcionalni. Saglasnost uz porudžbinu premeštena je pored dugmeta za potvrdu. Novi nalog koristi isti vizuelni sistem, uz očuvane promene količina, pauze, istoriju i reklamacije.

## Dostava

Izvor za raspored: prodavnica https://take.app/mlekoimleko, povezana sa zvaničnog https://mlekoimleko.rs, provereno 9. oktobra 2026. Beograd: utorak i petak. Novi Sad: samo petak.

Checkout prikazuje dan dostave i kalendar početka nakon unosa grada i poštanskog broja. `GET /api/delivery-options` vraća raspoložive datume za sledećih 180 dana i isključuje praznike, prošle rokove i zaključene rute. Promena grada poništava prethodni izbor i obračun. Potvrda je onemogućena dok obračun ne odgovara trenutnoj adresi, korpi i datumu.

Izabrani datum se šalje i u obračun i u kreiranje porudžbine, čuva kao početak paketa i kao polazni datum nedeljnog/dvonedeljnog ritma. Pregled prikazuje sve datume, a potvrda datum prve dostave. Server odbija dostavu utorkom za Novi Sad i direktnim API pozivom. Provera dostave po poštanskom broju koristi isti raspored.

## Provera

Automatske provere obuhvataju server, produkcioni Next.js HTTP runtime, izdvojenu PostgreSQL test šemu, kao i postojeće Playwright tokove na 390, 768 i 1440 px. Posebni testovi pokrivaju oba grada, alias nazive gradova, promenu adrese, kalendar, budući datum, oba ritma, praznike, rokove i nedozvoljene datume.

Ručna provera u Chrome-u: dvonedeljni paket u Beogradu sa početkom 13. novembra, potvrda istog datuma u bazi i na ekranu; jednokratna porudžbina u Novom Sadu uz jedinu ponuđenu opciju petka. Testne porudžbine kreirane su isključivo u izdvojenoj lokalnoj SQLite bazi.

Pre migracije produkcije sačuvana je konzistentna, proverena JSON rezervna kopija 33 tabele (301 red) u ignorisanom `.data/backups/` direktorijumu, uz prava pristupa 0600. Migracije 0016–0019 potrebne su zbog ranijih lokalnih funkcionalnosti; sam kalendar ne zahteva promenu šeme.

Potvrđeno: 340 serverskih testova, 15 produkcionih HTTP testova (jedan PostgreSQL scenario je izdvojeno pokriven) i 20 PostgreSQL integracionih testova prolaze. ESLint je bez grešaka. Produkcione migracije 0016–0019 primenjene su transakciono; nakon migracije sačuvani su postojeći 1 kupac, 2 porudžbine i 2 pretplate.

Playwright: svih 111 primenljivih scenarija prošlo je kroz punu seriju i ciljane ponovne provere; 15 scenarija preskače se po postojećim uslovima (npr. neaktivan loop hero). Poslednja zajednička serija checkout-a i administracije: 9/9, na sva tri viewporta. `npm run build`, `npm run typecheck` i `npm run lint` prolaze.
