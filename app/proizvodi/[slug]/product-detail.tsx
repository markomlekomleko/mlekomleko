"use client";
/* eslint-disable @next/next/no-img-element -- Product images are admin-managed URLs and next/image is unavailable in vinext. */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCart } from "../../components/cart-provider";
import { useAnalytics } from "../../components/analytics-provider";
import { ProductCard } from "../../components/product-card";
import {
  fetchJson,
  formatMoney,
  normalizeProduct,
  formatDate,
  type DeliveryWindow,
  type DeliveryCadence,
  type Product,
  type PurchaseType,
} from "../../lib/frontend";

export function ProductDetail({ slug }: { slug: string }) {
  const { addItem } = useCart();
  const { track } = useAnalytics();
  const [product, setProduct] = useState<Product | null>(null);
  const [purchaseType, setPurchaseType] = useState<PurchaseType>("subscription");
  const [cadence, setCadence] = useState<DeliveryCadence>("weekly");
  const [quantity, setQuantity] = useState(2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(false);
  const [delivery, setDelivery] = useState<DeliveryWindow | null>(null);
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const trackedProduct = useRef("");

  const loadProduct = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [payload, storefront] = await Promise.all([
        fetchJson<unknown>(`/api/products/${encodeURIComponent(slug)}`),
        fetchJson<{ delivery: DeliveryWindow; products: unknown[] }>("/api/storefront"),
      ]);
      const wrapper = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
      const normalized = normalizeProduct(wrapper.product ?? wrapper.data ?? payload);
      setProduct(normalized);
      setPurchaseType(normalized.allowSubscription ? "subscription" : "one_time");
      setDelivery(storefront.delivery);
      setRecommendations(storefront.products.map(normalizeProduct).filter((candidate) => candidate.id !== normalized.id).slice(0, 3));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Proizvod trenutno ne može da se učita.",
      );
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    queueMicrotask(() => void loadProduct());
  }, [loadProduct]);

  useEffect(() => {
    if (product && trackedProduct.current !== product.id) {
      trackedProduct.current = product.id;
      track("view_item", { productId: product.id, productName: product.name });
    }
  }, [product, track]);

  function addToCart() {
    if (!product) return;
    addItem({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      unit: product.unit,
      unitPriceRsd:
        purchaseType === "subscription"
          ? product.subscriptionPriceRsd
          : product.priceRsd,
      purchaseType,
      cadence: purchaseType === "subscription" ? cadence : undefined,
      quantity,
    });
    track("add_to_cart", { productId: product.id, purchaseType, cadence: cadence ?? null, quantity, valueRsd: unitPrice * quantity });
    setAdded(true);
  }

  function choosePurchaseType(value: PurchaseType) {
    setPurchaseType(value);
    setAdded(false);
    if (product) track(value === "subscription" ? "subscription_selected" : "select_item", { productId: product.id, purchaseType: value });
  }

  function chooseQuantity(value: number) {
    setQuantity(Math.min(99, Math.max(1, Math.round(value) || 1)));
    setAdded(false);
  }

  if (loading) {
    return (
      <div className="page-shell">
        <p className="loading-state" role="status">
          Učitavamo proizvod…
        </p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="page-shell narrow">
        <div className="notice error" role="alert">
          <h1>Proizvod nije dostupan</h1>
          <p>{error || "Traženi proizvod ne postoji."}</p>
          <div className="button-row">
            <button className="button secondary" type="button" onClick={loadProduct}>
              Pokušaj ponovo
            </button>
            <a className="button" href="/prodavnica">
              Nazad u prodavnicu
            </a>
          </div>
        </div>
      </div>
    );
  }

  const unitPrice =
    purchaseType === "subscription"
      ? product.subscriptionPriceRsd
      : product.priceRsd;

  return (
    <div className="page-shell product-detail-page">
      <nav className="breadcrumbs" aria-label="Putanja">
        <Link href="/">Početna</Link> / <a href="/prodavnica">Prodavnica</a> /{" "}
        <span aria-current="page">{product.name}</span>
      </nav>
      <div className="product-detail">
        <div className="product-visual-column">
          <div className="product-detail-media">
            {product.imageUrl ? <img src={product.imageUrl} alt={product.imageAlt} /> : <div className="product-placeholder">Fotografija uskoro</div>}
            <div className="product-badges">
              {product.badge ? <strong>{product.badge}</strong> : null}
              {product.isDemo ? <small>DEMO PROIZVOD</small> : null}
            </div>
          </div>
          <div className="product-quick-facts">
            <span><strong>Pakovanje</strong>{product.unit}</span>
            <span><strong>Kategorija</strong>{product.category}</span>
            <span><strong>Poreklo</strong>{product.origin || "Uskoro"}</span>
          </div>
        </div>

        <section className="card purchase-panel" aria-labelledby="porucivanje-title">
          <div className="purchase-heading">
            <div className="tag-row"><span className="tag">{product.category}</span>{product.isDemo ? <span className="tag demo-tag">DEMO</span> : null}</div>
            <h1 id="porucivanje-title">{product.name}</h1>
            <p>{product.shortDescription}</p>
            <div className="detail-price"><strong>{formatMoney(unitPrice)}</strong><span>/ {product.unit}</span>{purchaseType === "subscription" && product.priceRsd > unitPrice ? <s>{formatMoney(product.priceRsd)}</s> : null}</div>
            {delivery ? <p className="next-delivery"><span>●</span> Sledeća dostava: <strong>{formatDate(delivery.deliveryDate)}</strong></p> : null}
          </div>
          <fieldset className="fieldset">
            <legend>Izaberite kupovinu</legend>
            <div className="radio-group">
              <label className="radio-card" htmlFor="kupovina-jednom">
                <input
                  id="kupovina-jednom"
                  type="radio"
                  name="purchaseType"
                  value="one_time"
                  checked={purchaseType === "one_time"}
                  onChange={() => choosePurchaseType("one_time")}
                />
                Jednokratno
                <span className="muted small-text">Samo sledeći put</span>
              </label>
              <label className={`radio-card ${!product.allowSubscription ? "disabled" : ""}`} htmlFor="kupovina-pretplata">
                <input
                  id="kupovina-pretplata"
                  type="radio"
                  name="purchaseType"
                  value="subscription"
                  disabled={!product.allowSubscription}
                  checked={purchaseType === "subscription"}
                  onChange={() => choosePurchaseType("subscription")}
                />
                Redovna · {formatMoney(product.subscriptionPriceRsd)}
                <span className="muted small-text">Pauzirate kad želite</span>
              </label>
            </div>
          </fieldset>

          <div className="purchase-controls">
            {purchaseType === "subscription" ? (
              <label className="field">
                <span>Ritam dostave</span>
                <select value={cadence} onChange={(event) => { const value = event.target.value as DeliveryCadence; setCadence(value); track("delivery_cadence_selected", { productId: product.id, cadence: value }); }}>
                  <option value="weekly">Svake nedelje</option><option value="biweekly">Svake 2 nedelje</option>
                </select>
              </label>
            ) : null}
            <div className="field milk-quantity-field">
              <span id="quantity-label">Litara po dostavi</span>
              <div className="quantity-presets" aria-labelledby="quantity-label">
                {[2, 4, 8].map((value) => <button key={value} type="button" aria-pressed={quantity === value} onClick={() => chooseQuantity(value)}>{value} L</button>)}
              </div>
              <div className="quantity-control" aria-labelledby="quantity-label">
              <button
                type="button"
                aria-label="Smanji količinu"
                onClick={() => chooseQuantity(quantity - 1)}
              >
                −
              </button>
              <input
                aria-label="Količina"
                type="number"
                min="1"
                max="99"
                value={quantity}
                onChange={(event) => chooseQuantity(Number(event.target.value))}
              />
              <button
                type="button"
                aria-label="Povećaj količinu"
                onClick={() => chooseQuantity(quantity + 1)}
              >
                +
              </button>
              </div>
              <small className="muted">{purchaseType === "subscription" ? `${quantity * (cadence === "biweekly" ? 2 : 4)} L mesečno u izabranom ritmu` : `${quantity} L uz sledeću dostavu`}</small>
            </div>
          </div>

          {purchaseType === "one_time" && product.allowSubscription && product.priceRsd > product.subscriptionPriceRsd ? <button className="upsell-switch" type="button" onClick={() => choosePurchaseType("subscription")}><strong>Uštedite {formatMoney((product.priceRsd - product.subscriptionPriceRsd) * quantity)} po isporuci</strong><span>Prebacite na redovnu dostavu →</span></button> : null}
          {purchaseType === "subscription" ? <div className="subscription-value"><span>✓ Ušteda {formatMoney((product.priceRsd - product.subscriptionPriceRsd) * quantity)} po isporuci</span><span>✓ Preskačete ili pauzirate online</span></div> : null}
          <p className="summary-row purchase-total"><span>Ukupno po isporuci</span><strong>{formatMoney(unitPrice * quantity)}</strong></p>
          <button className="button" type="button" disabled={!product.available} onClick={addToCart}>
            {product.available ? (added ? "Dodato u korpu ✓" : "Dodaj u korpu →") : "Trenutno nije dostupno"}
          </button>
          {added ? (
            <a className="button secondary" href="/korpa">
              Otvori korpu
            </a>
          ) : null}
          {purchaseType === "subscription" ? <button className="downsell-link" type="button" onClick={() => choosePurchaseType("one_time")}>Niste spremni za ritam? Uzmite samo sledeću dostavu.</button> : null}
          <p className="purchase-footnote">Bez ugovorne obaveze · Izmene do cutoff roka</p>
        </section>
      </div>

      <section className="product-story-section" aria-labelledby="opis-title">
        <div><p className="eyebrow">O proizvodu</p><h2 id="opis-title">Šta treba da znate.</h2></div>
        <div><p className="lead">{product.description || product.shortDescription}</p>{product.isDemo ? <p className="demo-notice">Ovo je demo sadržaj za razvoj. Fotografiju, deklaraciju i podatke o poreklu zamenite u adminu pre javne objave.</p> : null}</div>
      </section>

      {recommendations.length ? <section className="section cross-sell-section" aria-labelledby="cross-sell-title"><div className="section-heading split-heading"><div><p className="eyebrow">Cross-sell</p><h2 id="cross-sell-title">Dobro ide uz ovo.</h2><p className="lead">Dodajte još nešto za istu dostavu — ritam i količinu i dalje birate zasebno.</p></div><a className="text-link" href="/prodavnica">Cela ponuda →</a></div><div className="product-grid">{recommendations.map((item) => <ProductCard key={item.id} product={item} />)}</div></section> : null}

      <div className="mobile-buy-bar"><div><small>{purchaseType === "subscription" ? "Redovna dostava" : "Jednokratno"}</small><strong>{formatMoney(unitPrice * quantity)}</strong></div><button className="button" type="button" disabled={!product.available} onClick={addToCart}>{added ? "Dodato ✓" : "Dodaj u korpu"}</button></div>
    </div>
  );
}
