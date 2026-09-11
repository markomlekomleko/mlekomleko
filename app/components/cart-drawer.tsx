"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnalytics } from "./analytics-provider";
import { useCart } from "./cart-provider";
import {
  MAX_QUANTITY,
  cadenceLabel,
  fetchJson,
  formatDate,
  formatDateTime,
  formatMoney,
  normalizeProduct,
  pluralUnits,
  quantityLabel,
  type CartQuote,
  type DeliveryCadence,
  type Product,
  type PurchaseType,
} from "../lib/frontend";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function CartDrawer() {
  const { items, ready, drawerOpen, closeDrawer, updateItem, removeItem, addItem } = useCart();
  const { track } = useAnalytics();
  const panel = useRef<HTMLDivElement>(null);
  // The quote is stored with the selection it answers, so a late reply for an older
  // selection can never be shown as the final price (D07).
  const [quoted, setQuoted] = useState<{ key: string; value: CartQuote } | null>(null);
  const [quoteError, setQuoteError] = useState<{ key: string; message: string } | null>(null);
  const [dismissedOffer, setDismissedOffer] = useState("");
  const [offerBusy, setOfferBusy] = useState(false);
  const [offerError, setOfferError] = useState("");
  const seenOffer = useRef("");

  const quoteKey = useMemo(
    () =>
      JSON.stringify(
        items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          purchaseType: item.purchaseType,
          cadence: item.cadence ?? null,
        })),
      ),
    [items],
  );

  useEffect(() => {
    if (!ready || items.length === 0) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void fetchJson<CartQuote>("/api/cart", {
        method: "POST",
        body: JSON.stringify({
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            purchaseType: item.purchaseType,
            cadence: item.cadence,
          })),
        }),
      })
        .then((value) => {
          if (!active) return;
          setQuoted({ key: quoteKey, value });
          setQuoteError(null);
        })
        .catch((error: unknown) => {
          if (!active) return;
          setQuoteError({
            key: quoteKey,
            message: error instanceof Error ? error.message : "Obračun trenutno nije dostupan.",
          });
        });
    }, 160);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [items, quoteKey, ready]);

  const quote = items.length && quoted?.key === quoteKey ? quoted.value : null;
  const failedQuote = quoteError?.key === quoteKey ? quoteError.message : "";

  const close = useCallback(() => closeDrawer(), [closeDrawer]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = panel.current;
    node?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    document.body.dataset.drawer = "open";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const focusable = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      delete document.body.dataset.drawer;
      previous?.focus();
    };
  }, [drawerOpen, close]);

  // One cross-sell only, and never for a product already in the cart.
  const offer: Product | null = useMemo(() => {
    if (!drawerOpen || items.length === 0) return null;
    const candidates = quote?.recommendedAddons ?? [];
    for (const raw of candidates) {
      const candidate = normalizeProduct(raw);
      if (!candidate.available) continue;
      if (items.some((item) => item.productId === candidate.id)) continue;
      if (candidate.id === dismissedOffer) continue;
      return candidate;
    }
    return null;
  }, [drawerOpen, items, quote, dismissedOffer]);

  useEffect(() => {
    if (!offer || seenOffer.current === `${offer.id}:${quoteKey}`) return;
    seenOffer.current = `${offer.id}:${quoteKey}`;
    track("offer_viewed", {
      offerId: `cross_sell:${offer.id}`,
      offerKind: "cart_cross_sell",
      productId: offer.id,
      amountRsd: offer.priceRsd,
      amountBasis: "per_delivery",
    });
  }, [offer, quoteKey, track]);

  function addOffer(product: Product) {
    setOfferBusy(true);
    setOfferError("");
    try {
      addItem({
        productId: product.id,
        slug: product.slug,
        name: product.name,
        unit: product.unit,
        unitPriceRsd: product.priceRsd,
        purchaseType: "one_time",
        quantity: 1,
      });
      track("add_to_cart", {
        productId: product.id,
        placement: "cart_cross_sell",
        purchaseType: "one_time",
        quantity: 1,
        valueRsd: product.priceRsd,
        amountBasis: "per_delivery",
      });
    } catch {
      setOfferError("Ovaj proizvod trenutno nije dostupan.");
    } finally {
      setOfferBusy(false);
    }
  }

  const subscriptionOccurrences = quote?.lines.some((line) => line.occurrences > 1) ?? false;
  // freeDeliveryThresholdMinor === 0 means the threshold is switched off, which is not
  // the same as a confirmed free delivery. See docs/AOV-LTV-SPECIFIKACIJA.md G07.
  const thresholdActive = (quote?.freeDeliveryThresholdMinor ?? 0) > 0;

  // The viewport-sized root clips the closed panel so it never widens the document.
  return (
    <div className="drawer-root" data-open={drawerOpen}>
      <div
        className="drawer-scrim"
        data-open={drawerOpen}
        onClick={close}
        aria-hidden="true"
      />
      <aside
        className="cart-drawer"
        data-open={drawerOpen}
        role="dialog"
        aria-modal="true"
        aria-label="Tvoja korpa"
        aria-hidden={!drawerOpen}
        inert={!drawerOpen}
      >
        <div ref={panel} className="cart-drawer-panel">
          <header className="cart-drawer-head">
            <div>
              <h2>Tvoja korpa</h2>
              <p className="muted small-text">
                {pluralUnits(items.reduce((sum, item) => sum + item.quantity, 0))}
              </p>
            </div>
            <button type="button" className="icon-button" onClick={close} aria-label="Zatvori korpu">
              ✕
            </button>
          </header>

          <div className="cart-drawer-body">
            {items.length === 0 ? (
              <div className="cart-drawer-empty">
                <p>Korpa je prazna.</p>
                <Link className="button" href="/#izaberite-mleko" onClick={close}>
                  Izaberi mleko
                </Link>
              </div>
            ) : (
              <>
                <ul className="drawer-items">
                  {items.map((item) => {
                    const line = quote?.lines.find(
                      (candidate) =>
                        candidate.productId === item.productId &&
                        candidate.purchaseType === item.purchaseType &&
                        candidate.cadence === (item.cadence ?? null),
                    );
                    return (
                      <li key={item.key} className="drawer-item">
                        <div className="drawer-item-head">
                          <a href={`/proizvodi/${encodeURIComponent(item.slug)}`}>{item.name}</a>
                          <strong>{line ? formatMoney(line.lineTotalMinor / 100) : "…"}</strong>
                        </div>
                        <p className="drawer-item-meta">
                          {quantityLabel(item.quantity, item.unit)} po dostavi ·{" "}
                          {item.purchaseType === "one_time"
                            ? "jednokratno"
                            : cadenceLabel(item.cadence).toLocaleLowerCase("sr-Latn")}
                          {line && line.occurrences > 1 ? ` · ${line.occurrences} dostave ovog meseca` : ""}
                        </p>
                        <div className="drawer-item-controls">
                          <label className="field">
                            <span className="visually-hidden">{`Količina za ${item.name}`}</span>
                            <input
                              type="number"
                              min={1}
                              max={MAX_QUANTITY}
                              step={1}
                              inputMode="numeric"
                              value={item.quantity}
                              onChange={(event) => {
                                const value = Number(event.target.value);
                                if (!Number.isInteger(value) || value < 1 || value > MAX_QUANTITY) return;
                                updateItem(item.key, { quantity: value });
                              }}
                            />
                          </label>
                          <label className="field">
                            <span className="visually-hidden">{`Način kupovine za ${item.name}`}</span>
                            <select
                              value={item.purchaseType}
                              onChange={(event) => {
                                const purchaseType = event.target.value as PurchaseType;
                                updateItem(item.key, {
                                  purchaseType,
                                  cadence: purchaseType === "subscription" ? "weekly" : undefined,
                                });
                              }}
                            >
                              <option value="one_time">Jednokratno</option>
                              <option value="subscription">Redovna dostava</option>
                            </select>
                          </label>
                          {item.purchaseType === "subscription" ? (
                            <label className="field">
                              <span className="visually-hidden">{`Ritam za ${item.name}`}</span>
                              <select
                                value={item.cadence ?? "weekly"}
                                onChange={(event) =>
                                  updateItem(item.key, { cadence: event.target.value as DeliveryCadence })
                                }
                              >
                                <option value="weekly">Svake nedelje</option>
                                <option value="biweekly">Svake 2 nedelje</option>
                              </select>
                            </label>
                          ) : null}
                          <button
                            type="button"
                            className="text-button danger-text"
                            onClick={() => removeItem(item.key)}
                          >
                            Ukloni
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {offer ? (
                  <div className="drawer-offer">
                    <div>
                      <strong>Probaj i {offer.name.toLocaleLowerCase("sr-Latn")}.</strong>
                      <span>
                        Dodaj {quantityLabel(1, offer.unit)} samo ovoj dostavi. +{formatMoney(offer.priceRsd)}
                      </span>
                    </div>
                    <div className="drawer-offer-actions">
                      <button type="button" disabled={offerBusy} onClick={() => addOffer(offer)}>
                        Dodaj u korpu
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          setDismissedOffer(offer.id);
                          track("offer_dismissed", {
                            offerId: `cross_sell:${offer.id}`,
                            offerKind: "cart_cross_sell",
                            productId: offer.id,
                          });
                        }}
                      >
                        Ne, hvala
                      </button>
                    </div>
                    {offerError ? (
                      <p className="configurator-error" role="alert">
                        {offerError}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>

          {items.length > 0 ? (
            <footer className="cart-drawer-foot">
              {failedQuote ? (
                <p className="notice error small-text" role="alert">
                  {failedQuote} Stavke su sačuvane.
                </p>
              ) : null}
              {quote ? (
                <>
                  <div className="summary-row">
                    <span>Proizvodi</span>
                    <span>{formatMoney(quote.subtotalMinor / 100)}</span>
                  </div>
                  {quote.discountMinor > 0 ? (
                    <div className="summary-row discount-row">
                      <span>Popust {quote.promoCode}</span>
                      <span>−{formatMoney(quote.discountMinor / 100)}</span>
                    </div>
                  ) : null}
                  <div className="summary-row">
                    <span>
                      Dostava
                      {quote.deliveryOccurrences && quote.deliveryOccurrences > 1 && quote.deliveryFeePerOccurrenceMinor
                        ? ` (${quote.deliveryOccurrences} × ${formatMoney(quote.deliveryFeePerOccurrenceMinor / 100)})`
                        : ""}
                    </span>
                    <span>
                      {quote.deliveryFeeMinor
                        ? formatMoney(quote.deliveryFeeMinor / 100)
                        : thresholdActive
                          ? "Bez naknade"
                          : formatMoney(0)}
                    </span>
                  </div>
                  <div className="summary-row summary-total">
                    <span>{subscriptionOccurrences ? "Za ovaj obračun" : "Ukupno"}</span>
                    <span>{formatMoney(quote.totalMinor / 100)}</span>
                  </div>
                  {thresholdActive && quote.freeDeliveryRemainingMinor > 0 ? (
                    <p className="muted small-text">
                      {subscriptionOccurrences
                        ? `Do besplatne dostave za ovaj obračun nedostaje ${formatMoney(quote.freeDeliveryRemainingMinor / 100)}.`
                        : `Do besplatne dostave nedostaje ${formatMoney(quote.freeDeliveryRemainingMinor / 100)}.`}
                    </p>
                  ) : null}
                  <p className="muted small-text">
                    Sledeća dostava {formatDate(quote.deliveryDate)}
                    <br />
                    Izmene su moguće do {formatDateTime(quote.cutoffAt)}
                  </p>
                </>
              ) : (
                <p className="loading-state" role="status">
                  Računamo tačan iznos…
                </p>
              )}
              <a
                className={`button ${quote ? "" : "disabled-link"}`}
                href={quote ? "/checkout" : "#"}
                aria-disabled={!quote}
                onClick={(event) => {
                  if (!quote) {
                    event.preventDefault();
                    return;
                  }
                  track("begin_checkout", {
                    valueRsd: quote.totalMinor / 100,
                    itemCount: items.length,
                    amountBasis: subscriptionOccurrences ? "billing_total" : "per_delivery",
                  });
                }}
              >
                Nastavi na poručivanje
              </a>
              <a className="text-link drawer-full-cart" href="/korpa" onClick={close}>
                Otvori celu korpu
              </a>
            </footer>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
