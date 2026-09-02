"use client";
/* eslint-disable @next/next/no-img-element -- Product sources are admin-managed and local demo assets are already optimized. */

import { useState } from "react";
import type { Product } from "../lib/frontend";
import { formatMoney } from "../lib/frontend";
import { useCart } from "./cart-provider";
import { useAnalytics } from "./analytics-provider";

export function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart();
  const { track } = useAnalytics();
  const [added, setAdded] = useState<"once" | "regular" | "">("");
  const [quantity, setQuantity] = useState(2);
  const quantityLabelId = `kolicina-${product.id}`;

  function chooseQuantity(value: number) {
    setQuantity(Math.min(99, Math.max(1, Math.round(value) || 1)));
    setAdded("");
  }

  function addOnce() {
    addItem({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      unit: product.unit,
      unitPriceRsd: product.priceRsd,
      purchaseType: "one_time",
      quantity,
    });
    track("add_to_cart", { productId: product.id, purchaseType: "one_time", quantity, valueRsd: product.priceRsd * quantity });
    setAdded("once");
  }

  function addRegular() {
    addItem({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      unit: product.unit,
      unitPriceRsd: product.subscriptionPriceRsd,
      purchaseType: "subscription",
      cadence: "weekly",
      quantity,
    });
    track("add_to_cart", { productId: product.id, purchaseType: "subscription", cadence: "weekly", quantity, valueRsd: product.subscriptionPriceRsd * quantity });
    track("subscription_selected", { productId: product.id, source: "product_card" });
    setAdded("regular");
  }

  return (
    <article className="card product-card">
      <a className="product-image" href={`/proizvodi/${encodeURIComponent(product.slug)}`} aria-label={`Pogledaj ${product.name}`}>
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.imageAlt}
            width="1080"
            height="1080"
            loading="lazy"
          />
        ) : <span>Fotografija uskoro</span>}
        <span className="product-badges">
          {product.badge ? <strong>{product.badge}</strong> : null}
          {product.isDemo ? <small>DEMO</small> : null}
        </span>
      </a>
      <div className="product-card-body">
        <div>
          <span className="tag">{product.category}</span>
          <h2 className="product-title">
          <a href={`/proizvodi/${encodeURIComponent(product.slug)}`}>
            {product.name}
          </a>
          </h2>
          <p className="muted product-description">{product.shortDescription}</p>
        </div>
        <div className="product-meta">
          <div className="price-stack">
            <p className="price">{formatMoney(product.priceRsd)} <span>/ {product.unit}</span></p>
            {product.compareAtPriceRsd && product.compareAtPriceRsd > product.priceRsd ? <s>{formatMoney(product.compareAtPriceRsd)}</s> : null}
            {product.allowSubscription && product.subscriptionPriceRsd < product.priceRsd ? <small>Redovna dostava od {formatMoney(product.subscriptionPriceRsd)}</small> : null}
          </div>
          <div className="card-quantity">
            <div className="card-quantity-heading"><span id={quantityLabelId}>Litara po dostavi</span><strong>{quantity} L</strong></div>
            <div className="quantity-presets" aria-labelledby={quantityLabelId}>
              {[2, 4, 8].map((value) => <button key={value} type="button" aria-pressed={quantity === value} onClick={() => chooseQuantity(value)}>{value} L</button>)}
            </div>
            <div className="quantity-control card-quantity-control" aria-labelledby={quantityLabelId}>
              <button type="button" aria-label={`Smanji količinu za ${product.name}`} onClick={() => chooseQuantity(quantity - 1)}>−</button>
              <input aria-label={`Količina za ${product.name} u litrima`} type="number" min="1" max="99" value={quantity} onChange={(event) => chooseQuantity(Number(event.target.value))} />
              <button type="button" aria-label={`Povećaj količinu za ${product.name}`} onClick={() => chooseQuantity(quantity + 1)}>+</button>
            </div>
            <small>{quantity * 4} L mesečno uz nedeljnu dostavu</small>
          </div>
          <div className="product-actions subscription-first-actions">
            {product.allowSubscription ? <button className="button small" type="button" disabled={!product.available} onClick={addRegular}>{product.available ? (added === "regular" ? "Redovno dodato ✓" : `Redovno · ${formatMoney(product.subscriptionPriceRsd * quantity)}`) : "Nije dostupno"}</button> : null}
            <button className="button secondary small" type="button" disabled={!product.available} onClick={addOnce}>{added === "once" ? "Dodato jednom ✓" : `Jednom · ${formatMoney(product.priceRsd * quantity)}`}</button>
            <a className="text-link product-rhythm-link" href={`/proizvodi/${encodeURIComponent(product.slug)}`}>Promeni ritam ili količinu →</a>
          </div>
        </div>
      </div>
    </article>
  );
}
