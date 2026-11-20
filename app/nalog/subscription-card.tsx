"use client";

import Link from "next/link";
import { useLocalize, useLocale } from "@/app/lib/i18n/client";
import { useEffect, useRef, useState } from "react";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  type Product,
} from "../lib/frontend";

export type SubscriptionItem = {
  id: string;
  productId?: string;
  productName: string;
  unitLabel: string;
  priceMinor: number;
  quantity: number;
  cadence: string;
  cadenceAnchorDate: string;
  status: string;
  dueNext: boolean;
};
export type PackageSummary = { purchased: number; realized: number; remaining: number; openForAdditions?: number; paymentStatus?: string };
export type Subscription = {
  id: string;
  version: number;
  status: string;
  nextDeliveryDate: string;
  pauseUntil: string | null;
  maxPauseUntil?: string;
  renewalEnabled?: boolean;
  currentPackage?: {line_id: string; product_name: string; quantity: number; required_deliveries: number; delivered: number; delivered_units: number; required_units: number}[];
  packageSummary?: PackageSummary | null;
  cutoffAt: string;
  locked: boolean;
  afterSkipDate: string;
  items: SubscriptionItem[];
  nextOnlyAddons: {
    id: string;
    quantity: number;
    product_name: string;
    unit_price_minor: number;
  }[];
};
export type Mutate = (
  id: string,
  action: string,
  details?: Record<string, unknown>,
) => Promise<boolean>;

/** An addition the customer is about to confirm, with the surcharge the server will book. */
type PendingAddition = {
  productId: string;
  productName: string;
  unitLabel: string;
  currentQuantity: number;
  addedQuantity: number;
  unitPriceMinor: number;
  scope: "next_only" | "regular";
  itemId?: string;
};

function addDays(date: string, days: number) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
function pauseDelivery(subscription: Subscription, until: string) {
  let date = subscription.nextDeliveryDate;
  while (date < until) date = addDays(date, 7);
  const items = subscription.items.filter((item) => item.status === "active");
  for (
    let attempt = 0;
    attempt < 8 &&
    items.length &&
    !items.some((item) => {
      const days = Math.round(
        (Date.parse(date) - Date.parse(item.cadenceAnchorDate)) / 86400000,
      );
      return days >= 0 && days % (item.cadence === "biweekly" ? 14 : 7) === 0;
    });
    attempt++
  )
    date = addDays(date, 7);
  return date;
}
/** Mirrors the server: unit price × added quantity for one delivery, × remaining paid deliveries for a regular addition. */
export function surchargeFor(addition: PendingAddition, remaining: number) {
  const perDeliveryMinor = addition.unitPriceMinor * addition.addedQuantity;
  const deliveries = addition.scope === "next_only" ? 1 : remaining;
  return { perDeliveryMinor, deliveries, amountMinor: perDeliveryMinor * deliveries };
}

function ItemEditor({
  item,
  disabled,
  onPropose,
}: {
  item: SubscriptionItem;
  disabled: boolean;
  onPropose: (quantity: number) => void;
}) {
  const localize = useLocalize();
  const locale = useLocale();
  const [quantity, setQuantity] = useState(item.quantity);
  return localize((
    <li className="account-product">
      <div className="account-product-title">
        <strong>{item.productName}</strong>
        <span>
          {item.unitLabel} · {formatMoney(item.priceMinor / 100, locale)} po pakovanju ·{" "}
          {item.cadence === "biweekly" ? "svake 2 nedelje (do kraja paketa)" : "svake nedelje"}
        </span>
        {!item.dueNext && (
          <small>
            Po svom ritmu, ovaj proizvod ne stiže u sledećem terminu.
          </small>
        )}
      </div>
      <div className="account-product-controls">
        <div className="account-quantity-field">
          <span id={`quantity-${item.id}`}>Količina po dostavi</span>
          <div className="account-stepper">
            <button
              type="button"
              aria-label={`Smanji količinu za ${item.productName}`}
              disabled={disabled || quantity <= item.quantity}
              onClick={() => setQuantity(Math.max(item.quantity, quantity - 1))}
            >
              −
            </button>
            <output aria-labelledby={`quantity-${item.id}`}>{quantity}</output>
            <button
              type="button"
              aria-label={`Povećaj količinu za ${item.productName}`}
              disabled={disabled || quantity >= 100}
              onClick={() => setQuantity(Math.min(100, quantity + 1))}
            >
              +
            </button>
          </div>
        </div>
        <strong className="account-product-price">
          {formatMoney((item.priceMinor * item.quantity) / 100, locale)}
          <small>plaćeno po dostavi</small>
        </strong>
      </div>
      <p className="small-text account-muted">Plaćenu količinu ne možeš da smanjiš. Možeš da dodaš litre, samo za sledeću dostavu ili redovno.</p>
      {quantity > item.quantity ? (
        <div className="button-row">
          <button className="button small" type="button" disabled={disabled} onClick={() => { onPropose(quantity - item.quantity); setQuantity(item.quantity); }}>
            {`Dodaj ${quantity - item.quantity} × ${item.unitLabel}`}
          </button>
          <button className="text-button" type="button" disabled={disabled} onClick={() => setQuantity(item.quantity)}>Odustani</button>
        </div>
      ) : null}
    </li>
  ));
}

