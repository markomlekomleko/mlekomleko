"use client";
import { useEffect, useState } from "react";
import { num, obj, rows, str, today, type Requester, type Row } from "./workspace-shared";
export function TodayPreparation({request, version, onDelivery}: {request: Requester; version: number; onDelivery: (date: string) => void}) {
  const [data, setData] = useState<Row | null>(null), [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); request<Row>(`/api/admin/delivery-preview?date=${today()}`, {signal: controller.signal}).then(setData).catch(e => {if (!controller.signal.aborted) setError(e.message);}); return () => controller.abort(); }, [request, version]);
  const orders = rows(data?.orders);
  const names = [...new Set(orders.map(order => str(obj(order.customer_snapshot).fullName)))];
  const customers = new Set(orders.map(order => str(order.customer_id)));
  return <section className="admin-panel today-preparation"><div className="panel-heading"><div><p className="eyebrow">DANAS ZA PRIPREMU</p><h2>Kupci: {customers.size} · Pakovanja: {rows(data?.preparation).reduce((sum, line) => sum + num(line.total_quantity), 0)}</h2><p>Jednokratno: {orders.filter(order => !order.subscription_id).length} · Pretplata: {orders.filter(order => order.subscription_id).length}</p></div><button className="button" onClick={() => onDelivery(today())}>Otvori današnji spisak</button></div>{error ? <p role="alert">{error}</p> : null}<div className="work-pack-totals">{rows(data?.preparation).map(line => <article key={str(line.product_id)}><span>{str(line.product_name)}</span><strong>{num(line.total_quantity)} <small>× {str(line.unit_label)}</small></strong></article>)}</div>{orders.length ? <p>{names.join(" · ")}</p> : <p>{data ? "Danas nema zakazanih dostava." : "Učitavamo današnji spisak…"}</p>}</section>;
}
