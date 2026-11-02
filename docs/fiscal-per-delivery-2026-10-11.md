# Fiskalizacija po isporuci — 11. oktobar 2026.

Ovo pravilo zamenjuje fiskalni tok opisan 9. oktobra: završetak paketa više nije trenutak izdavanja jednog zbirnog konačnog računa.

- Potvrđena uplata unapred, uključujući jednokratnu kupovinu i dodatak, pokreće Avans–Prodaja.
- Potvrda stvarno uručene količine atomarno čuva raspodelu kupljenih jedinica i događaj `fiscal.delivery.requested` za svaku izvornu porudžbinu. Neuspešna dostava i nulta količina ne stvaraju događaj.
- Svaka isporuka razdužuje samo svoj deo avansa i dobija Promet–Prodaja. Zatvaranje paketa ostaje operativni uslov za obnovu i ne izdaje dodatni račun.
- Preskakanje i pauza čuvaju preostalu količinu i avans. Primer 10 l nedeljno uz preskakanje treće nedelje daje račune za 10 l u nedeljama 1, 2, 4 i 5.
- Jednokratna gotovinska kupovina u celosti uručena u jednoj dostavi, sa uplatom evidentiranom tek pri/nakon uručenja, dobija jedan običan račun. Za plaćanje evidentirano pre uručenja koristi se avansni tok. Promena statusa porudžbine preko opšteg admin formulara ne može zameniti potvrdu količina u Dostavama.

## Iznosi i idempotentnost

`fiscal_order_snapshots` čuva kupljene količine, neto cene posle popusta/kredita, nazive i poreske oznake. `fiscal_delivery_allocations` čuva nepoklapajuće opsege jedinica svake isporuke. Sve se računa u parama. Naplaćena dostava raspoređuje se po vrednosti kupljenih stavki, pa po njihovim jedinicama; zbir delova je tačno originalna naknada, bez nove naplate za ponovnu posetu.

Jedinstveni događaj i trajni fiskalni dnevnik sprečavaju ponovljeno izdavanje. Kod prekida veze, pogrešnog iznosa ili nepotpunog odgovora ishod je nepoznat i zaustavljaju se dalja izdavanja iste porudžbine do usaglašavanja. Sačuvan uspešan odgovor popravlja lokalne zapise bez novog POST-a.

## Fiscomm ugovor i granice provere

Proverena je aktuelna [OpenAPI specifikacija](https://api.fiscomm.rs/openapi.json). Živi tok koristi `POST /receipt/advance/finalize` sa iznosom konkretne isporuke i dokumentovanom opcijom `skipAdvanceChainDerivation: true`, koja sprečava automatsko preuzimanje iznosa cele avansne grane. `amount` i `advanceAmount` prate primer za finalize iz specifikacije. Odgovor mora sadržati oba dokumenta i oba iznosa moraju odgovarati isporuci. To nije zahtev banci za povraćaj ili novu naplatu.

Trening koristi isključivo `POST /receipt/training/sale`, bez avansnih referenci i finalize opcija. Za uplatu i svaku isporuku generiše zaseban dokument obuke. Ovi dokumenti ne predstavljaju fiskalni promet. Trening ne potvrđuje rad stvarnog avansnog lanca; taj lanac je proveren automatizovanim testovima sa simuliranim odgovorima. Za njegovu spoljašnju proveru potreban je Fiscomm demo nalog sa test sertifikatom ili posebno odobren stvarni postupak. Poslovni trenutak fiskalizacije pri otpremi/uručenju i poreski tretman treba potvrditi sa knjigovođom pre aktivacije stvarnog rada.

## Stvarni API test

Dana 11. oktobra API je uspešno izdao i zatim kroz arhivu potvrdio trening dokument:

- Broj: `KRQ7ENKH-C38FDVO0-397`.
- Stavka: `TEST — Kozje mleko 1 l`, količina 2, test cena 320 RSD/l, ukupno 640 RSD.
- Arhivirani tip: `training`; nema stvarne naplate niti stvarnog fiskalnog prometa.
- [PDF test dokumenta](https://api.fiscomm.rs/receipt/e5f70ef61ec4a0261a6ff5cc05883a4d00d9f3ac283c38fd74d3b569add52f8d496648feb9a607456c9dd2f27c0ad357).
- Skripta: `node --env-file=.env.local scripts/fiscomm-training-check.mjs`. Zahteva eksplicitni training i čuva dnevnik u `.data/fiscomm-training-check/`. Ponovno pokretanje čita postojeći dokument umesto novog izdavanja. Nema slanja emaila ili podataka stvarnog kupca.

## Migracija

Nova migracija `0021_fiscal_deliveries.sql` postoji za SQLite i PostgreSQL. Ne pretvara stare račune niti retroaktivno fiskalizuje stare isporuke. Porudžbine sa starim dokumentima bez novog snimka i stari događaji `fiscal.final.requested` zahtevaju usaglašavanje. Ne menjati režim postojećoj test porudžbini: trening, mock i stvarni dokumenti su odvojeni.

Promena nije objavljena na hosting i udaljena PostgreSQL baza nije menjana. Migracija mora biti primenjena pre objave novog koda.

## Završna provera

- 372 automatizovana testa prolaze, bez preskočenih ili neuspelih testova; pokriveni su sva tri tražena primera, mešovita korpa, pauze, delimične isporuke, konkurentne potvrde, ponavljanje, pogrešan iznos odgovora i nepoznat ishod.
- TypeScript, ESLint i Next.js produkciono kompajliranje prolaze.
- Lokalna SQLite baza je migrirana nakon proverene rezervne kopije. `integrity_check` je `ok`, a provera stranih ključeva nema grešaka. Udaljena PostgreSQL migracija nije izvršena.
- Ponovno pokretanje spoljašnjeg API testa vratilo je isti arhivirani trening dokument, bez novog POST-a za izdavanje.
