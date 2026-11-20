"use client";

import { useLocalize, useLocale } from "@/app/lib/i18n/client";
import { useState } from "react";
import { useAnalytics } from "./analytics-provider";
import { useCart } from "./cart-provider";
import {
  formatDate,
  formatMoney,
  quantityLabel,
  type BundleOffer,
  type DeliveryWindow,
  type Product,
  type PurchaseType,
} from "../lib/frontend";

type Line = BundleOffer["lines"][number];

/**
 * Packages are a shortcut, never a separate price.
 *
 * `listBundles(false)` already hides a package with a product off sale, and this view
 * additionally refuses one whose products are missing from the public catalogue, so a
 * package is never offered under a name its contents do not match
 * (docs/AOV-LTV-SPECIFIKACIJA.md G04). The price is the sum of the real line prices plus
 * delivery, worked out like the product card and charged by the same server quote.
 */
export function BundleOffers({
  products,
  bundles,
  delivery,
}: {
  products: Product[];
  bundles: BundleOffer[];
  delivery: DeliveryWindow;
}) {
  const localize = useLocalize();
  const { addItems, ready, openDrawer } = useCart();
  const { track } = useAnalytics();
  const [preview, setPreview] = useState("");
  const [added, setAdded] = useState("");
  const [error, setError] = useState("");

  const complete = bundles.filter((bundle) => bundle.lines.length > 0 && bundle.lines.every((line) => {
    const product = products.find((candidate) => candidate.id === line.productId);
    return Boolean(product?.available) && (line.purchaseType !== "subscription" || product!.allowSubscription);
  }));

  if (!complete.length) return null;

  function addBundle(bundle: BundleOffer, mode: PurchaseType, valueRsd: number) {
    const resolved: Array<{ line: Line; product: Product }> = [];
    for (const line of bundle.lines) {
      const product = products.find((candidate) => candidate.id === line.productId);
      if (product?.available) resolved.push({ line, product });
    }
    // All lines or none: a half-added package must never reach the cart.
    if (resolved.length !== bundle.lines.length) {
      setError("Paket trenutno nije dostupan u celini. Izaberi proizvode pojedinačno.");
      return;
    }
    setError("");
    addItems(resolved.map(({ line, product }) => {
      const purchaseType = linePurchaseType(line, mode);
      return {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        unit: product.unit,
        unitPriceRsd: linePrice(line, purchaseType) / 100,
        purchaseType,
        cadence: purchaseType === "subscription" ? "weekly" as const : undefined,
        quantity: line.quantity,
      };
    }));
    // One user action, one add_to_cart event.
    track("add_to_cart", {
      bundleId: bundle.id,
      placement: "shop_bundle",
      purchaseType: mode,
      itemCount: bundle.lines.length,
      valueRsd,
      currency: "RSD",
      amountBasis: mode === "subscription" ? "package" : "per_delivery",
    });
    setPreview("");
    setAdded(bundle.id);
    openDrawer();
  }

  return localize((
    <section className="bundles" aria-labelledby="bundle-title">
      <div className="section-head">
        <p className="eyebrow">Lakši izbor</p>
        <h2 id="bundle-title">Gotovi paketi</h2>
        <p className="lead">Paket je prečica: sve stavke stižu u korpu odjednom, po istim cenama kao kad ih biraš pojedinačno.</p>
      </div>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      <div className="bundle-grid">
        {complete.map((bundle) => (
          <BundleCard
            key={bundle.id}
            bundle={bundle}
            delivery={delivery}
            ready={ready}
            open={preview === bundle.id}
            added={added === bundle.id}
            onOpen={() => { setPreview(bundle.id); setAdded(""); track("select_item", { bundleId: bundle.id, placement: "shop_bundle" }); }}
            onClose={() => setPreview("")}
            onAdd={(mode, valueRsd) => addBundle(bundle, mode, valueRsd)}
          />
        ))}
      </div>
    </section>
  ));
}

/** In the one-time choice every line is bought once; in the subscription choice the lines keep the way the owner set them. */
function linePurchaseType(line: Line, mode: PurchaseType): PurchaseType {
  return mode === "one_time" ? "one_time" : line.purchaseType;
}

function linePrice(line: Line, purchaseType: PurchaseType) {
  return purchaseType === "subscription" ? line.subscriptionUnitPriceMinor ?? line.unitPriceMinor : line.oneTimeUnitPriceMinor;
}

