"use client";
import { useEffect, useState } from "react";
import { TodayPreparation } from "./today-preparation";
import { formatDate, formatMoney } from "../lib/frontend";
import { actionLabel, Empty, num, obj, rows, str, shortDate, today, type Requester, type Row } from "./workspace-shared";
export function Overview({request, version, onDelivery, onCustomer, onOrders, onSettings}: {
  request: Requester; version: number; onDelivery: (date: string) => void;
  onCustomer: (id: string) => void; onOrders: (filters: Record<string,string>) => void; onSettings: () => void;
}) {
  const [data, setData] = useState<Row | null>(null), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  const date = today();
  useEffect(() => {
    const controller = new AbortController();
    request<Row>(`/api/admin/insights?${new URLSearchParams({from: date, to: date})}`, {signal: controller.signal})
      .then(value => { if (!controller.signal.aborted) {setData(value); setError("");} })
      .catch(cause => {if (!controller.signal.aborted) {setData(null); setError(cause.message);}});
    return () => controller.abort();
  }, [request, version, retry, date]);
  const changes = rows(data?.changes), failures = rows(data?.failures);
  return <div className="work-overview">
    <div className="work-welcome"><div><h2>Vaš posao danas</h2><p>Priprema, dostave i stvari koje treba proveriti.</p></div><span className="work-date">{formatDate(date)}</span></div>
    <TodayPreparation request={request} version={version} date={date} title="Danas" onDelivery={onDelivery} />
    {error ? <p role="alert" className="notice error">{error} <button className="text-button" onClick={() => setRetry(v => v + 1)}>Pokušaj ponovo</button></p> : null}
    {!data && !error ? <p role="status">Učitavamo sledeći termin i promene…</p> : null}
    {data ? <>
      {str(data.nextDate) !== date ? <TodayPreparation request={request} version={version} date={str(data.nextDate)} title="Sledeći termin" onDelivery={onDelivery} /> : null}
      <div className="work-two">
        <section className="admin-panel"><h2>Potrebne provere</h2>
          <button className="work-attention-link" onClick={() => onDelivery(str(data.nextDate))}>
            <span>Gotovina za naplatu<strong>{formatMoney(num(obj(data.totals).cashDueMinor) / 100)}</strong><small>Spisak dostava za {formatDate(str(data.nextDate))}</small></span><span aria-hidden="true">→</span>
          </button>
          {failures.length ? <button className="work-attention-link" onClick={onSettings}><span><strong>Slanje i obrada: {failures.length} problema</strong><small>Otvori tehničke operacije i proveri neuspele obrade.</small></span><span aria-hidden="true">→</span></button> : <p>Nema prijavljenih problema sa slanjem i obradom.</p>}
        </section>
            <section className="admin-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">U TOKU</p>
                  <h2>Poslednje promene</h2>
                </div>
              </div>
              {changes.length ? (
                <div className="work-timeline">
                  {changes.map((change) => (
                    <button
                      key={str(change.id)}
                      onClick={() =>
                        change.customer_id
                          ? onCustomer(str(change.customer_id))
                          : onOrders({})
                      }
                    >
                      <span
                        className={`work-dot ${str(change.action).includes("pause") ? "amber" : ""}`}
                      />
                      <span>
                        <strong>{str(change.full_name, "Kupac")}</strong>
                        <small>
                          {actionLabel(change.action)}
                          {obj(
                            change.after_json
                              ? JSON.parse(str(change.after_json))
                              : {},
                          ).pauseUntil
                            ? ` do ${formatDate(str(obj(JSON.parse(str(change.after_json))).pauseUntil))}`
                            : ""}
                        </small>
                      </span>
                      <time>{shortDate(str(change.created_at))}</time>
                    </button>
                  ))}
                </div>
              ) : (
                <Empty title="Promene će se pojaviti ovde">
                  <p>Pratićete nove porudžbine, pauze i preskakanja.</p>
                </Empty>
              )}
            </section>

      </div>
    </> : null}
  </div>;
}
