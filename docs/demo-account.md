# Javni demo nalog

Na `/prijava` i u neprijavljenom prikazu `/nalog` dugme „Isprobaj demo nalog“
otvara nalog jednim klikom, bez emaila, lozinke ili spoljnog provajdera.
`POST /api/auth/demo` koristi proveru porekla, ograničenje 20 prijava po IP adresi
u 15 minuta i postojeću serversku sesiju. Svaki pregledač dobija zasebnu nasumičnu
sesiju od 8 sati; u bazi se čuva samo hash. Odjava opoziva samo tu sesiju.

Rezervisan korisnik `mm-public-demo-customer`, sa emailom `demo@example.invalid`,
čuva se u tabeli kupaca. Primeri pretplate, naplate i dostava generišu se samo za
prikaz; ne nastaju poslovne porudžbine, dostave, naplate, fiskalni računi ili poruke.
Datumi se računaju prema vremenu u Beogradu. Demo koristi izmišljene podatke i cene.

Server odbija izmene profila, pretplata, porudžbina, povraćaje i povezivanje broja
iz demo sesije sa `DEMO_READ_ONLY` (403). Checkout odbija demo sesiju i rezervisan
demo email. Korisnik se odjavljuje pre prijave na svoj nalog i pravog poručivanja.
Demo ne daje pristup administraciji niti podacima drugih kupaca.

Demo je uključen podrazumevano. Serverski `DEMO_LOGIN_ENABLED=false`, uz redeploy,
sakriva dugme, odbija nove prijave i poništava pristup postojećim demo sesijama.
Redovna prijava i dalje zahteva podešen email/WhatsApp provajder.
