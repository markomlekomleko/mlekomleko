"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocale, useLocalize } from "../lib/i18n/client";
import { fetchJson } from "../lib/frontend";
import styles from "./support-chat.module.css";

export function SupportChatContact({ onBack }: { onBack: () => void }) {
  const localize = useLocalize();
  const locale = useLocale();
  const heading = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);
  const submission = useRef<{ fields: string; id: string } | null>(null);
  const [status, setStatus] = useState<"ready" | "saving" | "saved">("ready");
  const [error, setError] = useState("");

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();
    const digits = phone.replace(/\D/g, "").length;
    if (!name || digits < 6 || digits > 15 || !/^\+?\d[\d\s()/-]*$/.test(phone)) {
      setError(!name ? "Unesi svoje ime." : "Unesi ispravan broj telefona.");
      return;
    }

    const fields = JSON.stringify({ name, email, phone });
    if (submission.current?.fields !== fields) {
      submission.current = { fields, id: crypto.randomUUID() };
    }
    inFlight.current = true;
    setError("");
    setStatus("saving");
    try {
      const result = await fetchJson<{ saved?: boolean }>("/api/leads", {
        method: "POST",
        body: JSON.stringify({
          kind: "chat_support", name, phone, email, locale,
          website: String(data.get("website") ?? ""),
          submissionId: submission.current.id,
        }),
      });
      if (!result.saved) throw new Error("Chat contact was not saved");
      setStatus("saved");
    } catch {
      setError("Kontakt nije sačuvan. Pokušaj ponovo.");
      setStatus("ready");
    } finally {
      inFlight.current = false;
    }
  }

  return localize((
    <div className={styles.contactView}>
      <button className={styles.back} type="button" onClick={onBack}>Nazad</button>
      <h3 ref={heading} tabIndex={-1}>Ostavi kontakt</h3>
      {status === "saved" ? (
        <p role="status">Hvala! Sačuvali smo tvoj kontakt. Javićemo ti se.</p>
      ) : (
        <>
          <p>Ostavi ime, telefon i email da možemo da ti se javimo. Tekst razgovora se ne šalje uz prijavu.</p>
          <form className={styles.contactForm} onSubmit={submit} aria-busy={status === "saving"}>
            <label><span>Ime</span><input name="name" autoComplete="given-name" maxLength={100} required /></label>
            <label><span>Telefon</span><input name="phone" type="tel" autoComplete="tel" maxLength={40} required /></label>
            <label><span>Email</span><input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
            <div className="contact-trap" aria-hidden="true" data-no-translate>
              <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
            </div>
            {error ? <p className={styles.formError} role="alert">{error}</p> : null}
            <button type="submit" disabled={status === "saving"}>{status === "saving" ? "Šaljemo…" : "Pošalji kontakt"}</button>
          </form>
          <Link prefetch={false} href="/privatnost">Privatnost i kolačići</Link>
        </>
      )}
    </div>
  ));
}
