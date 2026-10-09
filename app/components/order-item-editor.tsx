"use client";

import { useLocalize, useLocale } from "@/app/lib/i18n/client";
import { useEffect, useState } from "react";
import {
  fetchJson,
  formatDateTime,
  formatMoney,
  normalizeProduct,
  type Product,
} from "../lib/frontend";

type Row = Record<string, unknown>;
export type EditableOrder = {
  order: Row;
  items: Row[];
  editable: boolean;
  cutoffAt: string;
  editReason: string;
};
type Requester = <T>(url: string, init?: RequestInit) => Promise<T>;
export function OrderItemEditor({
  detail,
  request = fetchJson,
  admin = false,
  onSaved,
}: {
  detail: EditableOrder;
  request?: Requester;
  admin?: boolean;
  onSaved: () => void;
}) {
  const localize = useLocalize();
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      detail.items.map((item) => [
        String(item.product_id),
        Number(item.quantity),
      ]),
    ),
  );
  const [note, setNote] = useState(String(detail.order.customer_note || ""));
  const [quote, setQuote] = useState<{
    key: string;
    totalMinor: number;
    deliveryFeeMinor: number;
    discountMinor: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const items = Object.entries(quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([productId, quantity]) => ({
      productId,
      quantity,
      purchaseType: "one_time",
    }));
  const valid =
    items.length > 0 &&
    Object.values(quantities).every(
      (quantity) =>
        Number.isInteger(quantity) && quantity >= 0 && quantity <= 100,
    );
  const quoteBody = JSON.stringify({
    items,
    deliveryDate: detail.order.delivery_date,
    city: detail.order.city,
    postalCode: detail.order.postal_code,
    promoCode: detail.order.promo_code,
  });
  const expired = now >= Date.parse(detail.cutoffAt);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!editing) return;
    const controller = new AbortController();
    fetchJson<{ products: Row[] }>("/api/products", {
      signal: controller.signal,
    })
      .then((result) => setProducts(result.products.map(normalizeProduct)))
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Katalog nije učitan. Zatvorite i pokušajte ponovo.");
      });
    return () => controller.abort();
  }, [editing]);
  useEffect(() => {
    if (!editing || !valid) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchJson<{
        totalMinor: number;
        deliveryFeeMinor: number;
        discountMinor: number;
      }>("/api/cart", {
        method: "POST",
        signal: controller.signal,
        body: quoteBody,
      })
        .then((result) => {
          if (!controller.signal.aborted) {
            setQuote({ ...result, key: quoteBody });
            setError("");
          }
        })
        .catch((cause) => {
          if (!controller.signal.aborted) {
            setQuote(null);
            setError(
              cause instanceof Error ? cause.message : "Obračun nije dostupan.",
            );
          }
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [editing, valid, quoteBody]);
  async function save(cancelling = false) {
    if (busy || expired) return;
    setBusy(true);
    setError("");
    try {
      await request(
        admin
          ? "/api/admin/orders"
          : `/api/account/orders/${encodeURIComponent(String(detail.order.id))}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...(admin ? { id: detail.order.id } : {}),
            expectedUpdatedAt: detail.order.updated_at,
            ...(cancelling
              ? admin
                ? { fulfillmentStatus: "cancelled" }
                : { action: "cancel" }
              : { items, customerNote: note }),
          }),
        },
      );
      setEditing(false);
      setCancel(false);
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Izmena nije sačuvana.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!detail.editable || expired)
    return localize((
      <p className="small-text">
        {expired
          ? "Rok za izmenu i otkazivanje ove dostave je istekao."
          : detail.editReason}
      </p>
    ));
  const catalog = [
    ...products,
    ...detail.items
      .filter(
        (item) => !products.some((product) => product.id === item.product_id),
      )
      .map(
        (item) =>
          ({
            id: String(item.product_id),
            name: String(item.product_name),
            unit: String(item.unit_label),
            priceRsd: Number(item.unit_price_minor) / 100,
            available: false,
          }) as Product,
      ),
  ];
  return localize((
    <section className="form-stack" aria-label="Izmena porudžbine">
      <p className="small-text">
        Izmene i otkazivanje do {formatDateTime(detail.cutoffAt, locale)} (Beograd).
      </p>
      {!editing && !cancel ? (
        <div className="button-row">
          <button
            className="button secondary small"
            onClick={() => setEditing(true)}
          >
            Izmeni proizvode i količine
          </button>
          <button className="text-button" onClick={() => setCancel(true)}>
            Otkaži ovu porudžbinu
          </button>
        </div>
      ) : null}
      {editing ? (
        <>
          <p>
            Unesite 0 da uklonite proizvod. Cene i popust ponovo se obračunavaju
            prema važećem katalogu.
          </p>
          {catalog.map((product) => (
            <label className="field" key={product.id}>
              <span>
                {product.name} · {product.unit} ·{" "}
                {formatMoney(product.priceRsd, locale)}
                {!product.available
                  ? " · trenutno nedostupno, uklonite stavku"
                  : ""}
              </span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={quantities[product.id] ?? 0}
                disabled={busy}
                onChange={(event) =>
                  setQuantities((current) => ({
                    ...current,
                    [product.id]: Number(event.target.value),
                  }))
                }
              />
            </label>
          ))}
          <label className="field">
            <span>Napomena uz porudžbinu</span>
            <textarea
              value={note}
              maxLength={500}
              disabled={busy}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {quote?.key === quoteBody && valid ? (
            <p role="status">
              Novi iznos: <strong>{formatMoney(quote.totalMinor / 100, locale)}</strong>{" "}
              · dostava {formatMoney(quote.deliveryFeeMinor / 100, locale)}
              {quote.discountMinor
                ? ` · popust ${formatMoney(quote.discountMinor / 100, locale)}`
                : ""}
            </p>
          ) : (
            <p role="status">
              {valid
                ? "Obračunavamo novi iznos…"
                : "Izaberite najmanje jedan proizvod, cele količine od 0 do 100."}
            </p>
          )}
          <div className="button-row">
            <button
              className="button small"
              disabled={
                busy ||
                !valid ||
                quote?.key !== quoteBody ||
                products.length === 0
              }
              onClick={() => void save()}
            >
              Sačuvaj porudžbinu
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Odustani od izmene
            </button>
          </div>
        </>
      ) : null}
      {cancel ? (
        <>
          <p>
            Otkazujete samo ovu nenaplaćenu porudžbinu. Ostale dostave ostaju
            zakazane.
          </p>
          <div className="button-row">
            <button
              className="button small"
              disabled={busy}
              onClick={() => void save(true)}
            >
              Potvrdi otkazivanje porudžbine
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setCancel(false)}
            >
              Zadrži porudžbinu
            </button>
          </div>
        </>
      ) : null}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </section>
  ));
}
