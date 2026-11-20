"use client";

import { useLocalize } from "@/app/lib/i18n/client";
import { useEffect, useMemo, useState } from "react";
import { useAnalytics } from "../components/analytics-provider";
import { BundleOffers } from "../components/bundle-offers";
import { ProductConfigurator } from "../components/product-configurator";
import { GoatWaitlistCard } from "../components/goat-waitlist";
import { milkKind } from "../components/product-carousel";
import { type BundleOffer, type DeliveryWindow, type Product } from "../lib/frontend";

export function StoreView({
  initialProducts,
  bundles = [],
  delivery,
}: {
  initialProducts: Product[];
  /** Active packages; the section renders only when at least one is complete. */
  bundles?: BundleOffer[];
  delivery: DeliveryWindow;
}) {
  const localize = useLocalize();
  const products = initialProducts;
  const { consent, track } = useAnalytics();
  useEffect(() => { if (consent?.analytics || consent?.marketing) track("view_item_list", { item_list_name: "Prodavnica", items: initialProducts.map(product => ({ item_id: product.id, item_name: product.name, price: product.priceRsd })) }); }, [consent, initialProducts, track]);
  const [category, setCategory] = useState("Sve");

  const categories = useMemo(
    () => ["Sve", ...Array.from(new Set(products.map((product) => product.category)))],
    [products],
  );

  const goatWaitlist = !products.some((product) => milkKind(product) === "goat");
  const visibleProducts =
    category === "Sve" ? products : products.filter((product) => product.category === category);

  return localize((
    <div className="page-shell store-page">
      <header className="section-head">
        <h1>Izaberi svoje mleko</h1>
        <p className="lead">Domaće sirovo mleko, u povratnoj staklenoj flaši, do tvojih vrata. Izaberi pretplatu ili jednokratnu kupovinu i količinu po dostavi.</p>
      </header>

      {products.length === 0 ? (
        <div className="empty-state">
          <h2>Ponuda je trenutno prazna</h2>
          <p className="muted">Proizvodi će se pojaviti čim budu dodati kroz administraciju.</p>
        </div>
      ) : (
        <>
          <h2 className="sr-only">Proizvodi i izbor dostave</h2>
          {categories.length > 2 ? (
            <div className="tabs" role="group" aria-label="Filter kategorija">
              {categories.map((item) => (
                <button
                  className="tab"
                  type="button"
                  aria-pressed={category === item}
                  key={item}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}
          {visibleProducts.length === 0 ? (
            <p className="empty-state">Nema proizvoda u izabranoj kategoriji.</p>
          ) : (
            <div className="offer-grid" data-count={visibleProducts.length + (goatWaitlist ? 1 : 0)}>
              {visibleProducts.map((product) => (
                <ProductConfigurator key={product.id} product={product} delivery={delivery} />
              ))}
              {goatWaitlist ? <GoatWaitlistCard /> : null}
            </div>
          )}
          {bundles.length ? <BundleOffers products={products} bundles={bundles} delivery={delivery} /> : null}
        </>
      )}
    </div>
  ));
}
