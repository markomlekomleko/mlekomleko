"use client";

import { useLocalize } from "@/app/lib/i18n/client";
import Image from "next/image";
import { ProductConfigurator } from "../product-configurator";
import { homeCopy } from "../../lib/content";
import type { BundleOffer, DeliveryWindow, Product } from "../../lib/frontend";

const copy = homeCopy.offer;

export function OfferSection({
  products,
  delivery,
}: {
  products: Product[];
  /** Still passed by the page; the trimmed shop shows only the two milks. */
  bundles?: BundleOffer[];
  delivery: DeliveryWindow;
}) {
  const localize = useLocalize();
  const sellable = products.filter((product) => product.available);
  const offered = (sellable.length ? sellable : products).slice(0, 4);

  return localize((
    <section id="izaberite-mleko" className="offer" aria-labelledby="offer-title">
      <div className="page-shell">
        <div className="offer-head">
          <div className="section-head">
            <h2 id="offer-title">{copy.title}</h2>
            <p className="lead">{copy.lead}</p>
          </div>
          {/* The brand's own goat-and-cow mark as the section's sticker. */}
          <Image className="offer-stamp" src="/images/mleko-i-mleko-logo-mark.png" alt="" width={148} height={148} sizes="148px" />
        </div>

        {offered.length ? (
          <div className="offer-grid" data-count={offered.length}>
            {offered.map((product) => (
              <ProductConfigurator key={product.id} product={product} delivery={delivery} />
            ))}
          </div>
        ) : (
          <p className="notice">
            Ponuda se trenutno priprema. Piši nam na <a href="/kontakt">kontakt</a>.
          </p>
        )}
      </div>
    </section>
  ));
}
