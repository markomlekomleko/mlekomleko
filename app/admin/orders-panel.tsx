"use client";

import { useEffect, useState, type FormEvent } from "react";
import { formatDate, formatMoney, statusLabel } from "../lib/frontend";

type Row = Record<string, unknown>;
function string(value: unknown, fallback = "-") { return typeof value === "string" && value ? value : fallback; }
function number(value: unknown) { return Number(value) || 0; }
function idOf(value: Row) { return String(value.id); }
const emptyFilters = { q: "", dateField: "created", from: "", to: "", paymentStatus: "", fulfillmentStatus: "", paymentMethod: "", kind: "", sort: "newest" };
type Filters = typeof emptyFilters;
type OrderPage = { orders: Row[]; total: number; page: number; pageSize: number };

export function OrdersPanel({ request, version, busy, onSave, onExport }: {
  request: <T>(url: string, init?: RequestInit) => Promise<T>; version: number; busy: boolean;
  onSave: (id: string, payment: string, fulfillment: string) => void;
  onExport: (id: string, format: "csv" | "xlsx") => Promise<void>;
}) {
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<OrderPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ ...filters, page: String(page), pageSize: "50" });
    void (async () => {
      setLoading(true); setError("");
      try {
        const next = await request<OrderPage>(`/api/admin/orders?${params}`, { signal: controller.signal });
        if (!controller.signal.aborted) {
          const lastPage = Math.max(1, Math.ceil(next.total / next.pageSize));
          if (page > lastPage) setPage(lastPage);
          else setResult(next);
        }
      } catch (e) { if (!controller.signal.aborted) { setResult(null); setError(e instanceof Error ? e.message : "Porudžbine nisu učitane."); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [request, filters, page, version, retry]);
  function change(key: keyof Filters, value: string) { setDraft(current => ({ ...current, [key]: value })); }
  function apply(event: FormEvent) { event.preventDefault(); setFilters({ ...draft }); setPage(1); }
  const invalidRange = Boolean(draft.from && draft.to && draft.from > draft.to);
  return <section className="admin-panel" aria-labelledby="orders-heading">
    <div className="panel-heading"><div><h2 id="orders-heading">Porudžbine</h2><p>Pretražite sve porudžbine i kombinujte filtere. Datumi se računaju po vremenu u Srbiji.</p></div></div>
    <form className="admin-form order-filters" onSubmit={apply}>
      <div className="form-grid">
        <label className="field"><span>Pretraga porudžbina</span><input type="search" value={draft.q} maxLength={200} placeholder="Broj, ime, email ili telefon" onChange={e => change("q", e.target.value)} /></label>
        <label className="field"><span>Period prema</span><select value={draft.dateField} onChange={e => change("dateField", e.target.value)}><option value="created">Datumu poručivanja</option><option value="delivery">Datumu dostave</option></select></label>
        <label className="field"><span>Datum od</span><input type="date" value={draft.from} onChange={e => change("from", e.target.value)} /></label>
        <label className="field"><span>Datum do</span><input type="date" value={draft.to} onChange={e => change("to", e.target.value)} /></label>
        <label className="field"><span>Status naplate</span><select value={draft.paymentStatus} onChange={e => change("paymentStatus", e.target.value)}><option value="">Svi statusi</option><option value="pending">Na čekanju</option><option value="paid">Plaćeno</option><option value="failed">Neuspešno</option><option value="refunded">Refundirano</option></select></label>
        <label className="field"><span>Status isporuke</span><select value={draft.fulfillmentStatus} onChange={e => change("fulfillmentStatus", e.target.value)}><option value="">Svi statusi</option><option value="planned">Planirano</option><option value="locked">Zaključano</option><option value="delivered">Isporučeno</option><option value="cancelled">Otkazano</option></select></label>
        <label className="field"><span>Način plaćanja</span><select value={draft.paymentMethod} onChange={e => change("paymentMethod", e.target.value)}><option value="">Svi načini</option><option value="cash">Gotovina</option><option value="card">Kartica</option></select></label>
        <label className="field"><span>Vrsta porudžbine</span><select value={draft.kind} onChange={e => change("kind", e.target.value)}><option value="">Sve vrste</option><option value="one_time">Jednokratna</option><option value="subscription_invoice">Pretplata</option><option value="adjustment">Korekcija</option></select></label>
        <label className="field"><span>Sortiranje</span><select value={draft.sort} onChange={e => change("sort", e.target.value)}><option value="newest">Najnovije prvo</option><option value="oldest">Najstarije prvo</option><option value="delivery">Najbliža dostava</option><option value="total_desc">Iznos: veći prvo</option><option value="total_asc">Iznos: manji prvo</option></select></label>
      </div>
      {invalidRange ? <p className="notice error" role="alert">Datum od ne može biti posle datuma do.</p> : null}
      <div className="button-row"><button className="button small" type="submit" disabled={invalidRange || busy}>Primeni filtere</button><button className="button secondary small" type="button" disabled={busy} onClick={() => { setDraft(emptyFilters); setFilters({ ...emptyFilters }); setPage(1); }}>Poništi filtere</button></div>
    </form>
    {error ? <div className="notice error" role="alert">{error} <button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>Pokušaj ponovo</button></div> : null}
    {loading && !result ? <p role="status">Učitavamo porudžbine…</p> : result ? <>
      <p role="status">Pronađeno: {result.total} porudžbina{result.total ? ` · Prikaz ${(result.page - 1) * result.pageSize + 1}–${Math.min(result.page * result.pageSize, result.total)}` : ""}</p>
      {result.orders.length ? <div className="table-wrap"><table><thead><tr><th>Porudžbina</th><th>Kupac</th><th>Dostava</th><th>Ukupno</th><th>Naplata</th><th>Račun</th><th>Ispunjenje</th><th></th></tr></thead><tbody>{result.orders.map(order => <OrderRow key={`${idOf(order)}-${order.updated_at}-${order.payment_status}-${order.fulfillment_status}`} order={order} busy={busy} onSave={onSave} onExport={onExport} />)}</tbody></table></div> : <p className="admin-empty">Nema porudžbina za izabrane filtere.</p>}
      {result.total > result.pageSize ? <div className="inline-controls" aria-label="Stranice porudžbina"><button className="button secondary small" type="button" disabled={page === 1 || busy} onClick={() => setPage(value => value - 1)}>Prethodna</button><span>Stranica {result.page} od {Math.ceil(result.total / result.pageSize)}</span><button className="button secondary small" type="button" disabled={page * result.pageSize >= result.total || busy} onClick={() => setPage(value => value + 1)}>Sledeća</button></div> : null}
    </> : null}
  </section>;
}
function OrderRow({ order, busy, onSave, onExport }: { order: Row; busy: boolean; onSave: (id: string, payment: string, fulfillment: string) => void; onExport: (id: string, format: "csv" | "xlsx") => Promise<void> }) {
  const [payment, setPayment] = useState(string(order.payment_status, "pending")); const [fulfillment, setFulfillment] = useState(string(order.fulfillment_status, "planned"));
  return <tr><td><strong>{string(order.order_number)}</strong><br /><small>{formatDate(string(order.created_at, ""))}</small></td><td>{string(order.full_name)}<br /><small>{string(order.email)}</small></td><td>{formatDate(string(order.delivery_date, ""))}</td><td>{formatMoney(number(order.total_minor) / 100)}</td><td><select aria-label={`Naplata porudžbine ${string(order.order_number)}`} value={payment} onChange={(e) => setPayment(e.target.value)}><option value="pending">Na čekanju</option><option value="paid">Plaćeno</option><option value="failed">Neuspešno</option><option value="refunded">Refundirano</option></select></td><td><span className={`status-pill ${string(order.fiscal_status) === "issued" ? "active" : ""}`}>{statusLabel(string(order.fiscal_status, payment === "paid" ? "pending" : "nije dospeo"))}</span>{order.invoice_number ? <><br /><small>{string(order.invoice_number)}</small></> : null}</td><td><select aria-label={`Ispunjenje porudžbine ${string(order.order_number)}`} value={fulfillment} onChange={(e) => setFulfillment(e.target.value)}><option value="planned">Planirano</option><option value="locked">Zaključano</option><option value="delivered">Isporučeno</option><option value="cancelled">Otkazano</option></select></td><td><button className="button secondary small" type="button" disabled={busy} onClick={() => onSave(idOf(order), payment, fulfillment)}>Sačuvaj</button><div className="row-actions"><button type="button" disabled={busy} onClick={() => void onExport(idOf(order), "xlsx")}>Potvrda Excel</button><button type="button" disabled={busy} onClick={() => void onExport(idOf(order), "csv")}>Potvrda CSV</button></div></td></tr>;
}
