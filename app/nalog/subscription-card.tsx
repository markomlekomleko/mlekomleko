"use client";

import { useEffect, useRef, useState } from "react";
import { cadenceLabel, formatDate, formatDateTime, formatMoney, quantityLabel, type Product } from "../lib/frontend";

export type SubscriptionItem = {
  id: string; productName: string; unitLabel: string; priceMinor: number;
  quantity: number; cadence: string; cadenceAnchorDate: string; status: string; dueNext: boolean;
};
export type Subscription = {
  id: string; version: number; status: string; nextDeliveryDate: string; pauseUntil: string | null;
  cutoffAt: string; locked: boolean; afterSkipDate: string; items: SubscriptionItem[];
  nextOnlyAddons: { id: string; quantity: number; product_name: string; unit_price_minor: number }[];
};
export type Mutate = (id: string, action: string, details?: Record<string, unknown>) => Promise<boolean>;

function addDays(date: string, days: number) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
function pauseDelivery(subscription: Subscription, until: string) {
  let date = subscription.nextDeliveryDate;
  while (date < until) date = addDays(date, 7);
  const items = subscription.items.filter(item => item.status === "active");
  for (let attempt = 0; attempt < 8 && items.length && !items.some(item => {
    const days = Math.round((Date.parse(date) - Date.parse(item.cadenceAnchorDate)) / 86400000);
    return days >= 0 && days % (item.cadence === "biweekly" ? 14 : 7) === 0;
  }); attempt++) date = addDays(date, 7);
  return date;
}

function ItemEditor({ item, disabled, onSave, onRemove }: {
  item: SubscriptionItem; disabled: boolean;
  onSave: (details: Record<string, unknown>) => Promise<boolean>; onRemove: () => void;
}) {
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [cadence, setCadence] = useState(item.cadence);
  const value = Number(quantity);
  const valid = Number.isInteger(value) && value >= 1 && value <= 100;
  const dirty = quantity !== String(item.quantity) || cadence !== item.cadence;
  return <li className="account-product">
    <div className="account-product-title"><strong>{item.productName}</strong><span>{item.unitLabel} · {formatMoney(item.priceMinor / 100)} po pakovanju</span>{!item.dueNext && <small>Po svom ritmu, ovaj proizvod ne stiže u sledećem terminu.</small>}</div>
    <div className="account-product-controls">
      <div className="account-quantity-field"><span id={`quantity-${item.id}`}>Količina po dostavi</span><div className="account-stepper">
        <button type="button" aria-label={`Smanji količinu za ${item.productName}`} disabled={disabled || value <= 1} onClick={() => setQuantity(String(Math.max(1, (value || 1) - 1)))}>−</button>
        <input type="number" inputMode="numeric" min={1} max={100} step={1} value={quantity} aria-label={`Količina za ${item.productName}`} disabled={disabled} onChange={event => setQuantity(event.target.value)} />
        <button type="button" aria-label={`Povećaj količinu za ${item.productName}`} disabled={disabled || value >= 100} onClick={() => setQuantity(String(Math.min(100, (value || 0) + 1)))}>+</button>
      </div></div>
      <label className="field"><span>Koliko često?</span><select aria-label={`Ritam za ${item.productName}`} value={cadence} disabled={disabled} onChange={event => setCadence(event.target.value)}><option value="weekly">Svake nedelje</option><option value="biweekly">Svake 2 nedelje</option></select></label>
      <strong className="account-product-price">{formatMoney(item.priceMinor * (valid ? value : item.quantity) / 100)}<small>po dolasku ovog proizvoda</small></strong>
    </div>
    {dirty ? <div className="account-draft"><p>{valid ? `${quantityLabel(value, item.unitLabel)} · ${cadenceLabel(cadence).toLowerCase()}. Izmena još nije sačuvana.` : "Unesite ceo broj od 1 do 100."}</p><div className="button-row"><button className="button small" disabled={disabled || !valid} onClick={() => void onSave({ itemId: item.id, quantity: value, cadence })}>Sačuvaj izmene</button><button className="text-button" disabled={disabled} onClick={() => { setQuantity(String(item.quantity)); setCadence(item.cadence); }}>Odustani</button></div></div> : null}
    <button className="text-button account-remove" disabled={disabled} onClick={onRemove}>Ukloni proizvod</button>
  </li>;
}

