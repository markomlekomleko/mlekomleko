"use client";

import { useLocalize, useLocale } from "@/app/lib/i18n/client";
/* eslint-disable @next/next/no-img-element -- Catalog photography is pre-optimised and admin image URLs are arbitrary. */

import { useEffect, useId, useState } from "react";
import { useAnalytics } from "./analytics-provider";
import { useCart } from "./cart-provider";
import { milkKind } from "../lib/milk-media";
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
  loyaltyNote = true,
  onSelectionChange,
}: {
  product: Product;
  delivery: DeliveryWindow;
  layout?: ConfiguratorLayout;
  /** The loyalty line under the subscription choice (shop); the home page says it once under the section instead. */
  loyaltyNote?: boolean;
  onSelectionChange?: (selection: { label: string; totalRsd: number; addToCart: () => void; disabled: boolean }) => void;
}) {
  const localize = useLocalize();
  const locale = useLocale();
  const { addItem, ready } = useCart();
  const { track } = useAnalytics();
  const fieldId = useId();
  // Spec 19 Nov 2026, §5: the subscription is selected by default; it is a package of
  // four weekly deliveries (the only rhythm offered from now on).
  const [purchaseType, setPurchaseType] = useState<PurchaseType>(product.allowSubscription && product.available ? "subscription" : "one_time");
  const cadence: DeliveryCadence = "weekly";
  const [quantity, setQuantity] = useState(2);
  const [customOpen, setCustomOpen] = useState(false);
  const [customInput, setCustomInput] = useState("2");
  const [customError, setCustomError] = useState("");

  const litres = litresPerUnit(product.unit);
  const presets = litres ? [2, 4, 8] : [1, 2, 4];
  // Milk is sold from two litres per delivery up.
  const minimum = litres ? 2 : 1;
  const subscriptionAvailable = product.allowSubscription && product.available;
  const subscriptionSelected = purchaseType === "subscription";
  const unitPrice = subscriptionSelected ? product.subscriptionPriceRsd : product.priceRsd;
  const perDelivery = unitPrice * quantity;
  const occurrences = delivery.remainingOccurrences[cadence];
  const visits = subscriptionSelected ? occurrences : 1;
  const goodsTotal = perDelivery * visits;
  const shippingKnown = typeof delivery.deliveryFeeMinor === "number";
  const feePerVisit = (subtotalRsd: number) => {
    const thresholdMinor = delivery.freeDeliveryThresholdMinor ?? 0;
    return thresholdMinor > 0 && Math.round(subtotalRsd * 100) >= thresholdMinor
      ? 0
      : (delivery.deliveryFeeMinor ?? 0) / 100;
  };
  const shippingPerVisit = feePerVisit(goodsTotal);
  const shippingTotal = shippingPerVisit * visits;
  const subscriptionGoods = product.subscriptionPriceRsd * quantity * occurrences;
  const subscriptionTotal = subscriptionGoods + feePerVisit(subscriptionGoods) * occurrences;
  const purchaseTotal = goodsTotal + shippingTotal;
  /** What a subscriber saves per unit against the one-time price. */
  const saving = Math.max(0, product.priceRsd - product.subscriptionPriceRsd);
  const href = `/proizvodi/${encodeURIComponent(product.slug)}`;
  const selectionLabel = `${quantityLabel(quantity, product.unit)} · ${
    purchaseType === "subscription" ? cadenceLabel(cadence).toLocaleLowerCase("sr-Latn") : "jednokratno"
  }`;

  useEffect(() => {
    // Restored after hydration so the server-rendered default stays the subscription.
    // A hero link (?tip=pretplata / ?tip=jednokratno) wins over a remembered choice.
    queueMicrotask(() => {
      const fromLink = new URLSearchParams(window.location.search).get("tip");
      const saved = fromLink === "pretplata" ? "subscription" : fromLink === "jednokratno" ? "one_time" : rememberedChoice(product.id);
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
      currency: "RSD",
      items: [{ item_id: product.id, item_name: product.name, price: unitPrice, quantity }],
      amountBasis: "per_delivery",
    });
  }

  useEffect(() => {
    onSelectionChange?.({
      label: `${selectionLabel} · ${shippingKnown ? subscriptionSelected ? "ceo paket sa dostavom" : "sa dostavom" : subscriptionSelected ? "mleko za ceo paket" : "proizvodi po dostavi"}`,
      totalRsd: purchaseTotal,
      addToCart,
      disabled: !product.available || !ready,
    });
    // The callback only mirrors the current selection into a sticky bar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionLabel, purchaseTotal, shippingKnown, product.available, ready, subscriptionSelected, cadence, quantity]);

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
    if (!Number.isInteger(value) || value < minimum) {
      setCustomError(minimum === 2 ? "Najmanja količina je 2 litra." : "Količina mora biti ceo broj, najmanje 1.");
      return;
    }
    if (value > MAX_QUANTITY) {
      setCustomError(`Najveća količina po dostavi je ${MAX_QUANTITY}.`);
      return;
    }
    setCustomError("");
    setQuantity(value);
  }

  const kind = milkKind(product);
  const compact = layout === "card";

  return localize((
    <article className={`configurator configurator-${layout}`} data-available={product.available} data-kind={kind ?? undefined}>
      {product.imageUrl ? (
        <a className="configurator-media" href={href} aria-label={`Detalji: ${product.name}`}>
          <img src={product.imageUrl} alt={product.imageAlt} width="1199" height="1312" loading="lazy" />
        </a>
      ) : kind ? null : (
        <a className="configurator-media" href={href}><span>Fotografija uskoro</span></a>
      )}

      <div className="configurator-body">
        <div className="configurator-head">
          {compact ? null : <p className="configurator-category">{product.category}</p>}
          {!compact && product.imageUrl && (/^\/images\/demo\//.test(product.imageUrl) || /^\/images\/catalog\/(kravlje|kozje)-mleko(-v2)?\.(webp|jpg|avif)$/.test(product.imageUrl)) ? <small className="configurator-occurrences">Ilustracija pakovanja</small> : null}
          {layout === "panel" ? <h3 className="configurator-title">{product.name}</h3> : (
            <h3 className="configurator-title">
              <a href={href}>{product.name}</a>
            </h3>
          )}
          {compact ? null : <p className="configurator-note">{product.shortDescription}</p>}
        </div>

        {!product.available ? (
          <p className="configurator-blocked" role="status">
            Ovaj proizvod trenutno nije dostupan.
          </p>
        ) : (
          <>
            <fieldset className="configurator-step configurator-types" disabled={!ready}>
              <legend>Način kupovine</legend>
              <div className="purchase-types">
                <button
                  type="button"
                  className="purchase-type"
                  aria-pressed={purchaseType === "subscription"}
                  disabled={!subscriptionAvailable}
                  onClick={() => choosePurchaseType("subscription")}
                >
                  <span className="purchase-type-name">Pretplata</span>
                  {subscriptionAvailable ? (
                    <>
                      <strong>{formatMoney(subscriptionTotal, locale)}</strong>
                      <small>{shippingKnown ? `Ceo paket sa dostavom · ${occurrences} isporuke` : `Mleko za ceo paket · ${occurrences} isporuke`}</small>
                    </>
                  ) : null}
                  {saving > 0 ? <small className="purchase-type-badge">{`Uštediš ${formatMoney(saving, locale)} po litru`}</small> : null}
                </button>
                <button
                  type="button"
                  className="purchase-type"
                  aria-pressed={purchaseType === "one_time"}
                  onClick={() => choosePurchaseType("one_time")}
                >
                  <span className="purchase-type-name">Jednokratna kupovina</span>
                  <strong>{`${formatMoney(product.priceRsd, locale)}/${litres ? "l" : product.unit}`}</strong>
                  {litres ? <small>Staklena flaša uključena</small> : null}
                </button>
              </div>
              {!subscriptionAvailable ? (
                <p className="configurator-hint">Za ovaj proizvod je moguća samo jednokratna kupovina.</p>
              ) : null}
            </fieldset>

            <fieldset className="configurator-step" disabled={!ready}>
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
                      min={minimum}
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

            <div className="configurator-total configurator-receipt" data-subscription={subscriptionSelected || undefined}>
              <p>
                <span>{litres ? "Mleko" : "Proizvod"} <small>{`${quantityLabel(quantity, product.unit)} × ${formatMoney(unitPrice, locale)}`}{subscriptionSelected ? ` × ${visits}` : null}</small></span>
                <strong>{formatMoney(goodsTotal, locale)}</strong>
              </p>
              {shippingKnown ? (
                <p>
                  <span>Dostava do vrata {subscriptionSelected ? <small>{`${visits} isporuke × ${formatMoney(shippingPerVisit, locale)}`}</small> : null}</span>
                  <strong>{shippingTotal > 0 ? formatMoney(shippingTotal, locale) : "Besplatno"}</strong>
                </p>
              ) : <p className="configurator-occurrences">Dostava se obračunava u korpi.</p>}
              <p className="configurator-package-total">
                <span>{subscriptionSelected ? shippingKnown ? "Ukupno za ceo paket" : "Mleko za ceo paket" : shippingKnown ? "Ukupno po isporuci" : "Ukupno za proizvode"}</span>
                <strong>{formatMoney(purchaseTotal, locale)}</strong>
              </p>
              {subscriptionSelected && saving > 0 ? <p className="configurator-saving">{`Na mleku štediš ${formatMoney(saving * quantity * visits, locale)} za ceo paket.`}</p> : null}
              <p className="configurator-occurrences">{subscriptionSelected ? `Prva dostava: ${formatDate(delivery.deliveryDate, locale)}` : `Dostava: ${formatDate(delivery.deliveryDate, locale)}`}</p>
            </div>

            {subscriptionSelected ? (
              <div className="configurator-subscription-note">
                <strong>Svake nedelje na tvoja vrata</strong>
                <p>Redovna dostava, koju možeš da izmeniš, pauziraš ili otkažeš kad god poželiš.</p>
                <p className="configurator-hint">{`Izmene predstojeće dostave važe samo do roka od ${delivery.cutoffHours} sati pre početka ture.`}</p>
                {loyaltyNote ? <p className="configurator-loyalty">💙 Posle 12 realizovanih dostava poklanjamo ti 2 l mleka i dostavu.</p> : null}
              </div>
            ) : null}

            <div className="configurator-actions">
              <button className="button" type="button" disabled={!ready} onClick={addToCart}>
                Napuni frižider
              </button>
              {compact ? null : <a className="text-link" href={href}>
                Detalji proizvoda
              </a>}
            </div>
          </>
        )}
      </div>
    </article>
  ));
}
