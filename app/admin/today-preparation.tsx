"use client";
import { useEffect, useState } from "react";
import { formatDate, formatMoney } from "../lib/frontend";
import { num, obj, rows, str, type Requester, type Row } from "./workspace-shared";
export function TodayPreparation({request, version, date, title, onDelivery}: {request: Requester; version: number; date: string; title: string; onDelivery: (date: string) => void}) {
  const [result, setResult] = useState<{date: string; data: Row} | null>(null), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    request<Row>(`/api/admin/delivery-preview?date=${date}`, {signal: controller.signal})
      .then(data => {if (!controller.signal.aborted) {setResult({date, data}); setError("");}})
      .catch(cause => {if (!controller.signal.aborted) {setResult(null); setError(cause.message);}});
    return () => controller.abort();
  }, [request, version, date, retry]);
  const data = result?.date === date ? result.data : null;
  const orders = rows(data?.orders), preparation = rows(data?.preparation);
  const customers = new Set(orders.map(order => str(order.customer_id)));
  const cashOrders = [...new Map(orders.flatMap(order => Array.isArray(order.cash_orders) ? rows(order.cash_orders) : [{id:order.id,total_minor:order.cash_due_minor,is_package:order.subscription_id ? 1 : 0}]).map(order=>[str(order.id),order])).values()];
  const cash = (subscription: boolean) => cashOrders.filter(order => Boolean(num(order.is_package)) === subscription).reduce((sum, order) => sum + num(order.total_minor), 0);
  return <section className="admin-panel today-preparation" aria-label={`${title} — ${formatDate(date)}`}>
    <div className="panel-heading"><div><p className="eyebrow">{title}</p><h2>{formatDate(date)}</h2></div>{data ? <span className="work-badge">{["locked", "completed"].includes(str(obj(data.delivery).status)) ? "Spisak je zaključan" : "Otvoreno za pripremu"}</span> : null}</div>
    {error ? <p role="alert" className="notice error">{error} <button className="text-button" onClick={() => setRetry(v => v + 1)}>Pokušaj ponovo</button></p> : !data ? <p role="status">Učitavamo spisak…</p> : <>
      <div className="work-day-summary"><div><span>Dostave</span><strong>{orders.length}</strong><small>{customers.size} kupaca</small></div><div><span>Za pripremu</span><strong>{preparation.reduce((sum, line) => sum + num(line.total_quantity), 0)}</strong><small>pakovanja</small></div><div><span>Za naplatu · jednokratno</span><strong>{formatMoney(cash(false) / 100)}</strong><small>Za ovaj datum</small></div></div>
      {orders.some(order => order.subscription_id) ? <p className="work-hint">Gotovina za cele pakete pri prvoj dostavi: {formatMoney(cash(true) / 100)}. Već plaćeni paketi se ne naplaćuju ponovo.</p> : null}
      <div className="work-pack-totals">{preparation.map(line => <article key={str(line.product_id)}><span>{str(line.product_name)}</span><strong>{num(line.total_quantity)} <small>× {str(line.unit_label)}</small></strong></article>)}</div>
      {orders.length ? <details className="work-filter-details"><summary>Kupci i vrste dostava</summary><p>Jednokratno: {orders.filter(order => !order.subscription_id).length} · Redovne dostave: {orders.filter(order => order.subscription_id).length}</p><p>{[...new Set(orders.map(order => str(obj(order.customer_snapshot).fullName)))].join(" · ")}</p></details> : <p>Nema zakazanih dostava za ovaj datum.</p>}
      <button className="button" onClick={() => onDelivery(date)}>Otvori spisak</button>
    </>}
  </section>;
}
