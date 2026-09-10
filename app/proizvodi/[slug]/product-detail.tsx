"use client";
/* eslint-disable @next/next/no-img-element -- Optimized catalog images and admin-managed image URLs are served directly. */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCart } from "../../components/cart-provider";
import { useAnalytics } from "../../components/analytics-provider";
import { ProductCard } from "../../components/product-card";
import { cadenceLabel, formatMoney, formatDate, type DeliveryWindow, type DeliveryCadence, type Product, type PurchaseType } from "../../lib/frontend";

export function ProductDetail({ product, delivery, recommendations }: { product: Product; delivery: DeliveryWindow; recommendations: Product[] }) {
  const { addItem } = useCart();
  const { track } = useAnalytics();
  const [purchaseType, setPurchaseType] = useState<PurchaseType>(product.allowSubscription ? "subscription" : "one_time");
  const [cadence, setCadence] = useState<DeliveryCadence>("weekly");
  const [quantity, setQuantity] = useState(2);
  const [added, setAdded] = useState(false);
  const trackedProduct = useRef("");
  const unitPrice = purchaseType === "subscription" ? product.subscriptionPriceRsd : product.priceRsd;
  const monthlyOccurrences = delivery.remainingOccurrences[cadence];
  const saving = (product.priceRsd - product.subscriptionPriceRsd) * quantity;
  const selectionLabel = `${quantity} L · ${purchaseType === "subscription" ? cadenceLabel(cadence).toLocaleLowerCase("sr-Latn") : "jednokratno"}`;
  const cutoff = new Intl.DateTimeFormat("sr-Latn-RS", { timeZone: "Europe/Belgrade", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(delivery.cutoffAt));

  useEffect(() => {
    if (trackedProduct.current !== product.id) {
      trackedProduct.current = product.id;
      track("view_item", { productId: product.id, productName: product.name });
    }
  }, [product, track]);

  function addToCart() {
    if (!product.available) return;
    addItem({ productId: product.id, slug: product.slug, name: product.name, unit: product.unit, unitPriceRsd: unitPrice, purchaseType, cadence: purchaseType === "subscription" ? cadence : undefined, quantity });
    track("add_to_cart", { productId: product.id, purchaseType, cadence: purchaseType === "subscription" ? cadence : null, quantity, valueRsd: unitPrice * quantity });
    setAdded(true);
  }

  function choosePurchaseType(value: PurchaseType) {
    setPurchaseType(value);
    setAdded(false);
    track(value === "subscription" ? "subscription_selected" : "select_item", { productId: product.id, purchaseType: value });
  }

  function chooseQuantity(value: number) {
    setQuantity(Math.min(99, Math.max(1, Math.round(value) || 1)));
    setAdded(false);
  }

  return (
    <div className="page-shell product-detail-page">
      <nav className="breadcrumbs" aria-label="Putanja"><Link href="/">Početna</Link><span aria-hidden="true">/</span><a href="/prodavnica">Prodavnica</a><span aria-hidden="true">/</span><span aria-current="page">{product.name}</span></nav>
      <div className="product-detail">
        <div className="product-visual-column">
          <div className="product-detail-media">
            {product.imageUrl ? <img src={product.imageUrl} alt={product.imageAlt} width="1080" height="1080" fetchPriority="high" /> : <div className="product-placeholder">Fotografija uskoro</div>}
            {product.isDemo ? <div className="product-badges"><small>DEMO PROIZVOD</small></div> : null}
          </div>
          <div className="product-quick-facts"><span><strong>Pakovanje</strong>{product.unit} · povratna flaša</span><span><strong>Poreklo</strong>{product.origin || "Uskoro"}</span></div>
        </div>

        <section className="purchase-panel" aria-labelledby="porucivanje-title">
          <div className="purchase-heading">
            <p className="eyebrow">{product.category}</p>
            <h1 id="porucivanje-title">{product.name}</h1>
            <p>{product.shortDescription}</p>
            <div className="detail-price"><strong>{formatMoney(unitPrice)}</strong><span>/ {product.unit}</span>{purchaseType === "subscription" && product.priceRsd > unitPrice ? <s>{formatMoney(product.priceRsd)}</s> : null}</div>
          </div>

          <fieldset className="fieldset purchase-step">
            <legend><span className="step-label">01</span> Litara po dostavi</legend>
            <div className="quantity-presets" aria-label="Litara po dostavi">
              {[2, 4, 8].map((value) => <button key={value} type="button" aria-pressed={quantity === value} onClick={() => chooseQuantity(value)}>{value} L</button>)}
            </div>
            <details className="custom-quantity">
              <summary>Druga količina{![2, 4, 8].includes(quantity) ? ` · ${quantity} L` : ""}</summary>
              <div className="quantity-control" aria-label="Druga količina u litrima">
                <button type="button" aria-label="Smanji količinu" onClick={() => chooseQuantity(quantity - 1)}>−</button>
                <input aria-label="Količina" type="number" min="1" max="99" value={quantity} onChange={(event) => chooseQuantity(Number(event.target.value))} />
                <button type="button" aria-label="Povećaj količinu" onClick={() => chooseQuantity(quantity + 1)}>+</button>
              </div>
            </details>
          </fieldset>

          <fieldset className="fieldset purchase-step">
            <legend><span className="step-label">02</span> Izaberite kupovinu</legend>
            <div className="radio-group">
              <label className="radio-card" htmlFor="kupovina-jednom"><input id="kupovina-jednom" type="radio" name="purchaseType" value="one_time" checked={purchaseType === "one_time"} onChange={() => choosePurchaseType("one_time")} />Jednokratno<span className="muted small-text">Samo sledeća dostava</span></label>
              {product.allowSubscription ? <label className="radio-card" htmlFor="kupovina-pretplata"><input id="kupovina-pretplata" type="radio" name="purchaseType" value="subscription" checked={purchaseType === "subscription"} onChange={() => choosePurchaseType("subscription")} />Redovna dostava<span className="muted small-text">Preskočite ili pauzirajte</span></label> : null}
            </div>
          </fieldset>

          {purchaseType === "subscription" ? <label className="field purchase-cadence"><span><span className="step-label">03</span> Ritam dostave</span><select value={cadence} onChange={(event) => { const value = event.target.value as DeliveryCadence; setCadence(value); setAdded(false); track("delivery_cadence_selected", { productId: product.id, cadence: value }); }}><option value="weekly">Svake nedelje</option><option value="biweekly">Svake 2 nedelje</option></select><small className="muted">{quantity * monthlyOccurrences} L kroz {monthlyOccurrences} preostale isporuke ovog meseca</small></label> : null}

          {purchaseType === "subscription" && saving > 0 ? <p className="saving-callout">Ušteda {formatMoney(saving)} po isporuci</p> : null}
          <div className="purchase-summary">
            <p className="summary-row purchase-total"><span>Mleko po isporuci<small>{selectionLabel}</small></span><strong>{formatMoney(unitPrice * quantity)}</strong></p>
            <p className="purchase-delivery-note">Dostava se obračunava u korpi. <a href="/dostava">Detalji dostave</a></p>
            <button className="button" type="button" disabled={!product.available} onClick={addToCart}>{product.available ? (added ? "Dodato u korpu ✓" : "Dodaj u korpu →") : "Trenutno nije dostupno"}</button>
            {added ? <p className="cart-added" role="status">Vaš izbor je u korpi. <a href="/korpa">Otvori korpu →</a></p> : null}
          </div>
          <p className="next-delivery">Sledeća dostava: <strong>{formatDate(delivery.deliveryDate)}</strong></p>
          <p className="purchase-footnote">Izmene za sledeću dostavu do {cutoff} h.{purchaseType === "subscription" ? " Bez ugovorne obaveze." : ""}</p>
        </section>
      </div>

      <section className="product-story-section" aria-labelledby="opis-title"><div><p className="eyebrow">O proizvodu</p><h2 id="opis-title">Šta treba da znate.</h2></div><div><p className="lead">{product.description || product.shortDescription}</p>{product.isDemo ? <p className="demo-notice">Ovo je demo sadržaj za razvoj. Fotografiju, deklaraciju i podatke o poreklu zamenite u adminu pre javne objave.</p> : null}</div></section>

      {recommendations.length ? <section className="section cross-sell-section" aria-labelledby="cross-sell-title"><div className="section-heading split-heading"><div><p className="eyebrow">Još iz naše ponude</p><h2 id="cross-sell-title">Probajte i drugi ukus.</h2></div><a className="text-link" href="/prodavnica">Cela ponuda →</a></div><div className="product-grid">{recommendations.map((item) => <ProductCard key={item.id} product={item} />)}</div></section> : null}

      <div className="mobile-buy-bar"><div><small>{selectionLabel}</small><strong>{formatMoney(unitPrice * quantity)}<span> + dostava</span></strong></div><button className="button" type="button" disabled={!product.available} onClick={addToCart}>{!product.available ? "Nedostupno" : added ? "Dodato ✓" : "Dodaj u korpu"}</button></div>
    </div>
  );
}
