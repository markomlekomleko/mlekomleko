"use client";
/* eslint-disable @next/next/no-img-element -- Catalog photography is already optimized; custom admin image URLs are also supported. */

import type { Product } from "../lib/frontend";
import { formatMoney } from "../lib/frontend";
import { useAnalytics } from "./analytics-provider";

export function ProductCard({ product }: { product: Product }) {
  const { track } = useAnalytics();
  const href = `/proizvodi/${encodeURIComponent(product.slug)}`;
  const select = () => track("select_item", { productId: product.id, source: "product_card" });

  return (
    <article className="product-card">
      <a className="product-image" href={href} aria-label={`Pogledaj ${product.name}`} onClick={select}>
        {product.imageUrl ? <img src={product.imageUrl} alt={product.imageAlt} width="1080" height="1080" loading="lazy" /> : <span>Fotografija uskoro</span>}
        {product.isDemo ? <span className="product-badges"><small>DEMO</small></span> : null}
      </a>
      <div className="product-card-body">
        <div className="product-card-heading">
          <div>
            <p className="product-category">{product.category} · {product.unit}</p>
            <h2 className="product-title"><a href={href} onClick={select}>{product.name}</a></h2>
          </div>
          <p className="price">{formatMoney(product.priceRsd)}<span> / {product.unit}</span></p>
        </div>
        <p className="muted product-description">{product.shortDescription}</p>
        {product.allowSubscription && product.subscriptionPriceRsd < product.priceRsd ? <p className="product-subscription-price">Redovna dostava od {formatMoney(product.subscriptionPriceRsd)} / {product.unit}</p> : null}
        <a className="product-select" href={href} onClick={select}>
          {product.available ? "Izaberi količinu i ritam" : "Pogledaj proizvod · trenutno nedostupno"}<span aria-hidden="true">↗</span>
        </a>
      </div>
    </article>
  );
}