export function SubscriptionCard({
  subscription: sub,
  products,
  busy,
  readOnly = false,
  mutate,
  index,
  loyaltyLine,
}: {
  subscription: Subscription;
  products: Product[];
  busy: boolean;
  readOnly?: boolean;
  mutate: Mutate;
  index: number;
  loyaltyLine?: string;
}) {
  const localize = useLocalize();
  const locale = useLocale();
  const [action, setAction] = useState("");
  const [pending, setPending] = useState<PendingAddition | null>(null);
  const [newProductId, setNewProductId] = useState("");
  const [newQuantity, setNewQuantity] = useState(1);
  const [addonQuantity, setAddonQuantity] = useState(1);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [pauseUntil, setPauseUntil] = useState(
    addDays(sub.nextDeliveryDate, 14),
  );
  const confirmation = useRef<HTMLElement>(null);
  useEffect(() => {
    if (action || pending) {
      confirmation.current?.focus({ preventScroll: true });
      confirmation.current?.scrollIntoView({ block: "nearest" });
    }
  }, [action, pending]);
  const items = sub.items.filter((item) => item.status === "active");
  const paused = sub.status === "paused";
  const cancelled = sub.status === "cancelled";
  // The server decides the 36 h deadline; the account shows it as a static date, no live timer.
  const locked = sub.locked;
  const disabled = busy || readOnly || sub.status !== "active" || locked;
  const summary = sub.packageSummary ?? null;
  // Deliveries an addition can still ride on: unrealized and not already packed.
  const remaining = summary?.openForAdditions ?? summary?.remaining ?? 0;
  const unitPrice = (product: Product) => Math.round((product.allowSubscription ? product.subscriptionPriceRsd : product.priceRsd) * 100);
  const nextTotal =
    items
      .filter((item) => item.dueNext)
      .reduce((sum, item) => sum + item.quantity * item.priceMinor, 0) +
    sub.nextOnlyAddons.reduce(
      (sum, item) => sum + item.quantity * item.unit_price_minor,
      0,
    );
  const quote = pending ? surchargeFor(pending, remaining) : null;
  async function confirm() {
    const details =
      action === "pause"
        ? { pauseUntil }
        : {};
    if (await mutate(sub.id, action, details)) setAction("");
  }
  async function confirmAddition() {
    if (!pending || !quote) return;
    const ok = await mutate(sub.id, "add_quantity", {
      productId: pending.productId,
      quantity: pending.addedQuantity,
      scope: pending.scope,
      expectedAmountMinor: quote.amountMinor,
    });
    if (ok) {
      setPending(null);
      setNewProductId("");
      setNewQuantity(1);
    }
  }
  return localize((
    <article
      className="card account-subscription"
      data-subscription-id={sub.id}
      aria-labelledby={`delivery-${sub.id}`}
      aria-busy={busy}
    >
      <div className="account-delivery-header">
        <div>
          <p className="eyebrow">
            {cancelled
              ? "Završena redovna dostava"
              : paused
                ? "Dostave su pauzirane"
                : index === 0
                  ? "Sledeća redovna dostava"
                  : "Redovna dostava"}
          </p>
          <h2 id={`delivery-${sub.id}`}>
            {cancelled
              ? "Pretplata je otkazana"
              : formatDate(sub.nextDeliveryDate, locale)}
          </h2>
        </div>
        <span className={`account-status ${paused ? "is-paused" : ""}`}>
          {cancelled ? "Otkazana" : paused ? "Pauzirana" : "Aktivna"}
        </span>
      </div>
      {paused ? (
        <div className="account-pause-info">
          <p>
            {`Pauza traje do ${formatDate(sub.pauseUntil ?? sub.nextDeliveryDate, locale)}. Preostale plaćene dostave se čuvaju i nastavljaju se automatski od termina prikazanog iznad.`}
          </p>
          <button
            className="button secondary small"
            disabled={busy || readOnly}
            onClick={() => void mutate(sub.id, "resume")}
          >
            Nastavi pretplatu
          </button>
          <p className="small-text">
            Nastavak uklanja pauzu i zadržava prvi dostupan planirani termin.
          </p>
        </div>
      ) : !cancelled ? (
        <p className="account-cutoff">
          {locked
            ? "Priprema je počela. Rok za izmene ove dostave je istekao."
            : `Izmene do ${formatDateTime(sub.cutoffAt, locale)} (vreme u Beogradu).`}
        </p>
      ) : (
        <p>
          Za novu redovnu dostavu izaberi proizvode u{" "}
          <Link href="/#izaberite-mleko">izboru mleka</Link>.
        </p>
      )}
      {summary ? (
        <section className="account-package" aria-label="Plaćeni paket">
          <h3>Tvoj plaćeni paket</h3>
          <p className="account-package-counts">
            <strong>{`Kupljeno ${summary.purchased} dostave • Realizovano ${summary.realized} • Ostalo ${summary.remaining}`}</strong>
          </p>
          <p className="small-text">Preskočena dostava NE troši plaćeni termin.</p>
          {sub.currentPackage?.filter((line) => line.required_deliveries > 1).map((line) => (
            <p className="small-text account-muted" key={line.line_id}>{`${line.quantity} × ${line.product_name} po dostavi · uručeno ${line.delivered_units}/${line.required_units}`}</p>
          ))}
          {sub.renewalEnabled === false ? <p className="small-text">Obnova je otkazana. Preostale plaćene dostave ostaju zakazane.</p> : <p className="small-text account-muted">Novi paket počinje tek kada se realizuju sve četiri dostave.</p>}
        </section>
      ) : null}
      {loyaltyLine ? <a className="account-loyalty-line" href="#vernost">{loyaltyLine} <span aria-hidden="true">→</span></a> : null}
      <div className="account-basket-heading">
        <h3>Tvoji proizvodi</h3>
        <p>Možeš samo da dodaješ. Doplatu računamo pre potvrde i plaćaš je gotovinom ili uplatom na račun.</p>
      </div>
      <ul className="list-clean">
        {items.map((item) => (
          <ItemEditor
            key={`${item.id}:${item.quantity}`}
            item={item}
            disabled={disabled}
            onPropose={(addedQuantity) => setPending({ productId: item.productId ?? "", itemId: item.id, productName: item.productName, unitLabel: item.unitLabel, currentQuantity: item.quantity, addedQuantity, unitPriceMinor: item.priceMinor, scope: "regular" })}
          />
        ))}
      </ul>
      {pending && quote ? (
        <section className="account-confirm account-surcharge" aria-label="Doplata pre potvrde" tabIndex={-1} ref={confirmation}>
          <h3>{`Dodaješ ${pending.addedQuantity} × ${pending.productName}`}</h3>
          {pending.currentQuantity > 0 ? <p>{`Sa ${pending.currentQuantity} na ${pending.currentQuantity + pending.addedQuantity} po dostavi.`}</p> : null}
          <fieldset className="account-scope">
            <legend>Koliko dugo?</legend>
            <label>
              <input type="radio" name={`scope-${sub.id}`} checked={pending.scope === "next_only"} onChange={() => setPending({ ...pending, scope: "next_only" })} />
              <span>{`Samo sledeća dostava: ${formatMoney(surchargeFor({ ...pending, scope: "next_only" }, remaining).amountMinor / 100, locale)}`}</span>
            </label>
            <label>
              <input type="radio" name={`scope-${sub.id}`} checked={pending.scope === "regular"} onChange={() => setPending({ ...pending, scope: "regular" })} />
              <span>{remaining > 0 ? `Redovno, sve preostale dostave paketa (${remaining}) i dalje: ${formatMoney(surchargeFor({ ...pending, scope: "regular" }, remaining).amountMinor / 100, locale)}` : "Redovno, od sledećeg paketa"}</span>
            </label>
          </fieldset>
          <p className="account-surcharge-math">
            <strong>
              {quote.amountMinor <= 0
                ? "Bez doplate sada. Nova količina važi od sledećeg paketa."
                : quote.deliveries > 1
                  ? `Doplata: +${pending.addedQuantity} × ${formatMoney(pending.unitPriceMinor / 100, locale)} × ${quote.deliveries} dostave = ${formatMoney(quote.amountMinor / 100, locale)}`
                  : `Doplata: +${pending.addedQuantity} × ${formatMoney(pending.unitPriceMinor / 100, locale)} za jednu dostavu = ${formatMoney(quote.amountMinor / 100, locale)}`}
            </strong>
          </p>
          <p className="small-text">Plaćanje gotovinom pri dostavi ili uplatom na račun. Doplata se automatski knjiži uz tvoj paket.</p>
          <div className="button-row">
            <button className="button small" type="button" disabled={disabled} onClick={() => void confirmAddition()}>
              {busy ? "Čuvamo…" : quote.amountMinor > 0 ? `Potvrdi doplatu ${formatMoney(quote.amountMinor / 100, locale)}` : "Potvrdi"}
            </button>
            <button className="text-button" type="button" disabled={busy} onClick={() => setPending(null)}>Odustani</button>
          </div>
        </section>
      ) : null}
      {!cancelled && (
        <details className="account-extras">
          <summary>Dodaj proizvod u redovnu dostavu</summary>
          <div className="form-stack">
            <p>Novi proizvod stiže svake nedelje, u preostalim dostavama paketa i u narednim paketima.</p>
            <label className="field">
              <span>Proizvod za redovnu dostavu</span>
              <select
                value={newProductId}
                disabled={disabled}
                onChange={(event) => setNewProductId(event.target.value)}
              >
                <option value="">Izaberi proizvod</option>
                {products
                  .filter(
                    (product) => product.allowSubscription && product.available,
                  )
                  .map((product) => (
                    <option key={product.id} value={product.id}>
                      {`${product.name} · ${product.unit} · ${formatMoney(product.subscriptionPriceRsd, locale)}`}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              <span>Količina po dostavi</span>
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                value={newQuantity}
                disabled={disabled}
                onChange={(event) => setNewQuantity(Number(event.target.value))}
              />
            </label>
            <button
              className="button small"
              disabled={
                disabled ||
                !newProductId ||
                !Number.isInteger(newQuantity) ||
                newQuantity < 1 ||
                newQuantity > 100
              }
              onClick={() => {
                const product = products.find((candidate) => candidate.id === newProductId);
                if (!product) return;
                const existing = items.find((item) => item.productId === product.id);
                setPending({ productId: product.id, productName: product.name, unitLabel: product.unit, currentQuantity: existing?.quantity ?? 0, addedQuantity: newQuantity, unitPriceMinor: unitPrice(product), scope: "regular" });
              }}
            >
              Izračunaj doplatu
            </button>
          </div>
        </details>
      )}
      {!cancelled && (
        <div className="account-subtotal">
          <span>
            Proizvodi u sledećoj redovnoj dostavi
            <small>
              Bez naknade za dostavu. Paket, doplate i uplate su u porudžbinama.
            </small>
          </span>
          <strong>{formatMoney(nextTotal / 100, locale)}</strong>
        </div>
      )}
      {!cancelled && !paused && (
        <div className="account-quick-actions">
          <button
            className="button secondary"
            disabled={disabled}
            aria-expanded={action === "skip_next"}
            onClick={() => setAction(action === "skip_next" ? "" : "skip_next")}
          >
            <span>Preskoči sledeću</span>
            <small>Ne troši plaćeni termin</small>
          </button>
          <button
            className="button secondary"
            disabled={disabled}
            aria-expanded={action === "pause"}
            onClick={() => {
              setPauseUntil(addDays(sub.nextDeliveryDate, 14));
              setAction(action === "pause" ? "" : "pause");
            }}
          >
            <span>Pauziraj dostave</span>
            <small>Ti biraš datum nastavka</small>
          </button>
        </div>
      )}
      {action && (
        <section
          className="account-confirm"
          aria-label="Potvrda izmene"
          tabIndex={-1}
          ref={pending ? undefined : confirmation}
        >
          <h3>
            {action === "skip_next"
              ? "Preskočiti samo ovu dostavu?"
              : action === "pause"
                ? "Kada želiš da se dostave nastave?"
                : summary?.paymentStatus === "paid" ? "Otkazati obnovu pretplate?" : "Otkazati redovnu dostavu?"}
          </h3>
          {action === "skip_next" ? (
            <p>
              {`Preskačeš ${formatDate(sub.nextDeliveryDate, locale)}. Sledeća redovna dostava biće ${formatDate(sub.afterSkipDate, locale)}. Plaćeni termin se ne troši.`}
            </p>
          ) : action === "pause" ? (
            <>
              <label className="field">
                <span>Nastavak dostava od</span>
                <input
                  type="date"
                  min={addDays(sub.nextDeliveryDate, 1)}
                  max={(sub.maxPauseUntil ?? addDays(sub.nextDeliveryDate, 90))}
                  value={pauseUntil}
                  onChange={(event) => setPauseUntil(event.target.value)}
                />
              </label>
              {pauseUntil > sub.nextDeliveryDate && (
                <p>
                  {`Do tada ne šaljemo redovne dostave. Prva posle pauze: ${formatDate(pauseDelivery(sub, pauseUntil), locale)}. Preostale plaćene dostave se čuvaju.`}
                </p>
              )}
            </>
          ) : (
            <p>
              {summary?.paymentStatus === "paid"
                ? "Preostale plaćene dostave paketa stižu kao i do sada. Posle njih se novi paket ne pravi. Za kratko odsustvo izaberi pauzu."
                : "Sve buduće redovne dostave se otkazuju. Za kratko odsustvo izaberi pauzu."}
            </p>
          )}
          {sub.nextOnlyAddons.length > 0 &&
            (action === "skip_next" || action === "pause") && (
              <p>
                Proizvodi dodati samo sledećoj dostavi pomeraju se zajedno sa
                njom.
              </p>
            )}
          {(action === "skip_next" ||
            action === "pause" ||
            action === "cancel") && (
            <p className="small-text">
              Zasebne jednokratne porudžbine ostaju zakazane.
            </p>
          )}
          <div className="button-row">
            <button
              className="button small"
              disabled={
                busy || readOnly ||
                (action !== "resume" && locked) ||
                (action === "pause" &&
                  (!pauseUntil ||
                    pauseUntil <= sub.nextDeliveryDate ||
                    pauseUntil > (sub.maxPauseUntil ?? addDays(sub.nextDeliveryDate, 90))))
              }
              onClick={() => void confirm()}
            >
              {busy
                ? "Čuvamo…"
                : action === "skip_next"
                  ? "Potvrdi preskakanje"
                  : action === "pause"
                    ? "Potvrdi pauzu"
                    : "Potvrdi otkazivanje"}
            </button>
            <button
              className="text-button"
              disabled={busy || readOnly}
              onClick={() => setAction("")}
            >
              Odustani
            </button>
          </div>
        </section>
      )}
      {sub.nextOnlyAddons.length > 0 && (
        <div className="next-addon-summary">
          <strong>Dodato samo sledećoj dostavi</strong>
          {sub.nextOnlyAddons.map((addon) => (
            <span key={addon.id}>
              {`${addon.quantity} × ${addon.product_name} · ${formatMoney((addon.quantity * addon.unit_price_minor) / 100, locale)}`}
            </span>
          ))}
        </div>
      )}
      {!cancelled && (
        <details className="account-extras">
          <summary>Dodaj nešto samo sledećoj dostavi</summary>
          <section
            className="next-addon-picker"
            aria-label="Dodaj sledećoj dostavi"
          >
            <p>Izaberi količinu i proizvod. Pre potvrde vidiš tačnu doplatu.</p>
            <label className="field">
              <span>Pretraži dodatke</span>
              <input
                type="search"
                value={catalogSearch}
                onChange={(event) => setCatalogSearch(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Količina dodatka</span>
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                value={addonQuantity}
                onChange={(event) =>
                  setAddonQuantity(Number(event.target.value))
                }
              />
            </label>
            <div>
              {products
                .filter(
                  (product) =>
                    product.available &&
                    product.name
                      .toLocaleLowerCase("sr")
                      .includes(catalogSearch.toLocaleLowerCase("sr")),
                )
                .map((product) => (
                  <button
                    type="button"
                    disabled={
                      disabled ||
                      !Number.isInteger(addonQuantity) ||
                      addonQuantity < 1 ||
                      addonQuantity > 100
                    }
                    key={product.id}
                    onClick={() => {
                      const existing = items.find((item) => item.productId === product.id);
                      setPending({ productId: product.id, productName: product.name, unitLabel: product.unit, currentQuantity: existing?.quantity ?? 0, addedQuantity: addonQuantity, unitPriceMinor: unitPrice(product), scope: "next_only" });
                    }}
                  >
                    <span>
                      <strong>{product.name}</strong>
                      <small>{product.unit}</small>
                    </span>
                    <b>
                      {`+ ${formatMoney((unitPrice(product) * (addonQuantity || 1)) / 100, locale)}`}
                    </b>
                  </button>
                ))}
            </div>
          </section>
        </details>
      )}
      {!cancelled && (
        <div className="account-card-footer">
          <a href="/kontakt">Pomoć oko dostave</a>
          <button
            className="text-button"
            disabled={busy || readOnly || locked}
            onClick={() => setAction("cancel")}
          >
            Otkaži pretplatu
          </button>
        </div>
      )}
    </article>
  ));
}
