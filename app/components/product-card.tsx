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

  function addOnce() {
    addItem({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      unit: product.unit,
      unitPriceRsd: product.priceRsd,
      purchaseType: "one_time",
      quantity: 1,
    });
    track("add_to_cart", { productId: product.id, purchaseType: "one_time", quantity: 1, valueRsd: product.priceRsd });
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
      quantity: 1,
    });
    track("add_to_cart", { productId: product.id, purchaseType: "subscription", cadence: "weekly", quantity: 1, valueRsd: product.subscriptionPriceRsd });
    track("subscription_selected", { productId: product.id, source: "product_card" });
    setAdded("regular");
  }

  return (
    <article className="card product-card">
      <a className="product-image" href={`/proizvodi/${encodeURIComponent(product.slug)}`} aria-label={`Pogledaj ${product.name}`}>
        {product.imageUrl ? <img src={product.imageUrl} alt={product.imageAlt} loading="lazy" /> : <span>Fotografija uskoro</span>}
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
          <div className="product-actions subscription-first-actions">
            {product.allowSubscription ? <button className="button small" type="button" disabled={!product.available} onClick={addRegular}>{product.available ? (added === "regular" ? "Redovno dodato ✓" : `Redovno · ${formatMoney(product.subscriptionPriceRsd)}`) : "Nije dostupno"}</button> : null}
            <button className="button secondary small" type="button" disabled={!product.available} onClick={addOnce}>{added === "once" ? "Dodato jednom ✓" : `Jednom · ${formatMoney(product.priceRsd)}`}</button>
            <a className="text-link product-rhythm-link" href={`/proizvodi/${encodeURIComponent(product.slug)}`}>Promeni ritam ili količinu →</a>
          </div>
        </div>
      </div>
    </article>
  );
}
