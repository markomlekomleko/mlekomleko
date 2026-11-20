"use client";

import { useState, type FormEvent } from "react";
import { formatMoney, minimumUnits, quantityLabel, type Product } from "../lib/frontend";

type Row = Record<string, unknown>;
type BundleLine = { productId: string; quantity: number; purchaseType: "one_time" | "subscription" };

/** Deliveries in one prepaid subscription package. */
const PACKAGE_DELIVERIES = 4;

function row(value: unknown): Row { return value && typeof value === "object" ? value as Row : {}; }
function list(value: unknown) { return Array.isArray(value) ? value.map(row) : []; }
function string(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function bool(value: unknown) { return value === true || value === 1 || value === "1"; }

export function ProfitDashboard({ dashboard }: { dashboard: Row }) {
  const profit = row(dashboard.profit);
  const retention = row(dashboard.retention);
  const postal = list(dashboard.postalProfit);
  const channels = list(dashboard.channelProfit);
  const revenue = number(profit.revenue_minor);
  const contribution = number(profit.contribution_minor);
  const margin = revenue > 0 ? contribution / revenue * 100 : 0;
  const paidOrders = number(retention.paid_orders);
  const subscriptionRate = paidOrders > 0 ? number(retention.subscription_orders) / paidOrders * 100 : 0;
  return <div className="admin-stack">
    <div className="dashboard-grid revenue-grid"><RevenueStat label="Plaćeni prihod" value={formatMoney(revenue / 100)} note="Posle popusta i sa naplaćenom dostavom" /><RevenueStat label="Contribution margin" value={formatMoney(contribution / 100)} note={`${margin.toFixed(1)}% prihoda`} /><RevenueStat label="Aktivne pretplate" value={number(retention.active)} note={`${number(retention.cancelled_30d)} otkazanih u 30 dana`} /><RevenueStat label="Subscription rate" value={`${subscriptionRate.toFixed(1)}%`} note={`${number(retention.subscription_orders)} plaćenih porudžbina sa ritmom`} /></div>
    <div className="admin-grid-2">
      <section className="admin-panel"><div className="panel-heading"><div><h2>Gde odlazi prihod</h2><p>Troškovi su procene iz proizvoda i podešavanja.</p></div></div><dl className="profit-waterfall"><div><dt>Prihod</dt><dd>{formatMoney(revenue / 100)}</dd></div><div><dt>Proizvodi i ambalaža</dt><dd>−{formatMoney(number(profit.product_cost_minor) / 100)}</dd></div><div><dt>Dostava</dt><dd>−{formatMoney(number(profit.delivery_cost_minor) / 100)}</dd></div><div><dt>Payment fee</dt><dd>−{formatMoney(number(profit.payment_fees_minor) / 100)}</dd></div><div className="total"><dt>Contribution</dt><dd>{formatMoney(contribution / 100)}</dd></div></dl></section>
      <section className="admin-panel"><div className="panel-heading"><div><h2>Retention poluge</h2><p>Stvarni događaji, ne projekcije.</p></div></div><dl className="profit-waterfall"><div><dt>Sačuvane korpe</dt><dd>{number(retention.recoverable_carts)}</dd></div><div><dt>Vraćene korpe</dt><dd>{number(retention.recovered_carts)}</dd></div><div><dt>Add-on vrednost</dt><dd>{formatMoney(number(retention.addon_value_minor) / 100)}</dd></div><div><dt>Sve pretplate</dt><dd>{number(retention.total)}</dd></div></dl></section>
    </div>
    <div className="admin-grid-2"><MiniProfitTable title="Profit po poštanskom broju" keyLabel="Zona" rows={postal} keyField="postal_code" /><MiniProfitTable title="Profit po kanalu" keyLabel="Kanal" rows={channels} keyField="channel" /></div>
  </div>;
}

function RevenueStat({ label, value, note }: { label: string; value: string | number; note: string }) { return <article className="admin-panel stat-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function MiniProfitTable({ title, keyLabel, rows, keyField }: { title: string; keyLabel: string; rows: Row[]; keyField: string }) { return <section className="admin-panel"><div className="panel-heading"><h2>{title}</h2></div>{rows.length ? <div className="table-wrap"><table><thead><tr><th>{keyLabel}</th><th>Porudžbine</th><th>Prihod</th><th>Contribution</th></tr></thead><tbody>{rows.map((item, index) => <tr key={`${string(item[keyField], "direct")}-${index}`}><td><strong>{string(item[keyField], "direct")}</strong></td><td>{number(item.orders)}</td><td>{formatMoney(number(item.revenue_minor) / 100)}</td><td>{formatMoney(number(item.contribution_minor) / 100)}</td></tr>)}</tbody></table></div> : <p className="admin-empty">Podaci će se pojaviti posle plaćenih porudžbina.</p>}</section>; }

function purchaseLabel(value: unknown) { return value === "subscription" ? "pretplata, svake nedelje" : "jednokratno"; }

/** Prices as the server derives them: products only, delivery is charged per delivery on top. */
function BundlePrices({ bundle }: { bundle: Row }) {
  const packageMinor = bundle.subscriptionPackageMinor == null ? null : number(bundle.subscriptionPackageMinor);
  return <div className="bundle-admin-prices">
    {packageMinor != null ? <><strong>{formatMoney(packageMinor / 100)}</strong><small>{`pretplata: paket od ${number(bundle.packageDeliveries) || PACKAGE_DELIVERIES} dostave (${formatMoney(number(bundle.perDeliveryMinor) / 100)} po dostavi)`}</small></> : null}
    <strong>{formatMoney(number(bundle.oneTimeMinor) / 100)}</strong><small>jednokratno, jedna dostava</small>
    <small>Dostava se naplaćuje posebno, po dostavi.</small>
  </div>;
}

export function BundleAdmin({ products, bundles, busy, onSave, onDelete }: { products: Product[]; bundles: Row[]; busy: boolean; onSave: (id: string | null, payload: Row) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);
  return <section className="admin-panel"><div className="panel-heading"><div><h2>Prodajni paketi</h2><p>Objavljen paket se prikazuje u prodavnici, ispod proizvoda, kada su svi njegovi proizvodi u prodaji. Cena se uvek računa iz aktuelnih cena proizvoda, bez posebnog popusta.</p></div><button className="button small" type="button" disabled={busy} onClick={() => setEditing(null)}>＋ Novi paket</button></div>
    {editing !== undefined ? <BundleEditor key={string(editing?.id) || "new"} bundle={editing} products={products} busy={busy} onCancel={() => setEditing(undefined)} onSave={async (payload) => { await onSave(string(editing?.id) || null, payload); setEditing(undefined); }} /> : null}
    <div className="bundle-admin-list">{bundles.map((bundle) => {
      const active = bool(bundle.isActive);
      const available = bool(bundle.available);
      return <article key={string(bundle.id)}>
        <div><span className="tag">{bool(bundle.isFeatured) ? "PREDLOG" : "PAKET"}</span><h3>{string(bundle.name)}</h3><p>{string(bundle.description)}</p><small>{list(bundle.lines).map((line) => `${quantityLabel(number(line.quantity), string(line.unitLabel))} ${string(line.productName)} (${purchaseLabel(line.purchaseType)})`).join(" · ")}</small></div>
        <BundlePrices bundle={bundle} />
        <span className={`status-pill ${active && available ? "active" : ""}`}>{!active ? "Sakriven" : available ? "Objavljen" : "Nedostupni proizvodi"}</span>
        <div className="row-actions"><button type="button" disabled={busy} onClick={() => setEditing(bundle)}>Izmeni</button><button type="button" disabled={busy} onClick={() => void onSave(string(bundle.id), { isActive: !active }).catch(() => undefined)}>{active ? "Sakrij" : "Objavi"}</button><button className="danger-text" type="button" disabled={busy} onClick={() => void onDelete(string(bundle.id))}>Obriši</button></div>
      </article>;
    })}{!bundles.length ? <p className="admin-empty">Nema paketa. Napravi prvi klikom na „Novi paket“.</p> : null}</div>
  </section>;
}

function BundleEditor({ bundle, products, busy, onSave, onCancel }: { bundle: Row | null; products: Product[]; busy: boolean; onSave: (payload: Row) => Promise<void>; onCancel: () => void }) {
  // Only products on sale can go into a package; a stored line keeps its product visible so it can be replaced.
  const sellable = products.filter(product => product.available);
  const defaultProduct = sellable[0];
  // The editor is keyed by package, so the lines are read once when it opens.
  const [lines, setLines] = useState<BundleLine[]>(() => {
    const lines = list(bundle?.lines);
    return lines.length ? lines.map((line) => ({ productId: string(line.productId), quantity: Math.max(1, number(line.quantity)), purchaseType: string(line.purchaseType) === "subscription" ? "subscription" : "one_time" })) : defaultProduct ? [{ productId: defaultProduct.id, quantity: minimumUnits(defaultProduct.unit), purchaseType: defaultProduct.allowSubscription ? "subscription" : "one_time" }] : [];
  });
  const productOf = (id: string) => products.find(product => product.id === id);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const values = new FormData(event.currentTarget); try { await onSave({ slug: values.get("slug"), eyebrow: values.get("eyebrow"), name: values.get("name"), description: values.get("description"), sortOrder: Number(values.get("sortOrder") || 0), isFeatured: values.get("isFeatured") === "on", isActive: values.get("isActive") === "on", items: lines.map(line => ({ ...line, ...(line.purchaseType === "subscription" ? { cadence: "weekly" } : {}) })) }); } catch { /* Parent surface keeps the editor open and shows the API error. */ } }
  function updateLine(index: number, change: Partial<BundleLine>) { setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...change } : line)); }
  const offersSubscription = lines.some(line => line.purchaseType === "subscription");
  const unitPrice = (line: BundleLine, purchaseType = line.purchaseType) => { const product = productOf(line.productId); return product ? purchaseType === "subscription" ? product.subscriptionPriceRsd : product.priceRsd : 0; };
  const perDelivery = lines.reduce((sum, line) => sum + unitPrice(line) * line.quantity, 0);
  const packageTotal = lines.reduce((sum, line) => sum + unitPrice(line) * line.quantity * (line.purchaseType === "subscription" ? PACKAGE_DELIVERIES : 1), 0);
  const oneTime = lines.reduce((sum, line) => sum + unitPrice(line, "one_time") * line.quantity, 0);
  return <form className="admin-editor admin-form" onSubmit={(event) => void submit(event)}>
    <div className="panel-heading"><div><h2>{bundle ? `Izmeni: ${string(bundle.name)}` : "Novi paket"}</h2><p>Stavka „Pretplata“ znači paket od {PACKAGE_DELIVERIES} nedeljne dostave, plaćen unapred. Paket sa bar jednom takvom stavkom kupac može da uzme i jednokratno. Najmanje 2 l mleka po stavci.</p></div><button className="text-button" type="button" onClick={onCancel}>Zatvori ×</button></div>
    <div className="form-grid"><label className="field"><span>Naziv</span><input name="name" defaultValue={string(bundle?.name)} required maxLength={140} /></label><label className="field"><span>Slug (adresa)</span><input name="slug" defaultValue={string(bundle?.slug)} pattern="[a-z0-9]+(-[a-z0-9]+)*" title="Mala slova, brojevi i crtice između reči" required /></label><label className="field"><span>Nadnaslov</span><input name="eyebrow" defaultValue={string(bundle?.eyebrow, "Paket")} maxLength={100} /></label><label className="field"><span>Redosled</span><input name="sortOrder" type="number" min="0" defaultValue={number(bundle?.sortOrder)} /></label></div>
    <label className="field"><span>Opis</span><textarea name="description" defaultValue={string(bundle?.description)} maxLength={500} /></label>
    <div className="bundle-line-editor">{!sellable.length ? <p className="notice">Nijedan proizvod trenutno nije u prodaji. Prvo uključi proizvod, zatim napravi paket.</p> : null}<strong>Stavke paketa (po dostavi)</strong>
      {lines.map((line, index) => { const product = productOf(line.productId); const minimum = product ? minimumUnits(product.unit) : 1; return <div className="bundle-line" key={index}>
        <select aria-label={`Proizvod ${index + 1}`} value={line.productId} onChange={(event) => { const next = productOf(event.target.value); updateLine(index, { productId: event.target.value, purchaseType: next?.allowSubscription ? line.purchaseType : "one_time", quantity: Math.max(line.quantity, next ? minimumUnits(next.unit) : 1) }); }}>{product && !product.available ? <option value={product.id}>{product.name} (nije u prodaji)</option> : null}{!product ? <option value={line.productId}>Nepoznat proizvod</option> : null}{sellable.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit}</option>)}</select>
        <input aria-label={`Količina ${index + 1}`} type="number" min={minimum} max="100" value={line.quantity} onChange={(event) => updateLine(index, { quantity: Math.max(1, Math.min(100, Math.trunc(Number(event.target.value)) || 1)) })} />
        <select aria-label={`Način kupovine ${index + 1}`} value={line.purchaseType} onChange={(event) => updateLine(index, { purchaseType: event.target.value as BundleLine["purchaseType"] })}><option value="subscription" disabled={!product?.allowSubscription}>Pretplata · nedeljno</option><option value="one_time">Jednokratno</option></select>
        <button className="text-button danger-text" type="button" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>Ukloni</button>
        {product && line.quantity < minimum ? <small className="field-error" role="alert">{`Najmanje ${quantityLabel(minimum, product.unit)} po dostavi.`}</small> : null}
      </div>; })}
      <button className="button secondary small" type="button" disabled={busy || !sellable.length || lines.length >= 20} onClick={() => defaultProduct && setLines((current) => [...current, { productId: defaultProduct.id, quantity: minimumUnits(defaultProduct.unit), purchaseType: defaultProduct.allowSubscription ? "subscription" : "one_time" }])}>＋ Dodaj stavku</button>
      {lines.length ? <p className="bundle-editor-prices">{offersSubscription ? `Pretplata: ${formatMoney(perDelivery)} po dostavi, paket od ${PACKAGE_DELIVERIES} dostave ${formatMoney(packageTotal)}. ` : ""}{`Jednokratno: ${formatMoney(oneTime)}. Bez dostave; cene su redovne, a eventualna akcijska cena se primenjuje automatski.`}</p> : null}
    </div>
    <div className="check-grid"><label className="checkbox-row"><input type="checkbox" name="isFeatured" defaultChecked={bool(bundle?.isFeatured)} /><span>Oznaka „Predlog“</span></label><label className="checkbox-row"><input type="checkbox" name="isActive" defaultChecked={bundle ? bool(bundle.isActive) : true} /><span>Objavljen u prodavnici</span></label></div>
    <div className="button-row"><button className="button" disabled={busy || !lines.length} type="submit">Sačuvaj paket</button><button className="button secondary" type="button" onClick={onCancel}>Odustani</button></div>
  </form>;
}
