"use client";
import { useEffect, useState } from "react";
import { formatDate, formatMoney } from "../lib/frontend";
import { num, rows, str, type Requester, type Row } from "./workspace-shared";
export function PackageProgress({request, version}: {request: Requester; version: number}) {
  const [lines, setLines] = useState<Row[]>([]), [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); request<Row>("/api/admin/packages", {signal: controller.signal}).then(value => {setLines(rows(value.lines)); setError("");}).catch(e => {if (!controller.signal.aborted) setError(e.message);}); return () => controller.abort(); }, [request, version]);
  const groups = [...new Set(lines.map(line => str(line.order_id)))];
  return <section className="admin-panel"><div className="panel-heading"><div><h2>Paketi i preostale dostave</h2><p>4 dostave svake nedelje ili 2 svake druge. Pauza čuva preostalu količinu.</p></div><span className="work-badge">{groups.length} otvorenih paketa</span></div>
    {error ? <p role="alert">{error}</p> : null}
    {!groups.length && !error ? <p>Nema otvorenih paketa.</p> : groups.map(id => {const items = lines.filter(line => line.order_id === id), first = items[0]; return <article className="package-progress-card" key={id}><div><h3>{str(first.full_name)}</h3><p>{str(first.order_number)} · {formatMoney(num(first.total_minor) / 100)}</p><span className="work-badge">{first.payment_status !== "paid" ? "Čeka uplatu — ne pripremati" : first.pause_until ? `Pauza do ${formatDate(str(first.pause_until))}` : `Sledeći termin ${formatDate(str(first.next_delivery_date))}`}</span>{num(first.renewal_enabled) === 0 ? <p>Bez obnove. Isporučujemo preostali plaćeni paket.</p> : null}</div><div>{items.map(line => <div className="package-line-progress" key={str(line.line_id)}><strong>{num(line.quantity)} × {str(line.product_name)} <small>({str(line.unit_label)})</small></strong><span>{line.purchase_type === "one_time" ? "Jednom" : line.cadence === "weekly" ? "Svake nedelje" : "Svake druge nedelje"} · Uručeno {num(line.delivered_units)}/{num(line.required_units)} komada</span><progress aria-label={`${str(line.product_name)} — isporučene dostave`} max={num(line.required_units)} value={num(line.delivered_units)} /><small>Preostalo: {num(line.required_units) - num(line.delivered_units) - num(line.cancelled_quantity)} pakovanja</small></div>)}</div></article>;})}
  </section>;
}
