import { BundleOffers } from "../bundle-offers";
import { glyphPaths } from "../brand-glyph";
import { ProductConfigurator } from "../product-configurator";
import { homeCopy } from "../../lib/content";
import type { BundleOffer, DeliveryWindow, Product } from "../../lib/frontend";

const copy = homeCopy.offer;

// The logo's ragged teal blob, redrawn on the stamp's 160 grid: 72 points round a circle
// of radius 76, each pushed in or out by a fixed pseudo-random amount (a sine hash, so
// server and client draw the same edge) plus a slow wobble that keeps it from reading
// as a gear.
const blobPath = (() => {
  const points = Array.from({ length: 72 }, (_, i) => {
    const angle = (i / 72) * Math.PI * 2;
    const hash = Math.sin(i * 12.9898) * 43758.5453;
    const jitter = (hash - Math.floor(hash) - 0.5) * 3.2;
    const radius = 76 + jitter + Math.sin(angle * 3 + 0.6) * 1.6;
    return `${(80 + Math.cos(angle) * radius).toFixed(1)} ${(80 + Math.sin(angle) * radius).toFixed(1)}`;
  });
  return `M${points.join("L")}Z`;
})();

/**
 * The "house stamp" beside the offer heading: the logo's ragged teal blob with the band
 * words running in white around a white cow glyph, as on the logo. Purely decorative, so
 * it is hidden from assistive technology and carries no text of its own beyond the
 * approved band copy.
 */
function OfferStamp() {
  const ring = `${homeCopy.band.slice(0, 4).join(" • ")} • `;
  return (
    <svg className="offer-stamp" viewBox="0 0 160 160" aria-hidden="true" focusable="false">
      <path className="offer-stamp-disc" d={blobPath} />
      <circle className="offer-stamp-inner" cx="80" cy="80" r="44" />
      <defs>
        <path id="offer-stamp-ring" d="M80 80m-60 0a60 60 0 1 1 120 0a60 60 0 1 1 -120 0" />
      </defs>
      <g className="offer-stamp-spin">
        <text className="offer-stamp-text">
          <textPath href="#offer-stamp-ring" textLength="374" lengthAdjust="spacing">
            {ring}
          </textPath>
        </text>
      </g>
      <path className="offer-stamp-glyph" d={glyphPaths.cow} transform="translate(56 56) scale(0.75)" />
    </svg>
  );
}

export function OfferSection({
  products,
  bundles,
  delivery,
}: {
  products: Product[];
  bundles: BundleOffer[];
  delivery: DeliveryWindow;
}) {
  const sellable = products.filter((product) => product.available);
  const offered = (sellable.length ? sellable : products).slice(0, 4);

  return (
    <section id="izaberite-mleko" className="offer" aria-labelledby="offer-title">
      <div className="page-shell">
        <div className="offer-head">
          <div className="section-head">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h2 id="offer-title">{copy.title}</h2>
            <p className="lead">{copy.lead}</p>
            <a className="button secondary offer-store-link" href="/prodavnica">
              {copy.storeLink}
            </a>
          </div>
          <OfferStamp />
        </div>

        {offered.length ? (
          <div className="offer-grid" data-count={offered.length}>
            {offered.map((product) => (
              <ProductConfigurator key={product.id} product={product} delivery={delivery} />
            ))}
          </div>
        ) : (
          <p className="notice">
            Ponuda se trenutno priprema. Pogledaj <a href="/prodavnica">prodavnicu</a> ili nas kontaktiraj.
          </p>
        )}

        <BundleOffers products={products} bundles={bundles} delivery={delivery} />
      </div>
    </section>
  );
}
