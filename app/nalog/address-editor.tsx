"use client";

import { useLocalize } from "@/app/lib/i18n/client";
import { useState, type FormEvent } from "react";
import { DELIVERY_CITIES } from "../lib/delivery-area";
import { fetchJson } from "../lib/frontend";

type Address = { addressLine1: string; addressLine2?: string; city: string; postalCode: string };

/** Self-service address change; the server checks the delivery zone exactly as in checkout. */
export function AddressEditor({ customer, onSaved, cities: served }: { customer: Address; onSaved: (message: string) => void; cities?: readonly string[] }) {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The cities we deliver to (built-in and added in the admin). A saved city we no longer
  // serve stays listed so the form shows the address as it is; the server rejects saving it.
  const offered = served?.length ? served : DELIVERY_CITIES;
  const cities = customer.city && !offered.includes(customer.city) ? [...offered, customer.city] : [...offered];
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await fetchJson("/api/account", {
        method: "PATCH",
        body: JSON.stringify({
          addressLine1: form.get("addressLine1"),
          addressLine2: form.get("addressLine2"),
          city: form.get("city"),
          postalCode: form.get("postalCode"),
          applyToSubscriptions: form.get("applyToSubscriptions") === "on",
        }),
      });
      setOpen(false);
      onSaved("Adresa je sačuvana. Važi za sledeće dostave koje još nisu zaključane.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Adresa nije sačuvana. Pokušaj ponovo.");
    } finally {
      setBusy(false);
    }
  }
  if (!open)
    return localize((
      <button className="button secondary small" type="button" onClick={() => setOpen(true)}>Promeni adresu</button>
    ));
  return localize((
    <form className="form-stack account-address-form" onSubmit={save}>
      <label className="field"><span>Ulica i broj</span><input name="addressLine1" defaultValue={customer.addressLine1} required autoComplete="address-line1" /></label>
      <label className="field"><span>Sprat i stan</span><input name="addressLine2" defaultValue={customer.addressLine2 ?? ""} autoComplete="address-line2" /></label>
      <div className="form-grid">
        <label className="field"><span>Grad</span>
          <select name="city" defaultValue={cities.find((city) => city === customer.city) ?? cities[0]}>
            {cities.map((city) => <option key={city} value={city}>{city}</option>)}
          </select>
        </label>
        <label className="field"><span>Poštanski broj</span><input name="postalCode" defaultValue={customer.postalCode} required inputMode="numeric" pattern="\d{5}" autoComplete="postal-code" /></label>
      </div>
      <label className="checkbox-row"><input type="checkbox" name="applyToSubscriptions" defaultChecked /> <span>Primeni i na moju pretplatu (sledeće nezaključane dostave)</span></label>
      <p className="small-text account-muted">Proveravamo da li je adresa u zoni dostave. Izmena važi do roka od 36 sati pred dostavu.</p>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      <div className="button-row">
        <button className="button small" disabled={busy}>{busy ? "Čuvamo…" : "Sačuvaj adresu"}</button>
        <button className="text-button" type="button" disabled={busy} onClick={() => setOpen(false)}>Odustani</button>
      </div>
    </form>
  ));
}