function BundleCard({
  bundle,
  delivery,
  ready,
  open,
  added,
  onOpen,
  onClose,
  onAdd,
}: {
  bundle: BundleOffer;
  delivery: DeliveryWindow;
  ready: boolean;
  open: boolean;
  added: boolean;
  onOpen: () => void;
  onClose: () => void;
  onAdd: (mode: PurchaseType, valueRsd: number) => void;
}) {
  const localize = useLocalize();
  const locale = useLocale();
  // Like the product card: the subscription is the first choice where the package has one.
  const [mode, setMode] = useState<PurchaseType>(bundle.offersSubscription ? "subscription" : "one_time");
  const deliveries = mode === "subscription" ? bundle.packageDeliveries : 1;
  const goodsMinor = bundle.lines.reduce((sum, line) => {
    const purchaseType = linePurchaseType(line, mode);
    return sum + linePrice(line, purchaseType) * line.quantity * (purchaseType === "subscription" ? bundle.packageDeliveries : 1);
  }, 0);
  const shippingKnown = typeof delivery.deliveryFeeMinor === "number";
  const threshold = Number(delivery.freeDeliveryThresholdMinor) || 0;
  const shippingPerDeliveryMinor = shippingKnown && !(threshold > 0 && goodsMinor >= threshold) ? Number(delivery.deliveryFeeMinor) : 0;
  const totalMinor = goodsMinor + shippingPerDeliveryMinor * deliveries;
  const mixed = mode === "subscription" && bundle.lines.some((line) => line.purchaseType === "one_time");
  /** Products of one (first) delivery in the given choice. */
  const priceOf = (choice: PurchaseType) => formatMoney(bundle.lines.reduce((sum, line) => sum + linePrice(line, linePurchaseType(line, choice)) * line.quantity, 0) / 100, locale);

  return localize((
    <article className="bundle-card" data-mode={mode}>
      {bundle.isFeatured ? <p className="bundle-flag">Predlog</p> : null}
      {bundle.eyebrow ? <p className="bundle-eyebrow">{bundle.eyebrow}</p> : null}
      <h3>{bundle.name}</h3>
      {bundle.description ? <p className="muted">{bundle.description}</p> : null}
      <ul aria-label="Sadržaj paketa po dostavi">
        {bundle.lines.map((line) => {
          const purchaseType = linePurchaseType(line, mode);
          return (
            <li key={line.id}>
              <span>{quantityLabel(line.quantity, line.unitLabel)} · {line.productName}</span>
              <small>{purchaseType === "subscription" ? "svake nedelje" : mixed ? "samo uz prvu dostavu" : "jednokratno"}</small>
            </li>
          );
        })}
      </ul>

      {bundle.offersSubscription ? (
        <fieldset className="bundle-modes" disabled={!ready}>
          <legend className="sr-only">Način kupovine paketa</legend>
          <div className="purchase-types">
            <button type="button" className="purchase-type" aria-pressed={mode === "subscription"} onClick={() => setMode("subscription")}>
              <span className="purchase-type-name">Pretplata</span>
              <strong>{priceOf("subscription")}</strong>
              <small>{`po dostavi · paket od ${bundle.packageDeliveries} nedeljne dostave`}</small>
            </button>
            <button type="button" className="purchase-type" aria-pressed={mode === "one_time"} onClick={() => setMode("one_time")}>
              <span className="purchase-type-name">Jednokratno</span>
              <strong>{priceOf("one_time")}</strong>
              <small>jedna dostava</small>
            </button>
          </div>
        </fieldset>
      ) : null}

      <div className="configurator-receipt bundle-receipt">
        {mode === "subscription" ? (
          <>
            <p><span>{!mixed ? "Proizvodi po dostavi" : "Proizvodi prve dostave"}</span><strong>{priceOf(mode)}</strong></p>
            {shippingKnown ? <p><span>Dostava po dostavi</span><strong>{formatMoney(shippingPerDeliveryMinor / 100, locale)}</strong></p> : null}
            <p className="configurator-package-total"><span>{`Paket od ${deliveries} dostave, plaćen unapred`}</span> <strong>{formatMoney((shippingKnown ? totalMinor : goodsMinor) / 100, locale)}</strong></p>
          </>
        ) : (
          <>
            <p><span>Proizvodi</span><strong>{formatMoney(goodsMinor / 100, locale)}</strong></p>
            {shippingKnown ? <p><span>Dostava</span><strong>{formatMoney(shippingPerDeliveryMinor / 100, locale)}</strong></p> : null}
            <p className="configurator-package-total"><span>Ukupno</span> <strong>{formatMoney((shippingKnown ? totalMinor : goodsMinor) / 100, locale)}</strong></p>
          </>
        )}
        {!shippingKnown ? <p className="configurator-occurrences">Dostava nije uključena u ovaj iznos.</p> : null}
      </div>

      {added ? <p className="notice success" role="status">Paket je u korpi.</p> : null}

      {open ? (
        <div className="bundle-preview">
          <p>
            {mode === "subscription"
              ? `Prva dostava: ${formatDate(delivery.deliveryDate, locale)}. Zatim još ${deliveries - 1} nedeljne dostave istog dana u nedelji. Ceo paket plaćaš unapred.`
              : `Dostava: ${formatDate(delivery.deliveryDate, locale)}. Jedna dostava, bez pretplate.`}
          </p>
          <button className="button" type="button" disabled={!ready} onClick={() => onAdd(mode, totalMinor / 100)}>
            Dodaj paket u korpu
          </button>
          <button className="text-button" type="button" onClick={onClose}>
            Odustani
          </button>
        </div>
      ) : (
        <button className="button secondary" type="button" disabled={!ready} onClick={onOpen}>
          Izaberi paket
        </button>
      )}
    </article>
  ));
}
