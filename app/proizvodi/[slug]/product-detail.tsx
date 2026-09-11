"use client";
/* eslint-disable @next/next/no-img-element -- Optimised catalog images and admin-managed image URLs are served directly. */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAnalytics } from "../../components/analytics-provider";
import { ProductConfigurator } from "../../components/product-configurator";
import { formatDate, formatMoney, type DeliveryWindow, type Product } from "../../lib/frontend";

type Selection = { label: string; totalRsd: number; disabled: boolean };

export function ProductDetail({
  product,
  delivery,
  recommendations,
}: {
  product: Product;
  delivery: DeliveryWindow;
  recommendations: Product[];
}) {
  const { track } = useAnalytics();
  const sentinel = useRef<HTMLDivElement>(null);
  const addToCart = useRef<() => void>(() => {});
  const trackedProduct = useRef("");
  const [selection, setSelection] = useState<Selection>({ label: "", totalRsd: 0, disabled: true });
  const [barVisible, setBarVisible] = useState(false);

  const cutoff = new Intl.DateTimeFormat("sr-Latn-RS", {
    timeZone: "Europe/Belgrade",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(delivery.cutoffAt));

  useEffect(() => {
    if (trackedProduct.current === product.id) return;
    trackedProduct.current = product.id;
    track("view_item", { productId: product.id, productName: product.name });
  }, [product, track]);

  // The buy bar only appears once the real purchase button has scrolled away.
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setBarVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="page-shell product-detail-page">
      <nav className="breadcrumbs" aria-label="Putanja">
        <Link href="/">Početna</Link>
        <span aria-hidden="true">/</span>
        <a href="/prodavnica">Prodavnica</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{product.name}</span>
      </nav>

      <div className="product-detail">
        <div className="product-visual-column">
          <div className="product-detail-media">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.imageAlt}
                width="1080"
                height="1080"
                fetchPriority="high"
              />
            ) : (
              <div className="product-placeholder">Fotografija uskoro</div>
            )}
          </div>
          <div className="product-quick-facts">
            <span>
              <strong>Pakovanje</strong>
              {product.unit} · povratna staklena flaša
            </span>
            {product.origin ? (
              <span>
                <strong>Poreklo</strong>
                {product.origin}
              </span>
            ) : null}
          </div>
        </div>

        <div className="product-buy-column">
          <ProductConfigurator
            product={product}
            delivery={delivery}
            layout="panel"
            onSelectionChange={(value) => {
              addToCart.current = value.addToCart;
              setSelection((current) =>
                current.label === value.label &&
                current.totalRsd === value.totalRsd &&
                current.disabled === value.disabled
                  ? current
                  : { label: value.label, totalRsd: value.totalRsd, disabled: value.disabled },
              );
            }}
          />
          <div ref={sentinel} aria-hidden="true" />
          <p className="next-delivery">
            Sledeća dostava: <strong>{formatDate(delivery.deliveryDate)}</strong>
          </p>
          <p className="purchase-footnote">Izmene za tu dostavu moguće su do {cutoff} h.</p>
        </div>
      </div>

      <section className="product-story-section" aria-labelledby="opis-title">
        <div>
          <p className="eyebrow">O proizvodu</p>
          <h2 id="opis-title">Šta treba da znaš.</h2>
        </div>
        <div>
          <p className="lead">{product.description || product.shortDescription}</p>
        </div>
      </section>

      {recommendations.length ? (
        <section className="section cross-sell-section" aria-labelledby="cross-sell-title">
          <div className="section-head">
            <p className="eyebrow">Još iz naše ponude</p>
            <h2 id="cross-sell-title">Probaj i drugi ukus.</h2>
          </div>
          <div className="offer-grid" data-count={recommendations.length}>
            {recommendations.map((item) => (
              <ProductConfigurator key={item.id} product={item} delivery={delivery} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="buy-bar" data-visible={barVisible && !selection.disabled}>
        <div className="buy-bar-info">
          <small>{selection.label}</small>
          <strong>{formatMoney(selection.totalRsd)}</strong>
        </div>
        <button
          className="button"
          type="button"
          disabled={selection.disabled}
          onClick={() => addToCart.current()}
        >
          Dodaj u korpu
        </button>
      </div>
    </div>
  );
}
