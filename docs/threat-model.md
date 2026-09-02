# Threat model

Opseg: lokalni MVP sa korisničkim magic linkom, adminom, porudžbinama, pretplatama,
kartičnim tokenima, Badi fiskalizacijom, email outbox-om, Spoke CSV-om i analitikom.
Produkcioni deployment nije odobren ovim dokumentom.

## Podaci i trust boundaries

Najosetljiviji podaci su adresa isporuke, telefon, email, napomene, istorija kupovine,
magic-link tokeni, bankarski token/reference, Badi/payment tajne i admin akcije. PAN i
CVV nisu dozvoljeni u sistemu.

Trust boundaries:

- browser -> javni API;
- browser -> admin API;
- worker -> payment/Badi/email/WhatsApp provajder;
- payment/Badi -> webhook/callback;
- baza -> Spoke CSV fajl;
- consent layer -> analytics/marketing vendor.

## Prioritetne pretnje i kontrole

| Pretnja | Uticaj | Obavezna kontrola |
| --- | --- | --- |
| ukraden/replay magic link | preuzimanje naloga | 128+ bit token, samo hash u DB, 15 min TTL, one-time consume, rate limit, generičan odgovor |
| IDOR na delivery/subscription ID | tuđa adresa i izmene | svaki query vezati za authenticated customer ID; admin zaseban policy |
| CSRF write akcija | neželjena izmena/otkazivanje | SameSite HttpOnly Secure session, Origin provera i CSRF token gde je potrebno |
| brute-force login/checkout | abuse i trošak | per-IP + per-identity rate limit, progressive delay, audit bez otkrivanja naloga |
| race oko cutoff-a | izmena zaključane robe | server-side transakcija, vreme + verzija zapisa, unique constraints |
| dupli webhook/retry | dupla naplata/račun/email | verifikovan potpis, event unique key, idempotency key i inbox/outbox tabela |
| lažan payment callback | besplatna porudžbina | ne verovati browser redirectu; potvrda samo kroz verifikovan webhook/provider lookup |
| SSRF preko endpoint env-a | pristup internoj mreži | HTTPS i allowlist za remote; Badi local samo loopback; bez korisničkog URL-a |
| tajna u klijentu/logu | kompromitacija provajdera | bez tajni u `NEXT_PUBLIC_*`; redaction; ne logovati headers/tokene/raw payload |
| CSV formula injection | izvršavanje pri otvaranju | prefiks `'` za `= + - @` i leading whitespace varijante; quoted UTF-8 export |
| stored XSS iz proizvoda/napomene | krađa sesije/admina | plain text po defaultu, output escaping, sanitizovan rich text, CSP |
| admin privilege escalation | potpuna kontrola | server-side role/allowlist, deny by default, re-auth za opasne akcije, audit |
| PII u GA4/Meta | compliance/privacy incident | consent default denied, allowlisted event schema, recursive PII scrubber |
| production poziv iz lokala | stvarna naplata/račun | mock default + provider mode + `ALLOW_PRODUCTION_INTEGRATIONS` dual latch |
| Badi local izložen mreži | neautorizovana fiskalizacija | bind samo 127.0.0.1, firewall, bez tunela/proxy-ja |

## Autorizacija

Korisnik može čitati/menjati samo svoje resurse. Ne prihvatati `customerId` iz body-ja
kao autoritet; identity dolazi iz server-side session-a. Admin endpoint mora prvo
proveriti aktivnu admin ulogu pa tek onda učitati resurs. Export endpoint je admin-only,
ima kratak response cache policy (`no-store`) i auditira datum/operatera.

Magic link `returnTo` je isključivo allowlisted relative path. Link se invalidira i pri
uspešnom korišćenju i pri promeni email-a. Logovi ne smeju sadržati query string jer u
njemu može biti token.

## Integritet transakcija

- Nikad ne obeležiti karticu plaćenom na osnovu browser redirecta.
- Status se kreće samo kroz dozvoljene tranzicije; kasni webhook ne vraća terminalno
  stanje unazad.
- Webhook koristi raw body i provider-specifičnu verifikaciju, pa tek onda JSON parse.
- Timestamp/replay prozor i unique provider event ID su obavezni.
- Money i totals se ponovo računaju iz server-side kataloga/snapshot-a; browser cena
  se ignoriše.
- Kupon, kredit i refund su ledger stavke, ne overwrite ukupnog iznosa.
- Fiskalizacija koristi snapshot i jedan idempotency key po pravnom dokumentu.

## Privatnost i retention

Prikupiti samo podatke potrebne za isporuku, račun i podršku. Definisati retention sa
knjigovođom i pravnikom za porudžbine/fiskalne dokumente; kraći retention za session,
magic link, neuspele login pokušaje, raw webhook i tehničke logove.

Predlog za tehničke podatke dok politika nije formalno odobrena:

- magic-link zapis: obrisati/anonimizovati 24 h nakon isteka;
- session: 30 dana ili raniji logout;
- raw webhook: ne čuvati po defaultu; ako je potrebno, encrypt + 30 dana;
- aplikacioni logovi: 30 dana, bez PII/tajni;
- CSV: generisati na zahtev, `no-store`, ne čuvati na javnom disku;
- marketing attribution: anonimizovati po isteku consent/session politike.

Kupac mora imati jasan privacy/cookie tekst i način za povlačenje marketing consent-a.
Povlačenje blokira buduće tagove; istorijska zakonska evidencija ostaje prema politici.

## Operativna bezbednost

Tajne se ne commituju. Različite tajne za session, magic link, payment webhook i svaki
provider. Rotacija ima overlap prozor samo ako provider podržava dve aktivne tajne.
Backup restore testirati, a export/backup fajlove enkriptovati.

Admin destructive akcije (`cancel`, ručni refund, override cutoff-a, ponovna
fiskalizacija) traže razlog i proizvode immutable audit: actor, vreme, stara/nova
vrednost, request ID i povezani eksterni ID.

## Pre-production security gate

- threat-model walk-through i role matrix odobreni;
- magic-link, IDOR, CSRF, rate-limit i cutoff race testovi prolaze;
- payment/Badi provider test matrica prolazi u sandboxu;
- CSP, HSTS, secure cookies, headers i TLS provereni;
- secret scan i dependency audit bez kritičnih nalaza;
- restore, reconciliation i incident runbook probani;
- privacy/retention/cookie tekst odobren;
- knjigovođa potvrdio fiskalni tok i kredit/refund politiku;
- nema PAN/CVV u bazi, telemetry-ju, logu ili error reportingu.
