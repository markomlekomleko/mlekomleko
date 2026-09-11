"use client";

import { useState } from "react";
import { useAnalytics } from "./analytics-provider";
import { useCart } from "./cart-provider";
import {
  cadenceLabel,
  formatDate,
  formatMoney,
  quantityLabel,
  type BundleOffer,
  type DeliveryWindow,
  type Product,
} from "../lib/frontend";

/**
 * Packages are a shortcut, never a separate price.
 *
 * `listBundles(false)` already hides a package whose component is inactive, and this
 * view additionally refuses to render one whose products are missing from the public
 * catalog, so a package is never offered under a name its contents do not match
 * (docs/AOV-LTV-SPECIFIKACIJA.md G04). No bundle discount is claimed: the price is the
 * sum of the real line prices.
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
  const { addItems, ready, openDrawer } = useCart();
  const { track } = useAnalytics();
  const [preview, setPreview] = useState<string>("");
  const [error, setError] = useState("");

  const complete = bundles.filter((bundle) => {
    if (!bundle.lines.length) return false;
    return bundle.lines.every((line) => {
      const product = products.find((candidate) => candidate.id === line.productId);
      return Boolean(product?.available) && (line.purchaseType !== "subscription" || product!.allowSubscription);
    });
  });

  if (!complete.length) return null;

  function addBundle(bundle: BundleOffer) {
    const resolved: Array<{ line: BundleOffer["lines"][number]; product: Product }> = [];
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
    addItems(
      resolved.map(({ line, product }) => ({
        productId: product.id,
        slug: product.slug,
        name: product.name,
        unit: product.unit,
        unitPriceRsd: line.unitPriceMinor / 100,
        purchaseType: line.purchaseType,
        cadence: line.cadence ?? undefined,
        quantity: line.quantity,
      })),
    );
    // One user action, one add_to_cart event.
    track("add_to_cart", {
      bundleId: bundle.id,
      placement: "home_bundle",
      itemCount: bundle.lines.length,
      valueRsd: bundle.perDeliveryMinor / 100,
      amountBasis: "per_delivery",
    });
    setPreview("");
    openDrawer();
  }

  return (
    <section className="bundles" aria-labelledby="bundle-title">
      <div className="section-head">
        <p className="eyebrow">Lakši izbor</p>
        <h3 id="bundle-title">Gotove kombinacije</h3>
        <p className="lead">Paket je prečica. U korpi i dalje menjaš količinu i ritam po proizvodu.</p>
      </div>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="bundle-grid">
        {complete.map((bundle) => {
          const open = preview === bundle.id;
          const hasSubscription = bundle.lines.some((line) => line.purchaseType === "subscription");
          return (
            <article className="bundle-card" key={bundle.id}>
              {bundle.isFeatured ? <p className="bundle-flag">Predlog</p> : null}
              <h4>{bundle.name}</h4>
              <p className="muted">{bundle.description}</p>
              <ul>
                {bundle.lines.map((line) => (
                  <li key={line.id}>
                    <span>{quantityLabel(line.quantity, line.unitLabel)} {line.productName}</span>
                    <small>
                      {line.purchaseType === "one_time"
                        ? "jednokratno"
                        : cadenceLabel(line.cadence ?? undefined).toLocaleLowerCase("sr-Latn")}
                    </small>
                  </li>
                ))}
              </ul>
              <p className="bundle-price">
                <strong>{formatMoney(bundle.perDeliveryMinor / 100)}</strong>
                <span>proizvodi po prvoj zajedničkoj dostavi</span>
                <small>Dostava nije uključena u ovaj iznos.</small>
              </p>
              {open ? (
                <div className="bundle-preview">
                  <p>
                    Prva dostava <strong>{formatDate(delivery.deliveryDate)}</strong>.
                    {hasSubscription
                      ? " Redovne stavke se ponavljaju do izmene ili pauze."
                      : " Stavke su jednokratne, samo za ovu dostavu."}
                  </p>
                  <button className="button" type="button" disabled={!ready} onClick={() => addBundle(bundle)}>
                    Dodaj paket u korpu
                  </button>
                  <button className="text-button" type="button" onClick={() => setPreview("")}>
                    Odustani
                  </button>
                </div>
              ) : (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    setPreview(bundle.id);
                    track("select_item", { bundleId: bundle.id, placement: "home_bundle" });
                  }}
                >
                  Izaberi paket
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
