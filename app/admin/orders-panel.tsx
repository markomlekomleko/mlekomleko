"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  OrderItemEditor,
  type EditableOrder,
} from "../components/order-item-editor";
import { Dialog, obj, rows, email } from "./workspace-shared";
import { formatDate, formatMoney, statusLabel } from "../lib/frontend";

type Row = Record<string, unknown>;
function string(value: unknown, fallback = "-") {
  return typeof value === "string" && value ? value : fallback;
}
function number(value: unknown) {
  return Number(value) || 0;
}
function idOf(value: Row) {
  return String(value.id);
}
const emptyFilters = {
  q: "",
  dateField: "created",
  from: "",
  to: "",
  paymentStatus: "",
  fulfillmentStatus: "",
  paymentMethod: "",
  kind: "",
  sort: "newest",
  customerId: "",
  productId: "",
};
type Filters = typeof emptyFilters;
type OrderPage = {
  orders: Row[];
  total: number;
  page: number;
  pageSize: number;
};

export function OrdersPanel({
  request,
  version,
  busy,
  onSave,
  onExport,
  initialFilters = {},
  canCollectCash = true,
}: {
  initialFilters?: Record<string, string>;
  canCollectCash?: boolean;
  request: <T>(url: string, init?: RequestInit) => Promise<T>;
  version: number;
  busy: boolean;
  onSave: (id: string, payment: string, fulfillment: string) => Promise<boolean>;
  onExport: (id: string, format: "csv" | "xlsx") => Promise<void>;
}) {
  const [draft, setDraft] = useState({ ...emptyFilters, ...initialFilters });
  const [filters, setFilters] = useState({
    ...emptyFilters,
    ...initialFilters,
  });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<OrderPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailNotice, setDetailNotice] = useState("");
  const [detail, setDetail] = useState<Row | null>(null);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState<Row[] | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [bulkNotice, setBulkNotice] = useState("");
  const bulkKey = useRef({body:"",key:""});
  const eligible = (result?.orders ?? []).filter(order=>order.payment_method === "cash" && order.payment_status === "pending" && order.fulfillment_status !== "cancelled");
  const chosen = eligible.filter(order=>selected.includes(idOf(order)));
  async function collectBulk() {
    if (!bulk || !cashConfirmed) return;
    setBulkBusy(true); setError("");
    const body = JSON.stringify({confirmed:true,orders:bulk.map(order=>({id:order.id,expectedUpdatedAt:order.updated_at}))});
    if (bulkKey.current.body !== body) bulkKey.current = {body,key:crypto.randomUUID()};
    try {
      const response = await request<{succeeded:number;failed:number;results:{id:string;success:boolean;message?:string}[]}>("/api/admin/orders/bulk-payment", {method:"POST",headers:{"Idempotency-Key":bulkKey.current.key},body});
      setBulkNotice(`Sačuvano: ${response.succeeded}. Neuspešno: ${response.failed}. ${response.results.filter(r=>!r.success).map(r=>`${bulk.find(o=>o.id===r.id)?.order_number}: ${r.message}`).join(" ")}`);
      setSelected(response.results.filter(r=>!r.success).map(r=>r.id)); setBulk(null); setCashConfirmed(false); bulkKey.current={body:"",key:""}; setRetry(v=>v+1);
    } catch (cause) {setError(cause instanceof Error ? cause.message : "Grupna naplata nije sačuvana.");}
    finally {setBulkBusy(false);}
  }
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      ...filters,
      page: String(page),
      pageSize: "100",
    });
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const next = await request<OrderPage>(`/api/admin/orders?${params}`, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          const lastPage = Math.max(1, Math.ceil(next.total / next.pageSize));
          if (page > lastPage) setPage(lastPage);
          else setResult(next);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setResult(null);
          setError(e instanceof Error ? e.message : "Porudžbine nisu učitane.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [request, filters, page, version, retry]);
  async function openOrder(id: string) {
    try {
      const payload = await request<Row>(`/api/admin/orders/${encodeURIComponent(id)}`);
      const order = obj(payload.order);
      // Fiscal metadata belongs to the existing list API, not the detail API.
      const summary = await request<OrderPage>(`/api/admin/orders?${new URLSearchParams({q: string(order.order_number), pageSize: "50"})}`);
      const fiscal = summary.orders.find(item => idOf(item) === id);
      setDetail({...payload, order: {...order, fiscal_status: fiscal?.fiscal_status, invoice_number: fiscal?.invoice_number}});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Detalji nisu dostupni.");
    }
  }
  function change(key: keyof Filters, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function apply(event: FormEvent) {
    event.preventDefault();
    setFilters({ ...draft });
    setPage(1);
    setSelected([]);
  }
  const invalidRange = Boolean(draft.from && draft.to && draft.from > draft.to);
  return (
    <section className="admin-panel" aria-labelledby="orders-heading">
      <div className="panel-heading">
        <div>
          <h2 id="orders-heading">Porudžbine</h2>
          <p>
            Pretražite sve porudžbine i kombinujte filtere. Datumi se računaju
            po vremenu u Srbiji.
          </p>
        </div>
      </div>
      <form className="admin-form order-filters" onSubmit={apply}>
        <div className="form-grid">
          <label className="field">
            <span>Pretraga porudžbina</span>
            <input
              type="search"
              value={draft.q}
              maxLength={200}
              placeholder="Broj, ime, email ili telefon"
              onChange={(e) => change("q", e.target.value)}
            />
          </label>
        </div>
        <details
          className="work-filter-details"
          open={Object.entries(initialFilters).some(
            ([key, value]) => key !== "q" && !!value,
          )}
        >
          <summary>Još filtera</summary>
          <div className="form-grid">
            <label className="field">
              <span>Period prema</span>
              <select
                value={draft.dateField}
                onChange={(e) => change("dateField", e.target.value)}
              >
                <option value="created">Datumu poručivanja</option>
                <option value="delivery">Datumu dostave</option>
              </select>
            </label>
            <label className="field">
              <span>Datum od</span>
              <input
                type="date"
                value={draft.from}
                onChange={(e) => change("from", e.target.value)}
              />
            </label>
            <label className="field">
              <span>Datum do</span>
              <input
                type="date"
                value={draft.to}
                onChange={(e) => change("to", e.target.value)}
              />
            </label>
            <label className="field">
              <span>Status naplate</span>
              <select
                value={draft.paymentStatus}
                onChange={(e) => change("paymentStatus", e.target.value)}
              >
                <option value="">Svi statusi</option>
                <option value="pending">Na čekanju</option>
                <option value="paid">Plaćeno</option>
                <option value="failed">Neuspešno</option>
                <option value="refunded">Refundirano</option>
              </select>
            </label>
            <label className="field">
              <span>Status isporuke</span>
              <select
                value={draft.fulfillmentStatus}
                onChange={(e) => change("fulfillmentStatus", e.target.value)}
              >
                <option value="">Svi statusi</option>
                <option value="planned">Planirano</option>
                <option value="locked">Zaključano</option>
                <option value="delivered">Isporučeno</option>
                <option value="cancelled">Otkazano</option>
              </select>
            </label>
            <label className="field">
              <span>Način plaćanja</span>
              <select
                value={draft.paymentMethod}
                onChange={(e) => change("paymentMethod", e.target.value)}
              >
                <option value="">Svi načini</option>
                <option value="cash">Gotovina</option>
                <option value="card">Kartica</option>
              </select>
            </label>
            <label className="field">
              <span>Vrsta porudžbine</span>
              <select
                value={draft.kind}
                onChange={(e) => change("kind", e.target.value)}
              >
                <option value="">Sve vrste</option>
                <option value="one_time">Jednokratna</option>
                <option value="subscription_invoice">Pretplata</option>
                <option value="adjustment">Korekcija</option>
              </select>
            </label>
            <label className="field">
              <span>Sortiranje</span>
              <select
                value={draft.sort}
                onChange={(e) => change("sort", e.target.value)}
              >
                <option value="newest">Najnovije prvo</option>
                <option value="oldest">Najstarije prvo</option>
                <option value="delivery">Najbliža dostava</option>
                <option value="total_desc">Iznos: veći prvo</option>
                <option value="total_asc">Iznos: manji prvo</option>
              </select>
            </label>
          </div>
        </details>
        {invalidRange ? (
          <p className="notice error" role="alert">
            Datum od ne može biti posle datuma do.
          </p>
        ) : null}
        <div className="button-row">
          <button
            className="button small"
            type="submit"
            disabled={invalidRange || busy}
          >
            Primeni filtere
          </button>
          <button
            className="button secondary small"
            type="button"
            disabled={busy}
            onClick={() => {
              setDraft(emptyFilters);
              setFilters({ ...emptyFilters });
              setPage(1);
            }}
          >
            Poništi filtere
          </button>
        </div>
      </form>
      {error ? (
        <div className="notice error" role="alert">
          {error}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => setRetry((value) => value + 1)}
          >
            Pokušaj ponovo
          </button>
        </div>
      ) : null}
      {bulkNotice ? <p className="notice" role="status">{bulkNotice}</p> : null}
      {loading && !result ? (
        <p role="status">Učitavamo porudžbine…</p>
      ) : result ? (
        <>
          <p role="status">
            Pronađeno: {result.total} porudžbina
            {result.total
              ? ` · Prikaz ${(result.page - 1) * result.pageSize + 1}–${Math.min(result.page * result.pageSize, result.total)}`
              : ""}
          </p>
          {result.orders.length ? (
            <>
            {canCollectCash && eligible.length ? <div className="work-bulk-bar">
              <label><input type="checkbox" aria-label="Označi sve gotovinske porudžbine na stranici" disabled={loading || bulkBusy} checked={chosen.length === eligible.length} onChange={event=>setSelected(event.target.checked ? eligible.map(idOf) : [])} /> Označi sve na ovoj stranici</label>
              <span>{chosen.length} izabrano · {formatMoney(chosen.reduce((sum,o)=>sum+number(o.total_minor),0)/100)}</span>
              <button className="button small" disabled={!chosen.length || loading || bulkBusy} onClick={()=>{setBulk(chosen);setCashConfirmed(false);}}>Potvrdi primljenu gotovinu</button>
            </div> : null}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {canCollectCash ? <th>Izbor</th> : null}
                    <th>Porudžbina</th>
                    <th>Kupac</th>
                    <th>Datum dostave</th>
                    <th>Ukupno</th>
                    <th>Naplata</th>
                    <th>Račun</th>
                    <th>Status dostave</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {result.orders.map((order) => (
                    <OrderRow
                      key={`${idOf(order)}-${order.updated_at}-${order.payment_status}-${order.fulfillment_status}`}
                      order={order}
                      onOpen={openOrder}
                      selected={selected.includes(idOf(order))}
                      canSelect={canCollectCash}
                      selectionDisabled={loading || bulkBusy || !eligible.includes(order)}
                      onSelect={checked=>setSelected(previous=>checked ? [...previous,idOf(order)] : previous.filter(id=>id!==idOf(order)))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            </>
          ) : (
            <p className="admin-empty">Nema porudžbina za izabrane filtere.</p>
          )}
          {result.total > result.pageSize ? (
            <div className="inline-controls" aria-label="Stranice porudžbina">
              <button
                className="button secondary small"
                type="button"
                disabled={page === 1 || busy}
                onClick={() => {setSelected([]);setPage((value) => value - 1);}}
              >
                Prethodna
              </button>
              <span>
                Stranica {result.page} od{" "}
                {Math.ceil(result.total / result.pageSize)}
              </span>
              <button
                className="button secondary small"
                type="button"
                disabled={page * result.pageSize >= result.total || busy}
                onClick={() => {setSelected([]);setPage((value) => value + 1);}}
              >
                Sledeća
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      {bulk ? <Dialog title="Potvrda gotovinskih uplata" busy={bulkBusy} onClose={()=>setBulk(null)}><div className="work-form">
        <p>Izabrano je <strong>{bulk.length} porudžbina</strong>. Ukupno primljeno: <strong>{formatMoney(bulk.reduce((sum,o)=>sum+number(o.total_minor),0)/100)}</strong>.</p>
        <p>Ovo evidentira uplatu. Uručene količine potvrđujete u Dostavama.</p>
        <label className="work-check"><input type="checkbox" checked={cashConfirmed} onChange={e=>setCashConfirmed(e.target.checked)} /> Potvrđujem da je navedena gotovina stvarno primljena.</label>
        {error ? <p role="alert" className="notice error">{error}</p> : null}
        <button className="button" disabled={bulkBusy || !cashConfirmed} onClick={()=>void collectBulk()}>Sačuvaj {bulk.length} uplata</button>
      </div></Dialog> : null}
      {detail ? (
        <Dialog
          title={string(obj(detail.order).order_number)}
          busy={busy}
          onClose={() => {setDetail(null); setDetailNotice("");}}
        >
          <div className="work-form">
            {detailNotice ? <p role="status" className="notice success">{detailNotice}</p> : null}
            <div>
              <strong>{string(obj(detail.order).full_name)}</strong>
              <p>
                {string(obj(detail.order).phone)} ·{" "}
                {string(obj(detail.order).address_line_1)},{" "}
                {string(obj(detail.order).city)}
              </p>
              <p>
                Dostava {formatDate(string(obj(detail.order).delivery_date))} ·{" "}
                {statusLabel(string(obj(detail.order).fulfillment_status))}
              </p>
              <p className="work-hint">
                Adresa iz trenutnih podataka kupca. Zaključana dostava čuva
                adresu u svom spisku.
              </p>
            </div>
            {rows(detail.items).map((item) => (
              <div className="work-history-row" key={string(item.id)}>
                <span>
                  {number(item.quantity)} × {string(item.unit_label)}{" "}
                  {string(item.product_name)}
                  <small>
                    {item.purchase_type === "subscription"
                      ? "Redovna dostava · iznos za ugovoreni period"
                      : "Jednokratno"}
                  </small>
                </span>
                <strong>
                  {formatMoney(number(item.line_total_minor) / 100)}
                </strong>
              </div>
            ))}
            <p>
              Dostava:{" "}
              {formatMoney(number(obj(detail.order).delivery_fee_minor) / 100)}
            </p>
            <strong>
              Ukupno {formatMoney(number(obj(detail.order).total_minor) / 100)}{" "}
              · {statusLabel(string(obj(detail.order).payment_status))}
            </strong>
            {obj(detail.order).customer_note ? (
              <p>Napomena: {string(obj(detail.order).customer_note)}</p>
            ) : null}
            <OrderActions key={`${idOf(obj(detail.order))}-${obj(detail.order).payment_status}-${obj(detail.order).fulfillment_status}`} order={obj(detail.order)} busy={busy} onSave={onSave} onExport={onExport} onSaved={async () => {await openOrder(idOf(obj(detail.order))); setDetailNotice("Status porudžbine je sačuvan.");}} />
            <OrderItemEditor
              key={string(obj(detail.order).updated_at)}
              detail={detail as EditableOrder}
              request={request}
              admin
              onSaved={() => {
                void openOrder(string(obj(detail.order).id));
                setRetry((value) => value + 1);
              }}
            />
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}
function OrderRow({order, onOpen, canSelect, selected, selectionDisabled, onSelect}: {order: Row; onOpen: (id: string) => void; canSelect:boolean;selected:boolean;selectionDisabled:boolean;onSelect:(checked:boolean)=>void}) {
  return <tr>
    {canSelect ? <td data-label="Izbor"><input type="checkbox" aria-label={`Izaberi uplatu ${string(order.order_number)}`} checked={selected} disabled={selectionDisabled} onChange={e=>onSelect(e.target.checked)} /></td> : null}
    <td data-label="Porudžbina"><button className="text-button" onClick={() => onOpen(idOf(order))}>{string(order.order_number)} →</button><br /><small>{formatDate(string(order.created_at, ""))}</small></td>
    <td data-label="Kupac">{string(order.full_name)}<br /><small>{email(order.email)}</small></td>
    <td data-label="Datum dostave">{formatDate(string(order.delivery_date, ""))}</td>
    <td data-label="Ukupno">{formatMoney(number(order.total_minor) / 100)}</td>
    <td data-label="Naplata"><span className="work-badge">{statusLabel(string(order.payment_status))}</span></td>
    <td data-label="Račun"><span className="work-badge">{statusLabel(string(order.fiscal_status, order.payment_status === "paid" ? "pending" : "nije dospeo"))}</span>{order.invoice_number ? <small>{string(order.invoice_number)}</small> : null}</td>
    <td data-label="Status dostave"><span className="work-badge">{statusLabel(string(order.fulfillment_status))}</span></td>
    <td data-label="Detalji"><button className="button secondary small" onClick={() => onOpen(idOf(order))}>Otvori porudžbinu</button></td>
  </tr>;
}
function OrderActions({order, busy, onSave, onExport, onSaved}: {
  order: Row; busy: boolean; onSave: (id: string, payment: string, fulfillment: string) => Promise<boolean>;
  onExport: (id: string, format: "csv" | "xlsx") => Promise<void>; onSaved: () => Promise<void>;
}) {
  const [payment, setPayment] = useState(string(order.payment_status, "pending"));
  const [fulfillment, setFulfillment] = useState(string(order.fulfillment_status, "planned"));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      if (await onSave(idOf(order), payment, fulfillment)) await onSaved();
      else setError("Izmena nije sačuvana. Proverite poruku o grešci i pokušajte ponovo.");
    } finally {setSaving(false);}
  }
  async function download(format: "csv" | "xlsx") {
    setError(""); setSaving(true);
    try {await onExport(idOf(order), format);} catch (cause) {setError(cause instanceof Error ? cause.message : "Izvoz nije generisan.");} finally {setSaving(false);}
  }
  return <section className="work-order-actions"><h3>Naplata i status dostave</h3>
    <p>Izaberite status i sačuvajte promenu za ovu porudžbinu.</p>
    <form className="work-form" onSubmit={save}><div className="form-grid">
      <label className="field"><span>Naplata porudžbine {string(order.order_number)}</span><select value={payment} onChange={e => setPayment(e.target.value)} disabled={busy || saving}><option value="pending">Na čekanju</option><option value="paid">Plaćeno</option><option value="failed">Neuspešno</option><option value="refunded">Refundirano</option></select></label>
      <label className="field"><span>Dostava porudžbine {string(order.order_number)}</span><select value={fulfillment} onChange={e => setFulfillment(e.target.value)} disabled={busy || saving}><option value="planned">Planirano</option><option value="locked">Zaključano</option><option value="delivered">Isporučeno</option><option value="cancelled">Otkazano</option></select></label>
    </div><button className="button" disabled={busy || saving}>{saving ? "Čuvamo…" : "Sačuvaj status"}</button>
    {error ? <p role="alert" className="notice error">{error}</p> : null}</form>
    <h3>Račun i potvrde</h3><p>{statusLabel(string(order.fiscal_status, order.payment_status === "paid" ? "pending" : "nije dospeo"))}{order.invoice_number ? ` · ${string(order.invoice_number)}` : ""}</p>
    <div className="button-row"><button className="button secondary" disabled={busy || saving} onClick={() => void download("xlsx")}>Potvrda Excel</button><button className="button secondary" disabled={busy || saving} onClick={() => void download("csv")}>Potvrda CSV</button></div>
  </section>;
}
