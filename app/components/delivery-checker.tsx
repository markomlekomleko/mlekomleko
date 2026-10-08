"use client";

import { useId, useState, type FormEvent } from "react";
import { fetchJson, formatDate, type DeliveryWindow } from "../lib/frontend";

type CheckerPayload = {
  delivery: DeliveryWindow;
  serviceability?: { postalCode: string; available: boolean };
};

export function DeliveryChecker({ title, note, delivery }: { title: string; note: string; delivery: DeliveryWindow }) {
  const [postalCode, setPostalCode] = useState("");
  const [result, setResult] = useState<{ available: boolean; postalCode: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputId = useId();

  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = await fetchJson<CheckerPayload>(`/api/storefront?postalCode=${encodeURIComponent(postalCode)}`);
      if (payload.serviceability) setResult(payload.serviceability);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Provera trenutno nije dostupna.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="delivery-checker" aria-labelledby="delivery-check-title">
      <div className="delivery-checker-copy">
        <p className="eyebrow">Sledeći termin</p>
        <h2 id="delivery-check-title">{title}</h2>
        <p className="muted">{note}</p>
        <p className="delivery-date"><strong>{formatDate(delivery.deliveryDate)}</strong> · od {delivery.deliveryLocalTime}</p>
      </div>
      <form className="delivery-checker-form" onSubmit={check}>
        {/* The label names the field only: wrapped around the button too, it would read
            the field out as "Poštanski broj Proveri". */}
        <div className="field">
          <label htmlFor={inputId}>Poštanski broj</label>
          <div className="input-action">
            <input id={inputId} value={postalCode} onChange={(event) => setPostalCode(event.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" autoComplete="postal-code" pattern="\d{5}" placeholder="11000" required />
            <button className="button" type="submit" disabled={busy}>{busy ? "Proveravamo…" : "Proveri"}</button>
          </div>
        </div>
        {result ? (
          <p className={`check-result ${result.available ? "success" : "error"}`} role="status">
            {result.available
              ? `Dostavljamo na ${result.postalCode}. Možete da sastavite korpu.`
              : `Poštanski broj ${result.postalCode} trenutno nije u zoni dostave za Beograd i Novi Sad.`}
          </p>
        ) : null}
        {error ? <p className="check-result error" role="alert">{error}</p> : null}
      </form>
    </section>
  );
}
