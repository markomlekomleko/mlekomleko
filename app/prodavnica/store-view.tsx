"use client";

import { useEffect, useMemo, useState } from "react";
import { useAnalytics } from "../components/analytics-provider";
import { ProductConfigurator } from "../components/product-configurator";
import { type DeliveryWindow, type Product } from "../lib/frontend";

export function StoreView({
  initialProducts,
  delivery,
}: {
  initialProducts: Product[];
  delivery: DeliveryWindow;
}) {
  const products = initialProducts;
  const { consent, track } = useAnalytics();
  useEffect(() => { if (consent?.analytics || consent?.marketing) track("view_item_list", { item_list_name: "Prodavnica", items: initialProducts.map(product => ({ item_id: product.id, item_name: product.name, price: product.priceRsd })) }); }, [consent, initialProducts, track]);
  const [category, setCategory] = useState("Sve");

  const categories = useMemo(
    () => ["Sve", ...Array.from(new Set(products.map((product) => product.category)))],
    [products],
  );

  const visibleProducts =
    category === "Sve" ? products : products.filter((product) => product.category === category);

  return (
    <div className="page-shell store-page">
      <header className="section-head">
        <p className="eyebrow">Prodavnica</p>
        <h1>Izaberi svoje mleko</h1>
        <p className="lead">Odaberi količinu i koliko često želiš dostavu.</p>
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
            <div className="tabs" aria-label="Filter kategorija">
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
            <div className="offer-grid" data-count={visibleProducts.length}>
              {visibleProducts.map((product) => (
                <ProductConfigurator key={product.id} product={product} delivery={delivery} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