export function SubscriptionCard({ subscription: sub, products, busy, mutate, index }: {
  subscription: Subscription; products: Product[]; busy: boolean; mutate: Mutate; index: number;
}) {
  const [action, setAction] = useState("");
  const [removeId, setRemoveId] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const [pauseUntil, setPauseUntil] = useState(addDays(sub.nextDeliveryDate, 14));
  const confirmation = useRef<HTMLElement>(null);
  useEffect(() => {
    if (action) { confirmation.current?.focus({ preventScroll: true }); confirmation.current?.scrollIntoView({ block: "nearest" }); }
  }, [action]);
  const items = sub.items.filter(item => item.status === "active");
  const paused = sub.status === "paused";
  const cancelled = sub.status === "cancelled";
  const locked = sub.locked || now >= Date.parse(sub.cutoffAt);
  const disabled = busy || sub.status !== "active" || locked;
  const nextTotal = items.filter(item => item.dueNext).reduce((sum, item) => sum + item.quantity * item.priceMinor, 0) + sub.nextOnlyAddons.reduce((sum, item) => sum + item.quantity * item.unit_price_minor, 0);
  async function confirm() {
    const details = action === "pause" ? { pauseUntil } : action === "remove_item" ? { itemId: removeId } : {};
    if (await mutate(sub.id, action, details)) setAction("");
  }
  return <article className="card account-subscription" data-subscription-id={sub.id} aria-labelledby={`delivery-${sub.id}`} aria-busy={busy}>
    <div className="account-delivery-header"><div><p className="eyebrow">{cancelled ? "Završena redovna dostava" : paused ? "Dostave su pauzirane" : index === 0 ? "Sledeća redovna dostava" : "Redovna dostava"}</p><h2 id={`delivery-${sub.id}`}>{cancelled ? "Pretplata je otkazana" : formatDate(sub.nextDeliveryDate)}</h2></div><span className={`account-status ${paused ? "is-paused" : ""}`}>{cancelled ? "Otkazana" : paused ? "Pauzirana" : "Aktivna"}</span></div>
    {paused ? <div className="account-pause-info"><p>Pauza traje do <strong>{formatDate(sub.pauseUntil ?? sub.nextDeliveryDate)}</strong>. Dostave se zatim nastavljaju automatski, od termina prikazanog iznad.</p><button className="button secondary small" disabled={busy} onClick={() => void mutate(sub.id, "resume")}>Nastavi pretplatu</button><p className="small-text">Nastavak uklanja pauzu i zadržava prvi dostupan planirani termin.</p></div> : !cancelled ? <p className="account-cutoff">{locked ? "Priprema je počela. Rok za izmene ove dostave je istekao." : <>Možete menjati do <strong>{formatDateTime(sub.cutoffAt)}</strong> (vreme u Beogradu).</>}</p> : <p>Za novu redovnu dostavu izaberite proizvode u <a href="/prodavnica">prodavnici</a>.</p>}
    <div className="account-basket-heading"><h3>Vaši proizvodi</h3><p>Količina i ritam važe za sve naredne redovne dostave.</p></div>
    <ul className="list-clean">{items.map(item => <ItemEditor key={`${item.id}:${item.quantity}:${item.cadence}`} item={item} disabled={disabled} onSave={details => mutate(sub.id, "update_item", details)} onRemove={() => { setRemoveId(item.id); setAction("remove_item"); }} />)}</ul>
    {!cancelled && <div className="account-subtotal"><span>Proizvodi u sledećoj redovnoj dostavi<small>Bez naknade za dostavu. Mesečni obračun je u porudžbinama.</small></span><strong>{formatMoney(nextTotal / 100)}</strong></div>}
    {!cancelled && !paused && <div className="account-quick-actions"><button className="button secondary" disabled={disabled} aria-expanded={action === "skip_next"} onClick={() => setAction(action === "skip_next" ? "" : "skip_next")}><span>Preskoči sledeću</span><small>Samo jedan termin</small></button><button className="button secondary" disabled={disabled} aria-expanded={action === "pause"} onClick={() => { setPauseUntil(addDays(sub.nextDeliveryDate, 14)); setAction(action === "pause" ? "" : "pause"); }}><span>Pauziraj dostave</span><small>Dok ponovo ne budete kod kuće</small></button></div>}
    {action && <section className="account-confirm" aria-label="Potvrda izmene" tabIndex={-1} ref={confirmation}>
      <h3>{action === "skip_next" ? "Preskočiti samo ovu dostavu?" : action === "pause" ? "Kada želite da se dostave nastave?" : action === "remove_item" ? "Ukloniti ovaj proizvod?" : "Trajno otkazati redovnu dostavu?"}</h3>
      {action === "skip_next" ? <p>Preskačete {formatDate(sub.nextDeliveryDate)}. Sledeća redovna dostava biće <strong>{formatDate(sub.afterSkipDate)}</strong>.</p> : action === "pause" ? <><label className="field"><span>Pauziraj do</span><input type="date" min={addDays(sub.nextDeliveryDate, 1)} max={addDays(sub.nextDeliveryDate, 366)} value={pauseUntil} onChange={event => setPauseUntil(event.target.value)} /></label>{pauseUntil > sub.nextDeliveryDate && <p>Do tada ne šaljemo redovne dostave. Prva posle pauze: <strong>{formatDate(pauseDelivery(sub, pauseUntil))}</strong>.</p>}</> : action === "remove_item" ? <p>{items.length === 1 ? "Ovo je poslednji proizvod. Njegovim uklanjanjem otkazujete celu pretplatu." : "Proizvod se uklanja iz svih budućih redovnih dostava, počev od sledeće."}</p> : <p>Sve buduće redovne dostave se otkazuju. Za kratko odsustvo možete umesto toga izabrati pauzu.</p>}
      {sub.nextOnlyAddons.length > 0 && (action === "skip_next" || action === "pause") && <p>Proizvodi dodati samo sledećoj dostavi pomeraju se zajedno sa njom.</p>}
      {(action === "skip_next" || action === "pause" || action === "cancel") && <p className="small-text">Zasebne jednokratne porudžbine ostaju zakazane.</p>}
      <div className="button-row"><button className="button small" disabled={busy || (action !== "resume" && locked) || (action === "pause" && (!pauseUntil || pauseUntil <= sub.nextDeliveryDate || pauseUntil > addDays(sub.nextDeliveryDate, 366)))} onClick={() => void confirm()}>{busy ? "Čuvamo…" : action === "skip_next" ? "Potvrdi preskakanje" : action === "pause" ? "Potvrdi pauzu" : action === "remove_item" ? "Potvrdi uklanjanje" : "Potvrdi otkazivanje"}</button><button className="text-button" disabled={busy} onClick={() => setAction("")}>Odustani</button></div>
    </section>}
    {sub.nextOnlyAddons.length > 0 && <div className="next-addon-summary"><strong>Dodato samo sledećoj dostavi</strong>{sub.nextOnlyAddons.map(addon => <span key={addon.id}>{addon.quantity} × {addon.product_name} · {formatMoney(addon.quantity * addon.unit_price_minor / 100)}</span>)}</div>}
    {!cancelled && <details className="account-extras"><summary>Dodajte nešto samo sledećoj dostavi</summary><section className="next-addon-picker" aria-label="Dodajte sledećoj dostavi"><p>Svaki klik dodaje jedno pakovanje po prikazanoj ceni.</p><div>{products.slice(0, 3).map(product => <button type="button" disabled={disabled} key={product.id} onClick={() => void mutate(sub.id, "add_next_only", { productId: product.id, quantity: 1 })}><span><strong>{product.name}</strong><small>{product.unit}</small></span><b>+ {formatMoney(product.priceRsd)}</b></button>)}</div></section></details>}
    {!cancelled && <div className="account-card-footer"><a href="/kontakt">Pomoć oko dostave</a><button className="text-button" disabled={busy || locked} onClick={() => setAction("cancel")}>Otkaži pretplatu</button></div>}
  </article>;
}
