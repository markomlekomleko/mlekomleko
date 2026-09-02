"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ProductCard } from "../components/product-card";
import {
  fetchJson,
  normalizeProduct,
  unwrapList,
  type Product,
} from "../lib/frontend";

export function StoreView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState("Sve");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await fetchJson<unknown>("/api/products");
      setProducts(unwrapList(payload, ["products", "items"]).map(normalizeProduct));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Proizvodi trenutno ne mogu da se učitaju.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadProducts());
  }, [loadProducts]);

  const categories = useMemo(
    () => ["Sve", ...Array.from(new Set(products.map((product) => product.category)))],
    [products],
  );

  const visibleProducts =
    category === "Sve"
      ? products
      : products.filter((product) => product.category === category);

  return (
    <div className="page-shell">
      <header className="page-heading">
        <p className="eyebrow">Prodavnica</p>
        <h1>Izaberite mleko i količinu.</h1>
        <p className="lead">
          Kravlje ili kozje mleko, od 2 litra po dostavi. Izaberite 2, 4 ili 8 L
          jednim dodirom, ili podesite tačnu količinu koja vam odgovara.
        </p>
        <div className="micro-proof"><span>✓ 250 RSD/L kravlje</span><span>✓ 300 RSD/L kozje</span><span>✓ Povratne staklene flaše</span></div>
      </header>

      {loading ? (
        <p className="loading-state" role="status">
          Učitavamo proizvode…
        </p>
      ) : error ? (
        <div className="notice error" role="alert">
          <p>{error}</p>
          <button className="button secondary small" type="button" onClick={loadProducts}>
            Pokušaj ponovo
          </button>
        </div>
      ) : products.length === 0 ? (
        <div className="empty-state">
          <h2>Ponuda je trenutno prazna</h2>
          <p className="muted">
            Proizvodi će se pojaviti čim budu dodati kroz administraciju.
          </p>
        </div>
      ) : (
        <>
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
            <div className="product-grid">
              {visibleProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
