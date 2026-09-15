"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { DELIVERY_CITIES, deliveryAddressError } from "../lib/delivery-area";
import { useCart } from "../components/cart-provider";
import { getConsentPreferences, useAnalytics } from "../components/analytics-provider";
import { getAttributionSnapshot } from "../lib/attribution";
import {
  cadenceLabel,
  fetchJson,
  formatMoney,
  formatDate,
  type CartQuote,
} from "../lib/frontend";

type CheckoutResult = {
  id?: string;
  orderId?: string;
  order?: { id?: string; orderNumber?: string };
  subscriptionIds?: string[];
  message?: string;
  subscription?: { id?: string } | null;
  subscriptionOffer?: { token: string; eligibleItemCount: number; savingPerDeliveryMinor: number; expiresAt: string } | null;
};

export function CheckoutForm() {
  const { items, ready, promoCode, clearCart } = useCart();
  const { track } = useAnalytics();
  const paymentMethod = "cash";
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [quotedAddress, setQuotedAddress] = useState("");
  const addressError = city && postalCode.length === 5 ? deliveryAddressError(city, postalCode) : null;
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [conversionBusy, setConversionBusy] = useState(false);
  const [conversionDone, setConversionDone] = useState(false);
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const idempotencyKey = useRef<string | null>(null);
  const addressVerified = Boolean(city && postalCode.length === 5 && !addressError
    && quote?.serviceable === true && quotedAddress === `${city}|${postalCode}`);

  async function convertToSubscription(token: string) {
    setConversionBusy(true);
    setError("");
    try {
      await fetchJson("/api/orders/convert-to-subscription", { method: "POST", body: JSON.stringify({ token, cadence: "weekly" }) });
      setConversionDone(true);
      track("subscription_converted", { cadence: "weekly", source: "order_confirmation" });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Redovna dostava nije uključena.");
    } finally {
      setConversionBusy(false);
    }
  }

  useEffect(() => {
    if (!ready || items.length === 0) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setQuoteError("");
      void fetchJson<CartQuote>("/api/cart", {
        method: "POST",
        body: JSON.stringify({
          items: items.map((item) => ({ productId: item.productId, quantity: item.quantity, purchaseType: item.purchaseType, cadence: item.cadence })),
          promoCode: promoCode || undefined,
          city: city || undefined,
          postalCode: postalCode.length === 5 ? postalCode : undefined,
        }),
      }).then((value) => { if (active) { setQuote(value); setQuotedAddress(`${city}|${postalCode}`); } }).catch((requestError) => {
        if (active) {
          setQuote(null);
          setQuoteError(requestError instanceof Error ? requestError.message : "Obračun trenutno nije dostupan.");
        }
      });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [items, city, postalCode, promoCode, ready]);

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!addressVerified) {
      setError(addressError ?? "Izaberite Beograd ili Novi Sad i unesite važeći poštanski broj. Sačekajte proveru dostave.");
      return;
    }
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const attribution = getAttributionSnapshot();
    const consent = getConsentPreferences();
    idempotencyKey.current ??= window.crypto.randomUUID();

    try {
      const payload = await fetchJson<CheckoutResult>("/api/checkout", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey.current },
        body: JSON.stringify({
          customer: {
            fullName: form.get("fullName"),
            email: form.get("email"),
            phone: form.get("phone"),
            addressLine1: form.get("street"),
            addressLine2: form.get("addressLine2"),
            city: form.get("city"),
            postalCode: form.get("postalCode"),
          },
          note: form.get("note"),
          paymentMethod,
          promoCode: promoCode || undefined,
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            purchaseType: item.purchaseType,
            cadence: item.cadence,
          })),
          attribution,
          analyticsConsent: consent.analytics,
        }),
      });
      setResult(payload);
      const orderId = payload.order?.id ?? payload.orderId ?? payload.id;
      track("order_created", { paymentMethod }, orderId);
      clearCart();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Porudžbina nije sačuvana. Pokušajte ponovo.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return (
      <div className="page-shell">
        <p className="loading-state" role="status">
          Pripremamo plaćanje…
        </p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="page-shell narrow">
        <div className="notice success" role="status">
          <p className="eyebrow">Porudžbina je primljena</p>
          <h1>Hvala na porudžbini.</h1>
          <p>
            Porudžbina je sačuvana. Status i redovnu dostavu možete pratiti iz svog naloga.
            {result.order?.orderNumber || result.orderId || result.order?.id || result.id ? (
              <> Broj porudžbine: <strong>{result.order?.orderNumber ?? result.orderId ?? result.order?.id ?? result.id}</strong>.</>
            ) : null}
          </p>
          {result.subscriptionOffer ? <section className="post-purchase-offer" aria-labelledby="post-purchase-title"><p className="eyebrow">Jedan klik do mirnog frižidera</p><h2 id="post-purchase-title">Neka ista porudžbina stiže svake nedelje.</h2><p>Uključujemo {result.subscriptionOffer.eligibleItemCount} {result.subscriptionOffer.eligibleItemCount === 1 ? "proizvod" : "proizvoda"} u nedeljni ritam. Prva redovna dostava je sledeće nedelje, a sada nema nove naplate.{result.subscriptionOffer.savingPerDeliveryMinor > 0 ? <> Štedite <strong>{formatMoney(result.subscriptionOffer.savingPerDeliveryMinor / 100)}</strong> po dostavi.</> : null}</p>{conversionDone ? <p className="notice success">Redovna dostava je uključena. Možete je menjati iz naloga.</p> : <button className="button" type="button" disabled={conversionBusy} onClick={() => void convertToSubscription(result.subscriptionOffer!.token)}>{conversionBusy ? "Uključujemo…" : "Da, ponovi svake nedelje"}</button>}<small>Bez ugovorne obaveze · preskakanje i pauza online</small></section> : null}
          {error ? <p className="notice error" role="alert">{error}</p> : null}
          <div className="button-row">
            <a className="button" href="/nalog">
              Otvori nalog
            </a>
            <a className="button secondary" href="/prodavnica">
              Nazad u prodavnicu
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="page-shell narrow">
        <div className="empty-state">
          <h1>Nema stavki za plaćanje.</h1>
          <p className="muted">Dodajte proizvode u korpu pre nastavka.</p>
          <a className="button" href="/prodavnica">
            Otvori prodavnicu
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <header className="page-heading">
        <p className="eyebrow">Plaćanje</p>
        <h1>Podaci za dostavu</h1>
      </header>
      <form className="checkout-layout" onSubmit={submitCheckout}>
        <div className="form-stack">
          <section className="card form-stack" aria-labelledby="kontakt-title">
            <h2 id="kontakt-title">Kontakt</h2>
            <div className="form-grid">
              <label className="field">
                <span>Ime i prezime</span>
                <input name="fullName" autoComplete="name" required />
              </label>
              <label className="field">
                <span>Email</span>
                <input name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>
            </div>
            <label className="field">
              <span>Broj telefona</span>
              <input name="phone" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required />
            </label>

          </section>

          <section className="card form-stack" aria-labelledby="adresa-title">
            <h2 id="adresa-title">Adresa dostave</h2>
            <label className="field">
              <span>Ulica i broj</span>
              <input name="street" autoComplete="street-address" required />
            </label>
            <label className="field">
              <span>Sprat, stan ili dodatak adresi (opciono)</span>
              <input name="addressLine2" autoComplete="address-line2" />
            </label>
            <div className="form-grid">
              <label className="field">
                <span>Grad</span>
                <select name="city" autoComplete="address-level2" value={city} onChange={(event) => setCity(event.target.value)} aria-describedby="delivery-area-help" required>
                  <option value="">Izaberite grad</option>
                  {DELIVERY_CITIES.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Poštanski broj</span>
                <input name="postalCode" inputMode="numeric" autoComplete="postal-code" value={postalCode} onChange={(event) => setPostalCode(event.target.value.replace(/\D/g, "").slice(0, 5))} pattern="\d{5}" aria-invalid={Boolean(addressError)} aria-describedby="delivery-area-help delivery-area-status" required />
              </label>
            </div>
            <p id="delivery-area-help" className="muted small-text">Dostavljamo samo na teritoriji Beograda i Novog Sada.</p>
            <div id="delivery-area-status" aria-live="polite">
              {city && postalCode.length === 5 ? <p className={`check-result ${addressError || (quotedAddress === `${city}|${postalCode}` && quote?.serviceable === false) ? "error" : addressVerified ? "success" : ""}`}>
                {addressError ?? (addressVerified ? "Grad i poštanski broj su u zoni dostave." : quotedAddress === `${city}|${postalCode}` && quote?.serviceable === false ? "Ovaj poštanski broj trenutno nije u zoni dostave." : quoteError || "Proveravamo dostupnost dostave…")}
              </p> : null}
            </div>
            <label className="field">
              <span>Napomena za dostavu (opciono)</span>
              <textarea name="note" />
            </label>
          </section>

          <fieldset className="card fieldset">
            <legend><h2>Način plaćanja</h2></legend>
            <div className="radio-group">
              <label className="radio-card" htmlFor="placanje-gotovina">
                <input
                  id="placanje-gotovina"
                  type="radio"
                  name="paymentMethod"
                  checked={paymentMethod === "cash"}
                  readOnly
                />
                Gotovina pri dostavi
                <span className="muted small-text">Pretplata se plaća pri prvoj dostavi u mesecu.</span>
              </label>

            </div>
          </fieldset>

          <label className="checkbox-row">
            <input type="checkbox" required />
            <span>
              Saglasan/na sam sa <a href="/uslovi-kupovine" target="_blank">uslovima kupovine</a> i <a href="/pravila-pretplate" target="_blank">pravilima redovne dostave</a>.
            </span>
          </label>
          {error ? <p className="notice error" role="alert">{error}</p> : null}
          {quoteError ? <p className="notice error" role="alert">{quoteError}</p> : null}
        </div>

        <aside className="card cart-summary" aria-labelledby="porudzbina-title">
          <h2 id="porudzbina-title">Porudžbina</h2>
          {quote?.lines.map((line, index) => (
            <div className="summary-row small-text" key={`${line.productId}-${index}`}>
              <span>
                {line.quantity} × {line.productName}<br />
                <span className="muted">
                  {line.purchaseType === "one_time" ? "Jednokratno" : `${cadenceLabel(line.cadence ?? undefined)} · ${formatMoney(line.unitPriceMinor * line.quantity / 100)} po dostavi · ${line.occurrences}× ovog meseca`}
                  {line.deliveryDates.length ? <><br />Termini: {line.deliveryDates.map((date) => formatDate(date)).join(", ")}</> : null}
                </span>
              </span>
              <strong>{formatMoney(line.lineTotalMinor / 100)}</strong>
            </div>
          ))}
          {quote ? <><div className="summary-row"><span>Međuzbir</span><span>{formatMoney(quote.subtotalMinor / 100)}</span></div>{quote.discountMinor > 0 ? <div className="summary-row discount-row"><span>Popust {quote.promoCode}</span><span>−{formatMoney(quote.discountMinor / 100)}</span></div> : null}<div className="summary-row"><span>Dostava{quote.deliveryOccurrences && quote.deliveryOccurrences > 1 && quote.deliveryFeePerOccurrenceMinor ? ` (${quote.deliveryOccurrences} × ${formatMoney(quote.deliveryFeePerOccurrenceMinor / 100)})` : ""}</span><span>{quote.deliveryFeeMinor ? formatMoney(quote.deliveryFeeMinor / 100) : "Besplatno"}</span></div><div className="summary-row summary-total"><span>{quote.lines.some((line) => line.purchaseType === "subscription") ? "Danas plaćate za tekući mesec" : "Danas plaćate"}</span><span>{formatMoney(quote.totalMinor / 100)}</span></div><p className="delivery-summary">Prva dostava: <strong>{formatDate(quote.deliveryDate)}</strong><br /><small>Izmene do {formatDate(quote.cutoffAt)}</small></p></> : <p className="loading-state">Računamo tačan iznos…</p>}
          <p className="muted small-text">Redovna dostava je bez ugovorne obaveze. Plaćate samo isporuke planirane za tekući mesec.</p>
          <button className="button" type="submit" disabled={submitting || !quote || !addressVerified}>
            {submitting ? "Čuvamo porudžbinu…" : "Potvrdi porudžbinu"}
          </button>
          <a className="button secondary" href="/korpa">Izmeni korpu</a>
        </aside>
      </form>
    </div>
  );
}
