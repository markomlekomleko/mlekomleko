"use client";

import { useLocalize } from "@/app/lib/i18n/client";
import Image from "next/image";
import { ProductConfigurator } from "../product-configurator";
import { GoatWaitlistCard } from "../goat-waitlist";
import { milkKind } from "../product-carousel";
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
  // Goat milk off sale: its card collects emails instead (spec 19 Nov 2026, §5).
  const goatWaitlist = !offered.some((product) => milkKind(product) === "goat");

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
          <>
            <div className="offer-grid" data-count={offered.length + (goatWaitlist ? 1 : 0)}>
              {offered.map((product) => (
                <ProductConfigurator key={product.id} product={product} delivery={delivery} loyaltyNote={false} />
              ))}
              {goatWaitlist ? <GoatWaitlistCard /> : null}
            </div>
            {/* One quiet line about the loyalty programme, no section of its own (§13). */}
            <p className="offer-loyalty">💙 Pretplatnicima posle 12 realizovanih dostava poklanjamo 2 l mleka i dostavu.</p>
          </>
        ) : (
          <p className="notice">
            Ponuda se trenutno priprema. Piši nam na <a href="/kontakt">kontakt</a>.
          </p>
        )}
      </div>
    </section>
  ));
}
