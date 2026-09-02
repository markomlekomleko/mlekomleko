"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAnalytics } from "../components/analytics-provider";
import { useCart } from "../components/cart-provider";
import {
  cadenceLabel,
  fetchJson,
  formatDate,
  formatMoney,
  normalizeProduct,
  type CartQuote,
  type DeliveryCadence,
  type Product,
  type PurchaseType,
} from "../lib/frontend";

export function CartView() {
  const { items, ready, promoCode, setPromoCode, addItem, updateItem, removeItem } = useCart();
  const { track } = useAnalytics();
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [promoInput, setPromoInput] = useState(promoCode);
  const [promoNotice, setPromoNotice] = useState("");
  const [catalog, setCatalog] = useState<Product[]>([]);
  const viewTracked = useRef(false);
  const quoteKey = useMemo(() => JSON.stringify({ items: items.map((item) => ({ productId: item.productId, quantity: item.quantity, purchaseType: item.purchaseType, cadence: item.cadence })), promoCode }), [items, promoCode]);
  const orderBump = quote?.recommendedAddons?.[0] ? normalizeProduct(quote.recommendedAddons[0]) : null;
  const canSubscribeMore = items.some((item) => item.purchaseType === "one_time");

  useEffect(() => {
    void fetchJson<{ products: unknown[] }>("/api/products").then((payload) => setCatalog(payload.products.map(normalizeProduct))).catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    if (!ready || items.length === 0) {
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setQuoteError("");
      void fetchJson<CartQuote>("/api/cart", {
        method: "POST",
        body: JSON.stringify({
          items: items.map((item) => ({ productId: item.productId, quantity: item.quantity, purchaseType: item.purchaseType, cadence: item.cadence })),
          promoCode: promoCode || undefined,
        }),
      }).then((value) => {
        if (active) setQuote(value);
      }).catch((error) => {
        if (active) {
          setQuote(null);
          setQuoteError(error instanceof Error ? error.message : "Obračun trenutno nije dostupan.");
        }
      });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [items, promoCode, quoteKey, ready]);

  useEffect(() => {
    if (ready && items.length > 0 && !viewTracked.current) {
      viewTracked.current = true;
      track("view_cart", { itemCount: items.reduce((sum, item) => sum + item.quantity, 0) });
    }
  }, [items, ready, track]);

  function applyPromo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = promoInput.toUpperCase().replace(/\s+/g, "");
    setPromoInput(clean);
    setPromoCode(clean);
    setPromoNotice(clean ? "Proveravamo kod u konačnom obračunu…" : "Promo kod je uklonjen.");
  }

  function addOrderBump(product: Product) {
    addItem({ productId: product.id, slug: product.slug, name: product.name, unit: product.unit, unitPriceRsd: product.priceRsd, purchaseType: "one_time", quantity: 1 });
    track("add_to_cart", { productId: product.id, placement: "cart_order_bump", purchaseType: "one_time", valueRsd: product.priceRsd });
  }

  function subscribeEligibleItems() {
    items.forEach((item) => {
      if (item.purchaseType === "one_time" && catalog.find((product) => product.id === item.productId)?.allowSubscription) updateItem(item.key, { purchaseType: "subscription", cadence: "weekly" });
    });
    track("subscription_selected", { placement: "cart_upsell", itemCount: items.length });
  }

  if (!ready) return <div className="page-shell"><p className="loading-state" role="status">Učitavamo korpu…</p></div>;

  if (items.length === 0) {
    return (
      <div className="page-shell narrow">
        <div className="empty-state empty-cart">
          <p className="eyebrow">Korpa</p>
          <h1>Vaša korpa je spremna za prvi proizvod.</h1>
          <p className="lead">Dodajte proizvod jednokratno ili odaberite redovnu dostavu.</p>
          <a className="button" href="/prodavnica">Sastavi dostavu →</a>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <header className="page-heading compact-heading">
        <p className="eyebrow">Korpa</p>
        <h1>Još samo dostava.</h1>
        <p className="lead">Sve cene i termini proveravaju se direktno iz ponude pre plaćanja.</p>
      </header>

      <div className="checkout-layout">
        <div className="cart-list">
          {items.map((item) => {
            const line = quote?.lines.find((candidate) => candidate.productId === item.productId && candidate.purchaseType === item.purchaseType && candidate.cadence === (item.cadence ?? null));
            return (
              <article className="card cart-item" key={item.key}>
                <div><h2><a href={`/proizvodi/${encodeURIComponent(item.slug)}`}>{item.name}</a></h2><p className="muted small-text">{line ? `${formatMoney(line.unitPriceMinor / 100)} / ${line.unitLabel}` : item.unit}</p></div>
                <label className="field"><span>Tip kupovine</span><select aria-label={`Tip kupovine za ${item.name}`} value={item.purchaseType} onChange={(event) => { const purchaseType = event.target.value as PurchaseType; updateItem(item.key, { purchaseType, cadence: purchaseType === "subscription" ? "weekly" : undefined }); }}><option value="one_time">Jednokratno</option><option value="subscription">Redovna dostava</option></select></label>
                <label className="field"><span>Ritam</span><select aria-label={`Ritam isporuke za ${item.name}`} disabled={item.purchaseType === "one_time"} value={item.cadence ?? "weekly"} onChange={(event) => updateItem(item.key, { cadence: event.target.value as DeliveryCadence })}><option value="weekly">Svake nedelje</option><option value="biweekly">Svake 2 nedelje</option></select></label>
                <label className="field"><span>Količina</span><input aria-label={`Količina za ${item.name}`} type="number" min="1" max="99" value={item.quantity} onChange={(event) => updateItem(item.key, { quantity: Math.max(1, Number(event.target.value) || 1) })} /></label>
                <div className="cart-line-total"><p className="price">{line ? formatMoney(line.lineTotalMinor / 100) : "…"}</p>{line && line.occurrences > 1 ? <small>{line.occurrences} isporuke ovog meseca</small> : null}<button className="text-button danger-text" type="button" onClick={() => removeItem(item.key)} aria-label={`Ukloni ${item.name} iz korpe`}>Ukloni</button></div>
              </article>
            );
          })}
        </div>

        <aside className="card cart-summary" aria-labelledby="ukupno-title">
          <p className="eyebrow">Pregled</p>
          <h2 id="ukupno-title">Vaša prva porudžbina</h2>
          {quote?.lines.map((line, index) => <div className="summary-row small-text" key={`${line.productId}-${index}`}><span>{line.quantity} × {line.productName}<br /><small className="muted">{line.purchaseType === "one_time" ? "Jednokratno" : `${cadenceLabel(line.cadence ?? undefined)} · ${formatMoney(line.unitPriceMinor * line.quantity / 100)} po dostavi`}{line.occurrences > 1 ? ` · ${line.occurrences} dostave ovog meseca` : ""}</small></span><strong>{formatMoney(line.lineTotalMinor / 100)}</strong></div>)}
          <form className="promo-form" onSubmit={applyPromo}><label className="field"><span>Promo kod</span><div className="input-action"><input value={promoInput} onChange={(event) => setPromoInput(event.target.value)} placeholder="DOBRODOSLI10" /><button className="button secondary small" type="submit">Primeni</button></div></label></form>
          {orderBump ? <div className="order-bump"><div><small>Najbolje uz vašu korpu</small><strong>＋ {orderBump.name}</strong><span>{formatMoney(orderBump.priceRsd)} / {orderBump.unit}</span></div><button type="button" onClick={() => addOrderBump(orderBump)}>Dodaj</button></div> : null}
          {canSubscribeMore ? <button className="cart-upsell" type="button" onClick={subscribeEligibleItems}><strong>Uštedite uz redovan ritam</strong><span>Prebaci dostupne jednokratne proizvode na nedeljnu dostavu →</span></button> : null}
          {promoNotice && !quoteError ? <p className="muted small-text">{quote?.discountMinor ? `Kod ${quote.promoCode} je primenjen.` : promoNotice}</p> : null}
          {quoteError ? <p className="notice error small-text" role="alert">{quoteError}</p> : null}
          {quote ? <><div className="summary-row"><span>Međuzbir</span><span>{formatMoney(quote.subtotalMinor / 100)}</span></div>{quote.discountMinor > 0 ? <div className="summary-row discount-row"><span>Popust {quote.promoCode}</span><span>−{formatMoney(quote.discountMinor / 100)}</span></div> : null}<div className="summary-row"><span>Dostava{quote.deliveryOccurrences && quote.deliveryOccurrences > 1 && quote.deliveryFeePerOccurrenceMinor ? ` (${quote.deliveryOccurrences} × ${formatMoney(quote.deliveryFeePerOccurrenceMinor / 100)})` : ""}</span><span>{quote.deliveryFeeMinor ? formatMoney(quote.deliveryFeeMinor / 100) : "Besplatno"}</span></div><div className="summary-row summary-total"><span>{quote.lines.some((line) => line.purchaseType === "subscription") ? "Danas plaćate za ovaj mesec" : "Danas plaćate"}</span><span>{formatMoney(quote.totalMinor / 100)}</span></div><p className="delivery-summary">Sledeća dostava <strong>{formatDate(quote.deliveryDate)}</strong><br /><small>Izmene su moguće do {formatDate(quote.cutoffAt)}.</small></p></> : <p className="loading-state">Računamo tačan iznos…</p>}
          {quote && quote.freeDeliveryThresholdMinor > 0 ? <div className={`delivery-progress ${quote.freeDeliveryRemainingMinor === 0 ? "complete" : ""}`}><div className="summary-row"><strong>{quote.freeDeliveryRemainingMinor > 0 ? `Još ${formatMoney(quote.freeDeliveryRemainingMinor / 100)} do besplatne dostave` : "Otključali ste besplatnu dostavu ✓"}</strong><small>{formatMoney(quote.freeDeliveryThresholdMinor / 100)}</small></div><span><i style={{ width: `${Math.min(100, quote.subtotalMinor / quote.freeDeliveryThresholdMinor * 100)}%` }} /></span></div> : null}
          <a className={`button ${!quote ? "disabled-link" : ""}`} href={quote ? "/checkout" : "#"} onClick={(event) => { if (!quote) event.preventDefault(); else track("begin_checkout", { valueRsd: quote.totalMinor / 100, itemCount: items.length }); }}>Nastavi na podatke za dostavu →</a>
          <a className="button secondary" href="/prodavnica">Dodaj još proizvoda</a>
          <p className="secure-note">🔒 Tačan iznos proveravamo još jednom pre potvrde.</p>
        </aside>
      </div>
    </div>
  );
}
