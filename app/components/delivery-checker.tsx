"use client";

import { useState, type FormEvent } from "react";
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
      <div>
        <p className="eyebrow">Sledeći termin</p>
        <h2 id="delivery-check-title">{title}</h2>
        <p className="muted">{note}</p>
        <p className="delivery-date"><strong>{formatDate(delivery.deliveryDate)}</strong> · od {delivery.deliveryLocalTime}</p>
      </div>
      <form onSubmit={check}>
        <label className="field">
          <span>Poštanski broj</span>
          <div className="input-action">
            <input value={postalCode} onChange={(event) => setPostalCode(event.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" pattern="\d{5}" placeholder="11000" required />
            <button className="button" type="submit" disabled={busy}>{busy ? "Proveravamo…" : "Proveri"}</button>
          </div>
        </label>
        {result ? (
          <p className={`check-result ${result.available ? "success" : "error"}`} role="status">
            {result.available
              ? `Dostavljamo na ${result.postalCode}. Možete da sastavite korpu.`
              : `Zona ${result.postalCode} još nije na demo ruti. Javite nam da vas dodamo na listu.`}
          </p>
        ) : null}
        {error ? <p className="check-result error" role="alert">{error}</p> : null}
      </form>
    </section>
  );
}
