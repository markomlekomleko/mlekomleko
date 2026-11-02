# Produkciona objava — 2. novembar 2026.

Luka je izričito zatražio produkcionu objavu nove verzije i uputstvo za grupno označavanje stavki.

- Ciljni postojeći projekat: `marko-4880/mlekomleko-wyku`, adresa `https://mlekomleko-wyku.vercel.app`.
- Objava koristi postojeću GitHub → Vercel vezu repozitorijuma `markomlekomleko/mlekomleko`, grana `main`.
- Prethodni commit: `56848596f1177967081e1630ad6d906b55d59d1f`; prethodna potvrđena objava: `https://vercel.com/marko-4880/mlekomleko-wyku/2MEpXV5GbGmr51cFmi6EH4tWJCzZ`.
- Pre migracije napravljen je konzistentan AES-256-GCM backup. Stvarna proba vraćanja svih 47 tabela proverila je sadržajne hash-eve i strane ključeve u izolovanoj transakciji, koja je zatim poništena. Enkriptovana kopija, ključ i manifest čuvaju se lokalno u ignorisanom `.data/backups/`, sa dozvolama 0600. Ključ nije objavljen.
- Na produkcionoj bazi transakciono je primenjena isključivo nova migracija `0021_fiscal_deliveries.sql`. Postojeći podaci nisu brisani. Registrovana test grupa ostaje dostupna za obuku i ima postojeće zaštite od spoljne naplate i slanja.
- Postojeći režimi emaila, fiskalizacije i banke se ne menjaju ovom objavom. Nije zatraženo novo izdavanje fiskalnog dokumenta niti slanje poruke kupcima.
- Raw materijali, snimci, lokalni izveštaji, rezultati browser provera i PDF izlazi isključeni su iz Vercel upload-a. U Git se šalju izvori, migracije, testovi i dokumentacija.

Ovaj zapis prati pokretanje objave. Završni status se proverava preko GitHub/Vercel statusa i postojećeg javnog sajta nakon build-a. Prebacivanje domena `mlekoimleko.rs`, povezivanje email servisa i bankarska aktivacija ostaju zasebni koraci.

## Markovo grupno označavanje

**Uplate:** Porudžbine → pretraga/filter → „Označi sve na ovoj stranici“ → izuzeti nenaplaćene → „Potvrdi primljenu gotovinu“ → proveriti broj i zbir → potvrditi stvarni prijem novca → sačuvati. Izbor obuhvata do 100 gotovinskih porudžbina koje čekaju naplatu.

**Isporuke:** Dostave → izabrati datum → završiti pripremu ako spisak još nije zaključan → Razvoz → „Označi sve za potvrdu (do 100)“ → izuzeti neuspele i delimične → „Potvrdi izabrane isporuke“. Za prvi gotovinski paket potvrditi stvarni prijem celog iznosa. Delimično i neuspelo uručenje obrađuju se pojedinačno. Budući datum ne može da se potvrdi kao izvršen.

Ako se nove kontrole ne vide, osvežiti admin i ponovo se prijaviti. Za naplatu je potrebna uloga vlasnika ili menadžera; vozač potvrđuje uručenje već plaćenog paketa.
