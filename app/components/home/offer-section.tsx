import { BundleOffers } from "../bundle-offers";
import { ProductConfigurator } from "../product-configurator";
import type { BundleOffer, DeliveryWindow, Product } from "../../lib/frontend";

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
        <div className="section-head">
          <p className="eyebrow">01 / Ponuda</p>
          <h2 id="offer-title">Izaberi svoje mleko</h2>
          <p className="lead">Odaberi količinu i koliko često želiš dostavu.</p>
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
