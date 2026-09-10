# Nalozi, kupovina i administracija

Kupac prvo potvrđuje porudžbinu. Zatim na `/prijava` unosi isti email i dobija
jednokratni link za `/nalog`. Nalog prikazuje porudžbine, podatke za dostavu,
pretplate i izmene. Sesija se čuva u HttpOnly kolačiću; odjava je opoziva na serveru.

Posle dodavanja proizvoda ili paketa, dugme **Nastavi na kupovinu** otvara `/korpa`
sa sačuvanim količinama i ritmom. Na mobilnom proizvodu isto dugme je dostupno u
donjoj traci. Korpa vodi na podatke za dostavu i potvrdu gotovinske porudžbine.

## Automatske provere

- `npm test`: obračun, mešovita dostava, prijava/odjava, paralelne izmene pretplate,
  dodaci, preskakanje, pauza, nastavak, otkazivanje, krediti, admin izmene, limit
  promo koda, renderovanje i ugovori integracija.
- `npm run test:vercel`: produkcioni Next build, stvarne HTTP rute i izolovana baza.
- `npm run test:postgres`: iste provere sa privremenom PostgreSQL šemom, koja se
  briše po završetku. Ne koristi poslovne porudžbine.
- `npx playwright test tests/e2e/production-readiness.spec.ts tests/e2e/account-admin-flows.spec.ts`:
  klikovi kroz kupovinu, prijavu i nalog, trajne izmene pretplate, sve admin kartice,
  dodavanje/izmena/objava/brisanje proizvoda, promo kod i sadržaj sajta,
  mobilno dugme za nastavak i odsustvo razvojnih oznaka. Rezolucije: 390, 768 i 1440 px.

Browser testovi koriste zasebnu SQLite bazu i `.next-e2e`, pa mogu da rade pored
lokalnog razvojnog servera. Spoljni servisi se u testovima ne pozivaju. Resend
transport je dodatno proveren zamenom HTTP odgovora i potvrdom dobijenog login linka.

## Preostalo za spoljne live integracije

Resend je izabran, ali domen još nije verifikovan (potvrđeno 10. 9. 2026).
Nakon verifikacije u serverskom okruženju podesiti `EMAIL_MODE=provider`,
`EMAIL_PROVIDER=resend`, `EMAIL_API_KEY` i `EMAIL_FROM` na verifikovanom domenu.
`APP_ORIGIN` i `NEXT_PUBLIC_SITE_URL` treba da sadrže stvarni HTTPS domen prodavnice.
Potom potvrditi dostavu prijavnog emaila u pravom sandučetu i iskoristiti link.
Ključevi se ne unose kroz browser niti u Git.

Bankarski adapter i Badi produkcioni pristup nisu povezani u ovom okruženju.
Checkout zato nudi gotovinu. Produkcija odbija simuliranu naplatu i ne označava
console email ili mock fiskalizaciju kao uspešno poslate/izdate.
Nepovezani program preporuka i podsetnik za napuštenu korpu uklonjeni su iz
korisničkog interfejsa.

Migracije `0009_live_storefront.sql` i `0010_promo_usage_limit.sql` uklanjaju
razvojne oznake iz kataloga i obezbeđuju transakcioni limit promo koda.
Istorijske putanje slika ostaju dostupne radi kompatibilnosti; katalog koristi
`/images/catalog/`.

## Rezultat provere (10. 9. 2026)

Prošlo je 55 serverskih/ugovornih provera, 22 browser scenarija (dva dodatna
mobilna scenarija se preskaču na većim ekranima), 10 provera produkcionog
Next servera sa SQLite i svih 15 PostgreSQL/runtime provera. TypeScript, lint i
produkcioni build prolaze. Obe migracije su primenjene na povezanu PostgreSQL bazu.
Stvarno slanje emaila i naplata kartice nisu izvršeni.


## Admin prijava i izvoz

Vercel koristi serverske `ADMIN_USERNAME` / `ADMIN_PASSWORD` (12+ znakova),
uz tačan `APP_ORIGIN` i migraciju 0011. Posle upisa varijabli potreban je redeploy.
Lozinka se ne čuva u browser storage; sesija je samo u memoriji stranice (8 sati),
pa osvežavanje ili novo otvaranje traži novu prijavu. Odjava opoziva sesiju u bazi.
Resend nije potreban za ovu admin prijavu.

- Dostave → izabrati datum → generisati listu → CSV za Spoke ili Excel + priprema.
- Porudžbine → uz željenu porudžbinu Potvrda Excel ili Potvrda CSV.
- Excel potvrda ima listove Potvrda i Stavke. Izvozi sadrže cene i ukupne iznose
  sačuvane na porudžbini, status i trenutne kontakt podatke kupca. Fiskalni račun je
  zaseban dokument Badi integracije.

Provera ovog toka: testovi produkcionog Next servera pokrivaju pogrešne kredencijale,
istek/opoziv/rotaciju sesije i ograničenje pokušaja. Isti tokovi provereni su nad
izolovanom PostgreSQL šemom, uključujući zabranu javnog pristupa admin_sessions.
Playwright na 390/768/1440 px preuzima sva četiri formata kroz UI, proverava novu
prijavu posle refresh-a i odjavu. Preuzeti ZIP/XML i CSV fajlovi provereni su za
čitljivost, nazive listova, jedinstvene kolone, telefone, dijakritike i iznose.
Javni deploy i stvarni Spoke import nisu deo ove lokalne provere.
