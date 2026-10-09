"use client";

import { useLocalize, useLocale } from "@/app/lib/i18n/client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { DeliveryCalendar } from "../components/delivery-calendar";
import { DELIVERY_CITIES } from "../lib/delivery-area";
import { useCart } from "../components/cart-provider";
import { getConsentPreferences, useAnalytics } from "../components/analytics-provider";
import { getAttributionSnapshot } from "../lib/attribution";
import {
  cadenceLabel,
  fetchJson,
  formatMoney,
  formatDate,
  formatDateTime,
  type CartQuote,
  type DeliverySchedule,
} from "../lib/frontend";

type CheckoutResult = {
  id?: string;
  orderId?: string;
  order?: { id?: string; orderNumber?: string; deliveryDate?: string };
  subscriptionIds?: string[];
  message?: string;
  subscription?: { id?: string } | null;
  subscriptionOffer?: { token: string; eligibleItemCount: number; savingPerDeliveryMinor: number; expiresAt: string } | null;
};

export function CheckoutForm() {
  const localize = useLocalize();
  const locale = useLocale();
  const { items, ready, promoCode, clearCart } = useCart();
  const { track, consent: trackingConsent } = useAnalytics();
  const paymentMethod = "cash";
  // Subscription-only notes stay off one-time orders, where they would not be true.
  const hasSubscription = items.some((item) => item.purchaseType === "subscription");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [quotedRequest, setQuotedRequest] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [schedule, setSchedule] = useState<DeliverySchedule | null>(null);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleAttempt, setScheduleAttempt] = useState(0);
  const quoteKey = JSON.stringify({ city, postalCode, deliveryDate, items, promoCode });
  function changeAddress(field: "city" | "postalCode", value: string) {
    if (field === "city") setCity(value); else setPostalCode(value);
    setDeliveryDate(""); setSchedule(null); setScheduleError("");
  }

  useEffect(() => {
    if (!city || postalCode.length !== 5) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void fetchJson<DeliverySchedule>(`/api/delivery-options?${new URLSearchParams({ city, postalCode })}`)
        .then(value => { if (active) { setSchedule(value); setDeliveryDate(value.dates[0] ?? ""); setScheduleError(""); } })
        .catch(error => { if (active) setScheduleError(error instanceof Error ? error.message : "Termini trenutno nisu dostupni."); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [city, postalCode, scheduleAttempt]);
  const addressError = null;
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [conversionBusy, setConversionBusy] = useState(false);
  const [conversionDone, setConversionDone] = useState(false);
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const promoTracked = useRef("");
  const checkoutTracked = useRef(false);
  const idempotencyKey = useRef<string | null>(null);
  const addressVerified = Boolean(city && postalCode.length === 5 && !addressError
    && deliveryDate && quote?.serviceable === true && quotedRequest === quoteKey && quote.deliveryDate === deliveryDate);

  useEffect(() => {
    if (!quote || (!trackingConsent?.analytics && !trackingConsent?.marketing)) return;
    const ecommerce = { currency: "RSD", value: quote.totalMinor / 100, items: items.map(item => ({ item_id: item.productId, item_name: item.name, price: item.unitPriceRsd, quantity: item.quantity })) };
    if (!checkoutTracked.current) { checkoutTracked.current = true; track("begin_checkout", ecommerce); }
    if (quote.promoCode && promoTracked.current !== quote.promoCode) { promoTracked.current = quote.promoCode; track("promo_applied", { coupon: quote.promoCode }); }
  }, [quote, items, track, trackingConsent]);

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
    if (!ready || items.length === 0 || !deliveryDate) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setQuoteError("");
      void fetchJson<CartQuote>("/api/cart", {
        method: "POST",
        body: JSON.stringify({
          items: items.map((item) => ({ productId: item.productId, quantity: item.quantity, purchaseType: item.purchaseType, cadence: item.cadence })),
          deliveryDate,
          promoCode: promoCode || undefined,
          city: city || undefined,
          postalCode: postalCode.length === 5 ? postalCode : undefined,
        }),
      }).then((value) => { if (active) { setQuote(value); setQuotedRequest(quoteKey); } }).catch((requestError) => {
        if (active) {
          setQuote(null);
          setQuoteError(requestError instanceof Error ? requestError.message : "Obračun trenutno nije dostupan.");
        }
      });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [items, city, postalCode, promoCode, ready, deliveryDate, quoteKey]);

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!addressVerified) {
      setError(addressError ?? "Izaberite Beograd ili Novi Sad i unesite važeći poštanski broj. Sačekajte proveru dostave.");
      return;
    }
    track("add_payment_info", { payment_type: paymentMethod });
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
          slotId: form.get("slotId") || undefined,
          billing: form.get("companyName") || form.get("billingStreet") ? { companyName: form.get("companyName") || undefined, taxId: form.get("taxId") || undefined, addressLine1: form.get("billingStreet") || form.get("street"), city: form.get("billingCity") || form.get("city"), postalCode: form.get("billingPostalCode") || form.get("postalCode") } : undefined,
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
          deliveryDate,
          promoCode: promoCode || undefined,
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            purchaseType: item.purchaseType,
            cadence: item.cadence,
          })),
          attribution,
          analyticsConsent: consent.analytics,
          marketingConsent: consent.marketing,
        }),
      });
      setResult(payload);
      const orderId = payload.order?.id ?? payload.orderId ?? payload.id;
      track("order_created", { paymentMethod }, orderId);
      if (payload.subscription?.id || payload.subscriptionIds?.length) track("subscription_activated", { paymentMethod }, orderId);
      clearCart();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Porudžbina nije sačuvana. Pokušaj ponovo.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return localize((
      <div className="page-shell checkout-page">
        <p className="loading-state" role="status">
          Pripremamo plaćanje…
        </p>
      </div>
    ));
  }

  if (result) {
    return localize((
      <div className="page-shell narrow checkout-page">
        <div className="notice success" role="status">
          <p className="eyebrow">Porudžbina je primljena</p>
          <h1>Hvala na porudžbini.</h1>
          <p>
            Porudžbina je sačuvana. Status i redovnu dostavu možeš da pratiš iz svog naloga.
            {result.order?.orderNumber || result.orderId || result.order?.id || result.id ? (
              <> Broj porudžbine: <strong>{result.order?.orderNumber ?? result.orderId ?? result.order?.id ?? result.id}</strong>.</>
            ) : null}
          </p>
          {result.order?.deliveryDate ? <p>Prva dostava: <strong>{formatDate(result.order.deliveryDate, locale)}</strong>.</p> : null}
          <p className="muted small-text">Za prvi pristup nalogu dovoljan je kod poslat na email sa porudžbine. Lozinka nije potrebna.</p>
          {result.subscriptionOffer ? <section className="post-purchase-offer" aria-labelledby="post-purchase-title"><p className="eyebrow">Jedan klik do mirnog frižidera</p><h2 id="post-purchase-title">Neka ista porudžbina stiže svake nedelje.</h2><p>Uključujemo {result.subscriptionOffer.eligibleItemCount} {result.subscriptionOffer.eligibleItemCount === 1 ? "proizvod" : "proizvoda"} u nedeljni ritam. Prva redovna dostava je sledeće nedelje, a sada nema nove naplate.{result.subscriptionOffer.savingPerDeliveryMinor > 0 ? <> Štedite <strong>{formatMoney(result.subscriptionOffer.savingPerDeliveryMinor / 100, locale)}</strong> po dostavi.</> : null}</p>{conversionDone ? <p className="notice success">Redovna dostava je uključena. Možete je menjati iz naloga.</p> : <button className="button" type="button" disabled={conversionBusy} onClick={() => void convertToSubscription(result.subscriptionOffer!.token)}>{conversionBusy ? "Uključujemo…" : "Da, ponovi svake nedelje"}</button>}<small>Bez ugovorne obaveze · preskakanje i pauza online</small></section> : null}
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
    ));
  }

  if (items.length === 0) {
    return localize((
      <div className="page-shell narrow checkout-page">
        <div className="empty-state">
          <p className="eyebrow">Plaćanje</p>
          <h1>Nema stavki za plaćanje.</h1>
          <p className="lead">Dodaj proizvode u korpu pre nastavka.</p>
          <a className="button" href="/prodavnica">
            Otvori prodavnicu
          </a>
        </div>
      </div>
    ));
  }

  return localize((
    <div className="page-shell checkout-page">
      <header className="page-heading compact-heading">
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
                <input name="city" autoComplete="address-level2" list="delivery-cities" value={city} onChange={event=>changeAddress("city", event.target.value)} aria-describedby="delivery-area-help" required /><datalist id="delivery-cities">{DELIVERY_CITIES.map(name=><option key={name} value={name} />)}</datalist>
              </label>
              <label className="field">
                <span>Poštanski broj</span>
                <input name="postalCode" inputMode="numeric" autoComplete="postal-code" value={postalCode} onChange={(event) => changeAddress("postalCode", event.target.value.replace(/\D/g, "").slice(0, 5))} pattern="\d{5}" aria-invalid={Boolean(addressError)} aria-describedby="delivery-area-help delivery-area-status" required />
              </label>
            </div>
            <p id="delivery-area-help" className="muted small-text">Unesite grad i poštanski broj da proverimo zonu dostave.</p>
            <div id="delivery-area-status" aria-live="polite">
              {city && postalCode.length === 5 ? <p className={`check-result ${addressError || (quotedRequest === quoteKey && quote?.serviceable === false) ? "error" : addressVerified ? "success" : ""}`}>
                {addressError ?? (addressVerified ? "Grad i poštanski broj su u zoni dostave." : quotedRequest === quoteKey && quote?.serviceable === false ? "Ovaj poštanski broj trenutno nije u zoni dostave." : scheduleError || quoteError || "Proveravamo dostupnost dostave…")}
              </p> : null}
            </div>
            <label className="field">
              <span>Napomena za dostavu (opciono)</span>
              <textarea name="note" />
            </label>
          </section>

          {schedule ? <DeliveryCalendar key={`${city}|${postalCode}`} schedule={schedule} value={deliveryDate} onChange={setDeliveryDate} recurring={hasSubscription} /> : <section className="card"><h2>Dan i početak dostave</h2><p role="status">{scheduleError || (city && postalCode.length === 5 ? "Učitavamo dostupne termine…" : "Prvo unesi grad i poštanski broj, pa izaberi dan i datum dostave.")}</p>{scheduleError ? <button type="button" className="button secondary" onClick={() => setScheduleAttempt(value => value + 1)}>Proveri ponovo</button> : null}</section>}
          <details className="card"><summary>Račun za firmu ili druga adresa računa</summary><div className="form-grid"><label className="field"><span>Naziv firme</span><input name="companyName" /></label><label className="field"><span>PIB (9 cifara)</span><input name="taxId" pattern="[0-9]{9}" /></label><label className="field"><span>Adresa računa</span><input name="billingStreet" /></label><label className="field"><span>Grad za račun</span><input name="billingCity" /></label><label className="field"><span>Poštanski broj za račun</span><input name="billingPostalCode" /></label></div></details>
          {quote?.deliverySlots?.length ? <label className="field"><span>Vreme dostave</span><select name="slotId" required><option value="">Izaberite termin</option>{quote.deliverySlots.map(slot=><option key={slot.id} value={slot.id}>{slot.label}</option>)}</select></label> : null}
          <fieldset className="card payment-fieldset">
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
                {hasSubscription ? <span className="muted small-text">Ceo paket se plaća unapred, pre početka isporuka.</span> : null}
              </label>

            </div>
          </fieldset>


          {error ? <p className="notice error" role="alert">{error}</p> : null}
          {quote?.minimumOrderMet === false ? <p className="notice error">Minimalna kupovina: {formatMoney(Number(quote.minimumOrderMinor)/100, locale)}</p> : null}
          {quoteError ? <p className="notice error" role="alert">{quoteError}</p> : null}
        </div>

        <aside className="card cart-summary" aria-labelledby="porudzbina-title" aria-busy={Boolean(deliveryDate && quotedRequest !== quoteKey)}>
          <h2 id="porudzbina-title">Porudžbina</h2>
          {quote?.lines.map((line, index) => (
            <div className="summary-row small-text" key={`${line.productId}-${index}`}>
              <span>
                {line.quantity} × {line.productName}<br />
                <span className="muted">
                  {line.purchaseType === "one_time" ? "Jednokratno" : `${cadenceLabel(line.cadence ?? undefined)} · ${formatMoney(line.unitPriceMinor * line.quantity / 100, locale)} po dostavi · ${line.occurrences}× u paketu`}
                  {line.purchaseType === "subscription" ? <><br />Ukupno u paketu: {line.quantity * line.occurrences} komada</> : null}
                  {line.deliveryDates.length ? <><br />Termini: {line.deliveryDates.map((date) => formatDate(date, locale)).join(", ")}</> : null}
                </span>
              </span>
              <strong>{formatMoney(line.lineTotalMinor / 100, locale)}</strong>
            </div>
          ))}
          {quote ? <><div className="summary-row"><span>Međuzbir</span><span>{formatMoney(quote.subtotalMinor / 100, locale)}</span></div>{quote.discountMinor > 0 ? <div className="summary-row discount-row"><span>Popust {quote.promoCode}</span><span>−{formatMoney(quote.discountMinor / 100, locale)}</span></div> : null}<div className="summary-row"><span>Dostava{quote.deliveryOccurrences && quote.deliveryOccurrences > 1 && quote.deliveryFeePerOccurrenceMinor ? ` (${quote.deliveryOccurrences} × ${formatMoney(quote.deliveryFeePerOccurrenceMinor / 100, locale)})` : ""}</span><span>{quote.deliveryFeeMinor ? formatMoney(quote.deliveryFeeMinor / 100, locale) : "Besplatno"}</span></div><div className="summary-row summary-total"><span>{quote.lines.some((line) => line.purchaseType === "subscription") ? "Ukupno za ceo paket" : "Danas plaćate"}</span><span>{formatMoney(quote.totalMinor / 100, locale)}</span></div><p className="delivery-summary">Prva dostava: <strong>{formatDate(quote.deliveryDate, locale)}</strong><br /><small>Izmene do {formatDateTime(quote.cutoffAt, locale)}</small></p></> : <p className="loading-state">Računamo tačan iznos…</p>}
          <p className="muted small-text">Redovna dostava je bez ugovorne obaveze. Paket obuhvata 4 nedeljne ili 2 dvonedeljne dostave. Pauza i preskakanje čuvaju plaćene količine.</p>
          <label className="checkbox-row">
            <input type="checkbox" required />
            <span>
              Saglasan/na sam sa <a href="/uslovi-kupovine" target="_blank">uslovima kupovine</a> i <a href="/pravila-pretplate" target="_blank">pravilima redovne dostave</a>.
            </span>
          </label>
          <button className="button" type="submit" disabled={submitting || !quote || !addressVerified || quote.minimumOrderMet === false}>
            {submitting ? "Čuvamo porudžbinu…" : "Potvrdi porudžbinu"}
          </button>
          <a className="button secondary" href="/korpa">Izmeni korpu</a>
        </aside>
      </form>
    </div>
  ));
}
