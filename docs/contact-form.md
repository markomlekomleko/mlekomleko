# Kontakt forma

Kontakt forma na `/kontakt` šalje poruke preko postojećeg email servisa.

U Vercel → Project → Settings → Environment Variables podesite:

- `CONTACT_EMAIL_TO=info@mlekoimleko.com` — primalac poruka. Adresa nije upisana u kod i može se promeniti ovde.
- `EMAIL_MODE=provider`
- `EMAIL_PROVIDER=resend` ili `infobip`
- `EMAIL_API_KEY` — ključ izabranog servisa.
- `EMAIL_FROM` — verifikovan pošiljalac kod izabranog servisa.
- Za Infobip: `INFOBIP_BASE_URL`.

Izaberite odgovarajuća okruženja (Production / Preview) i pokrenite novi deployment posle promene promenljivih. Lokalno se iste vrednosti čitaju iz `.env.local`.

Email kupca nalazi se u poruci i u linku „Odgovori pošiljaocu“. Forma prikazuje potvrdu tek kada email servis prihvati slanje. Ako konfiguracija nedostaje ili slanje ne uspe, unos ostaje u formi i prikazuje se greška sa brojem telefona.

Endpoint `/api/contact` validira polja, odbija neispravno poreklo i skriveno spam polje i ograničava broj pokušaja slanja na pet po satu po IP adresi. Ne šalje automatski odgovor na email kupca.
