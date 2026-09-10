"use client";

import { useState } from "react";
import { useAnalytics } from "./analytics-provider";
import { useCart } from "./cart-provider";
import { formatMoney, type BundleOffer, type Product } from "../lib/frontend";

export function BundleOffers({ products, bundles }: { products: Product[]; bundles: BundleOffer[] }) {
  const { addItem, ready } = useCart();
  const { track } = useAnalytics();
  const [added, setAdded] = useState("");

  function addBundle(bundle: BundleOffer) {
    bundle.lines.forEach((line) => {
      const product = products.find((candidate) => candidate.id === line.productId);
      if (!product) return;
      addItem({
        productId: product.id,
        slug: product.slug,
        name: product.name,
        unit: product.unit,
        unitPriceRsd: line.unitPriceMinor / 100,
        purchaseType: line.purchaseType,
        cadence: line.cadence ?? undefined,
        quantity: line.quantity,
      });
    });
    setAdded(bundle.id);
    track("add_to_cart", { bundleId: bundle.id, bundleName: bundle.name, itemCount: bundle.lines.length, valueRsd: bundle.perDeliveryMinor / 100 });
  }

  if (!bundles.length) return null;
  return (
    <section className="section bundle-section" aria-labelledby="bundle-title">
      <div className="section-heading split-heading">
        <div><p className="eyebrow">Pametne preporuke</p><h2 id="bundle-title">Počnite paketom, promenite šta god želite.</h2><p className="lead">Svaki paket je samo prečica: u korpi i dalje menjate količinu i ritam po proizvodu.</p></div>
        <a className="text-link" href="/prodavnica">Ili birajte pojedinačno →</a>
      </div>
      <div className="bundle-grid">
        {bundles.map((bundle) => (
          <article className={`bundle-card ${bundle.isFeatured ? "featured" : ""}`} key={bundle.id}>
            {bundle.isFeatured ? <span className="bundle-ribbon">PREPORUČENO</span> : null}
            <p className="eyebrow">{bundle.eyebrow}</p>
            <h3>{bundle.name}</h3>
            <p className="muted">{bundle.description}</p>
            <ul>{bundle.lines.map((item) => <li key={item.id}><span>{item.quantity}× {item.productName}</span><small>{item.purchaseType === "one_time" ? "samo sledeći put" : item.cadence === "biweekly" ? "svake 2 nedelje" : "svake nedelje"}</small></li>)}</ul>
            <div className="bundle-price"><strong>{formatMoney(bundle.perDeliveryMinor / 100)}</strong><span>po prikazanoj dostavi</span>{bundle.savingPerDeliveryMinor > 0 ? <small>Štedite {formatMoney(bundle.savingPerDeliveryMinor / 100)} po dostavi</small> : null}</div>
            {added === bundle.id ? <a className="button" href="/korpa">Nastavi na kupovinu →</a> : <button className="button" type="button" disabled={!ready} onClick={() => addBundle(bundle)}>Dodaj paket</button>}
          </article>
        ))}
      </div>
    </section>
  );
}
