"use client";
/* eslint-disable @next/next/no-img-element -- Catalog photography is pre-optimised and admin image URLs are arbitrary. */

import { useEffect, useId, useState } from "react";
import { useAnalytics } from "./analytics-provider";
import { useCart } from "./cart-provider";
import {
  MAX_QUANTITY,
  cadenceLabel,
  formatDate,
  formatMoney,
  litresPerUnit,
  quantityLabel,
  type DeliveryCadence,
  type DeliveryWindow,
  type Product,
  type PurchaseType,
} from "../lib/frontend";

const CHOICE_KEY = "mleko-i-mleko-purchase-choice";

/** An explicit purchase-type choice is remembered per product for the session only. */
function rememberedChoice(productId: string): PurchaseType | null {
  try {
    const raw = window.sessionStorage.getItem(CHOICE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    const value = parsed[productId];
    return value === "subscription" || value === "one_time" ? value : null;
  } catch {
    return null;
  }
}

function rememberChoice(productId: string, value: PurchaseType) {
  try {
    const raw = window.sessionStorage.getItem(CHOICE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    parsed[productId] = value;
    window.sessionStorage.setItem(CHOICE_KEY, JSON.stringify(parsed));
  } catch {
    // A blocked storage must never stop someone from buying.
  }
}

export type ConfiguratorLayout = "card" | "panel";

export function ProductConfigurator({
  product,
  delivery,
  layout = "card",
  onSelectionChange,
}: {
  product: Product;
  delivery: DeliveryWindow;
  layout?: ConfiguratorLayout;
  onSelectionChange?: (selection: { label: string; totalRsd: number; addToCart: () => void; disabled: boolean }) => void;
}) {
  const { addItem, ready, openDrawer } = useCart();
  const { track } = useAnalytics();
  const fieldId = useId();
  // New customers start on the one-time purchase, per docs/OPUS-DETALJNA-SPECIFIKACIJA.md D07.
  const [purchaseType, setPurchaseType] = useState<PurchaseType>("one_time");
  const [cadence, setCadence] = useState<DeliveryCadence>("weekly");
  const [quantity, setQuantity] = useState(2);
  const [customOpen, setCustomOpen] = useState(false);
  const [customInput, setCustomInput] = useState("2");
  const [customError, setCustomError] = useState("");

  const litres = litresPerUnit(product.unit);
  const presets = litres ? [2, 4, 8] : [1, 2, 4];
  const subscriptionAvailable = product.allowSubscription && product.available;
  const unitPrice = purchaseType === "subscription" ? product.subscriptionPriceRsd : product.priceRsd;
  const perDelivery = unitPrice * quantity;
  const occurrences = delivery.remainingOccurrences[cadence];
  const href = `/proizvodi/${encodeURIComponent(product.slug)}`;
  const selectionLabel = `${quantityLabel(quantity, product.unit)} · ${
    purchaseType === "subscription" ? cadenceLabel(cadence).toLocaleLowerCase("sr-Latn") : "jednokratno"
  }`;

  useEffect(() => {
    // Restored after hydration so the server-rendered default stays "jednokratno".
    queueMicrotask(() => {
      const saved = rememberedChoice(product.id);
      if (saved === "subscription" && product.allowSubscription) setPurchaseType("subscription");
      else if (saved === "one_time") setPurchaseType("one_time");
    });
  }, [product.id, product.allowSubscription]);

  function addToCart() {
    if (!product.available || !ready) return;
    if (purchaseType === "subscription" && !subscriptionAvailable) return;
    addItem({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      unit: product.unit,
      unitPriceRsd: unitPrice,
      purchaseType,
      cadence: purchaseType === "subscription" ? cadence : undefined,
      quantity,
    });
    track("add_to_cart", {
      productId: product.id,
      placement: layout === "card" ? "home_offer" : "product_page",
      purchaseType,
      cadence: purchaseType === "subscription" ? cadence : null,
      quantity,
      valueRsd: perDelivery,
      amountBasis: "per_delivery",
    });
    openDrawer();
  }

  useEffect(() => {
    onSelectionChange?.({
      label: selectionLabel,
      totalRsd: perDelivery,
      addToCart,
      disabled: !product.available || !ready,
    });
    // The callback only mirrors the current selection into a sticky bar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionLabel, perDelivery, product.available, ready, purchaseType, cadence, quantity]);

  function choosePurchaseType(value: PurchaseType) {
    setPurchaseType(value);
    rememberChoice(product.id, value);
    track(value === "subscription" ? "subscription_selected" : "select_item", {
      productId: product.id,
      purchaseType: value,
    });
  }

  function choosePreset(value: number) {
    setQuantity(value);
    setCustomInput(String(value));
    setCustomError("");
  }

  function applyCustom(raw: string) {
    setCustomInput(raw);
    const value = Number(raw.replace(",", "."));
    if (!raw.trim()) {
      setCustomError("Unesi količinu.");
      return;
    }
    if (!Number.isInteger(value) || value < 1) {
      setCustomError("Količina mora biti ceo broj, najmanje 1.");
      return;
    }
    if (value > MAX_QUANTITY) {
      setCustomError(`Najveća količina po dostavi je ${MAX_QUANTITY}.`);
      return;
    }
    setCustomError("");
    setQuantity(value);
  }

  return (
    <article className={`configurator configurator-${layout}`} data-available={product.available}>
      <a className="configurator-media" href={href} aria-label={`Detalji: ${product.name}`}>
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.imageAlt} width="1080" height="1080" loading="lazy" />
        ) : (
          <span>Fotografija uskoro</span>
        )}
      </a>

      <div className="configurator-body">
        <div className="configurator-head">
          <p className="configurator-category">{product.category}</p>
          <h3 className="configurator-title">
            <a href={href}>{product.name}</a>
          </h3>
          <p className="configurator-note">{product.shortDescription}</p>
          <p className="configurator-price">
            <strong>{formatMoney(unitPrice)}</strong>
            <span>/ {product.unit}</span>
            {litres && litres !== 1 ? <small>{formatMoney(unitPrice / litres)} / L</small> : null}
          </p>
        </div>

        {!product.available ? (
          <p className="configurator-blocked" role="status">
            Ovaj proizvod trenutno nije dostupan.
          </p>
        ) : (
          <>
            <fieldset className="configurator-step">
              <legend>Količina po dostavi</legend>
              <div className="choice-row">
                {presets.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={quantity === value && !customOpen}
                    onClick={() => choosePreset(value)}
                  >
                    {quantityLabel(value, product.unit)}
                  </button>
                ))}
                <button
                  type="button"
                  aria-expanded={customOpen}
                  aria-controls={`${fieldId}-custom`}
                  aria-pressed={!presets.includes(quantity)}
                  onClick={() => setCustomOpen((open) => !open)}
                >
                  Druga količina
                </button>
              </div>
              {customOpen ? (
                <div id={`${fieldId}-custom`} className="configurator-custom">
                  <label className="field">
                    <span>Broj jedinica ({product.unit})</span>
                    <input
                      type="number"
                      min={1}
                      max={MAX_QUANTITY}
                      step={1}
                      inputMode="numeric"
                      value={customInput}
                      aria-invalid={Boolean(customError)}
                      onChange={(event) => applyCustom(event.target.value)}
                    />
                  </label>
                  {customError ? (
                    <p className="configurator-error" role="alert">
                      {customError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </fieldset>

            <fieldset className="configurator-step">
              <legend>Način kupovine</legend>
              <div className="choice-row">
                <button
                  type="button"
                  aria-pressed={purchaseType === "one_time"}
                  onClick={() => choosePurchaseType("one_time")}
                >
                  Jednokratno
                </button>
                <button
                  type="button"
                  aria-pressed={purchaseType === "subscription"}
                  disabled={!subscriptionAvailable}
                  onClick={() => choosePurchaseType("subscription")}
                >
                  Redovna dostava
                </button>
              </div>
              {!subscriptionAvailable ? (
                <p className="configurator-hint">Za ovaj proizvod je moguća samo jednokratna kupovina.</p>
              ) : null}
            </fieldset>

            {purchaseType === "subscription" ? (
              <fieldset className="configurator-step">
                <legend>Ritam dostave</legend>
                <div className="choice-row">
                  {(["weekly", "biweekly"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={cadence === value}
                      onClick={() => {
                        setCadence(value);
                        track("delivery_cadence_selected", { productId: product.id, cadence: value });
                      }}
                    >
                      {cadenceLabel(value)}
                    </button>
                  ))}
                </div>
                <p className="configurator-hint">
                  Prva dostava {formatDate(delivery.deliveryDate)}.
                </p>
              </fieldset>
            ) : null}

            <div className="configurator-total">
              <p>
                <span>
                  Mleko po dostavi
                  <small>{selectionLabel}</small>
                </span>
                <strong>{formatMoney(perDelivery)}</strong>
              </p>
              {purchaseType === "subscription" && occurrences > 1 ? (
                <p className="configurator-occurrences">
                  {occurrences} dostave do kraja meseca. Ukupan obračun sa dostavom vidiš u korpi.
                </p>
              ) : (
                <p className="configurator-occurrences">Dostava se obračunava u korpi.</p>
              )}
            </div>

            <div className="configurator-actions">
              <button className="button" type="button" disabled={!ready} onClick={addToCart}>
                Dodaj u korpu
              </button>
              <a className="text-link" href={href}>
                Detalji proizvoda
              </a>
            </div>
          </>
        )}
      </div>
    </article>
  );
}
