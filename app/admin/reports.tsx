"use client";
import { useEffect, useState } from "react";
import { MarketingReport } from "./marketing-report";
import { formatDate, formatMoney, statusLabel } from "../lib/frontend";
import { Empty, num, obj, plusDays, rows, str, today, type Requester, type Row } from "./workspace-shared";
export function Reports({request, version, onOrders}: {request: Requester; version: number; onOrders: (filters: Record<string,string>) => void}) {
  const [period, setPeriod] = useState("30"),
    [from, setFrom] = useState(plusDays(today(), -29)),
    [to, setTo] = useState(today()),
    [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [selectedDay, setSelectedDay] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void request<Row>(
      `/api/admin/insights?${new URLSearchParams({ from, to })}`,
      { signal: controller.signal },
    )
      .then((v) => {
        setData(v);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setData(null);
        }
      });
    return () => controller.abort();
  }, [request, from, to, version, retry]);
  const stats = obj(data?.totals),
    daily = rows(data?.daily),
    products = rows(data?.products);
  const max = Math.max(1, ...daily.map((d) => num(d.paidMinor))),
    width = 720,
    height = 150;
  const points = daily
    .map(
      (d, i) =>
        `${daily.length === 1 ? width / 2 : (i / (daily.length - 1)) * width},${height - (num(d.paidMinor) / max) * (height - 15)}`,
    )
    .join(" ");
  const clicked = daily.find((d) => d.date === selectedDay);
  const filters = { from, to };
  function changePeriod(value: string) {
    setPeriod(value);
    if (value === "custom") return;
    setTo(today());
    setFrom(
      value === "month"
        ? today().slice(0, 7) + "-01"
        : plusDays(today(), 1 - Number(value)),
    );
    setSelectedDay("");
  }
  return <div className="work-overview">
    {error ? <p role="alert" className="notice error">{error} <button className="text-button" onClick={() => setRetry(v => v + 1)}>Pokušaj ponovo</button></p> : null}
    {!data && !error ? <p role="status">Učitavamo izveštaje…</p> : null}
      <section className="work-analytics">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">MALO ŠIRA SLIKA</p>
            <h2>Kako ide prodaja?</h2>
          </div>
          <label className="field">
            <span>Period analitike</span>
            <select
              value={period}
              onChange={(e) => changePeriod(e.target.value)}
            >
              <option value="7">Poslednjih 7 dana</option>
              <option value="30">Poslednjih 30 dana</option>
              <option value="month">Ovaj mesec</option>
              <option value="custom">Izaberi period</option>
            </select>
          </label>
        </div>
        {period === "custom" ? (
          <div className="form-grid">
            <label className="field">
              <span>Analitika od</span>
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Analitika do</span>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
        ) : null}
        {data ? (
          <>
            <div className="work-metrics">
              <div>
                <span>Naplaćene porudžbine</span>
                <strong>{formatMoney(num(stats.paidMinor) / 100)}</strong>
                <small>
                  {num(stats.previousPaidMinor) > 0
                    ? `${((num(stats.paidMinor) / num(stats.previousPaidMinor) - 1) * 100).toFixed(1)}% prema prethodnom periodu`
                    : "Poređenje će biti dostupno kada prethodni period ima naplatu."}
                </small>
              </div>
              <div>
                <span>Porudžbine</span>
                <strong>{num(stats.orders)}</strong>
              </div>
              <div>
                <span>Prosečna naplaćena porudžbina</span>
                <strong>
                  {formatMoney(
                    num(stats.paidOrders)
                      ? num(stats.paidMinor) / num(stats.paidOrders) / 100
                      : 0,
                  )}
                </strong>
              </div>
              <div>
                <span>Novi kupci</span>
                <strong>{num(stats.newCustomers)}</strong>
              </div>
            </div>
            <div className="work-two">
              <section className="admin-panel work-chart">
                <h3>Naplaćene porudžbine kroz vreme</h3>
                <p className="work-hint">
                  Po datumu poručivanja, vreme u Srbiji. Prikazuje trenutno
                  plaćene porudžbine; nije dnevnik datuma uplata.
                </p>
                {num(stats.paidOrders) ? (
                  <>
                    <div className="work-line-chart">
                      <svg
                        viewBox={`-5 -5 ${width + 10} ${height + 25}`}
                        role="group"
                        aria-label="Iznos plaćenih porudžbina po datumu poručivanja"
                      >
                        <defs>
                          <linearGradient
                            id="revenue-fill"
                            x1="0"
                            x2="0"
                            y1="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#3e7255"
                              stopOpacity=".25"
                            />
                            <stop
                              offset="100%"
                              stopColor="#3e7255"
                              stopOpacity="0"
                            />
                          </linearGradient>
                        </defs>
                        {[0, 0.5, 1].map((v) => (
                          <line
                            key={v}
                            x1="0"
                            y1={height * v}
                            x2={width}
                            y2={height * v}
                            stroke="#e5e8df"
                          />
                        ))}
                        <polygon
                          points={`0,${height} ${points} ${width},${height}`}
                          fill="url(#revenue-fill)"
                        />
                        <polyline
                          points={points}
                          fill="none"
                          stroke="#28533d"
                          strokeWidth="3"
                          vectorEffect="non-scaling-stroke"
                        />
                        {daily
                          .filter((d) => num(d.orders) > 0)
                          .map((d) => {
                            const i = daily.indexOf(d);
                            return (
                              <a
                                key={str(d.date)}
                                href="#porudzbine"
                                aria-label={`${formatDate(str(d.date))}: ${formatMoney(num(d.paidMinor) / 100)} — otvori porudžbine`}
                                onClick={(event) => {
                                  event.preventDefault();
                                  onOrders({
                                    from: str(d.date),
                                    to: str(d.date),
                                    paymentStatus: "paid",
                                  });
                                }}
                              >
                                <circle
                                  cx={
                                    daily.length === 1
                                      ? width / 2
                                      : (i / (daily.length - 1)) * width
                                  }
                                  cy={
                                    height -
                                    (num(d.paidMinor) / max) * (height - 15)
                                  }
                                  r="6"
                                  fill="#28533d"
                                  stroke="#fff"
                                  strokeWidth="2"
                                >
                                  <title>
                                    {formatDate(str(d.date))} ·{" "}
                                    {formatMoney(num(d.paidMinor) / 100)}
                                  </title>
                                </circle>
                              </a>
                            );
                          })}
                      </svg>
                    </div>
                    <div className="work-chart-axis">
                      <span>{formatDate(from)}</span>
                      <span>{formatMoney(max / 100)}</span>
                      <span>{formatDate(to)}</span>
                    </div>
                    <label className="field">
                      <span>Detalji dana</span>
                      <select
                        value={selectedDay}
                        onChange={(e) => setSelectedDay(e.target.value)}
                      >
                        <option value="">Izaberi dan</option>
                        {daily.map((d) => (
                          <option key={str(d.date)} value={str(d.date)}>
                            {formatDate(str(d.date))} ·{" "}
                            {formatMoney(num(d.paidMinor) / 100)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {clicked ? (
                      <button
                        className="text-button"
                        onClick={() =>
                          onOrders({
                            from: str(clicked.date),
                            to: str(clicked.date),
                            paymentStatus: "paid",
                          })
                        }
                      >
                        {num(clicked.orders)} porudžbina · otvori dan →
                      </button>
                    ) : null}
                  </>
                ) : (
                  <Empty title="Još nema naplaćenih porudžbina">
                    <p>Grafikon će se pojaviti kada evidentirate naplatu.</p>
                  </Empty>
                )}
              </section>
              <section className="admin-panel">
                <h3>Proizvodi koje kupci biraju</h3>
                <p className="work-hint">
                  Količine iz plaćenih porudžbina, uključujući ugovorene termine
                  redovne dostave.
                </p>
                {products.length ? (
                  <div className="work-bars">
                    {products.map((p) => (
                      <button
                        key={str(p.product_id)}
                        onClick={() =>
                          onOrders({
                            ...filters,
                            productId: str(p.product_id),
                            paymentStatus: "paid",
                          })
                        }
                      >
                        <span>
                          {str(p.product_name)}
                          <strong>
                            {num(p.units).toLocaleString("sr-Latn-RS")} ×{" "}
                            {str(p.unit_label)}
                          </strong>
                        </span>
                        <i
                          style={{
                            width: `${(num(p.units) / Math.max(1, ...products.map((p) => num(p.units)))) * 100}%`,
                          }}
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  <Empty title="Nema prodaje u ovom periodu" />
                )}
              </section>
            </div>
            <MarketingReport data={obj(data.marketing)} />
            <div className="work-two">
              <section className="admin-panel">
                <h3>Kako kupci poručuju</h3>
                <div className="work-bars">
                  {rows(data.kinds).map((k, i) => (
                    <button
                      key={str(k.kind)}
                      onClick={() =>
                        onOrders({ ...filters, kind: str(k.kind) })
                      }
                    >
                      <span>
                        {str(k.label)}
                        <strong>{num(k.count)}</strong>
                      </span>
                      <i
                        className={`color-${i}`}
                        style={{
                          width: `${(num(k.count) / Math.max(1, num(stats.orders))) * 100}%`,
                        }}
                      />
                    </button>
                  ))}
                </div>
              </section>
              <section className="admin-panel">
                <h3>Redovne dostave sada</h3>
                <div className="work-sub-stats">
                  {["active", "paused", "cancelled"].map((status) => (
                    <div key={status}>
                      <span className={`work-badge ${status}`}>
                        {statusLabel(status)}
                      </span>
                      <strong>
                        {num(
                          rows(data.states).find((s) => s.status === status)
                            ?.count,
                        )}
                      </strong>
                    </div>
                  ))}
                </div>
                <p className="work-hint">
                  Trenutno stanje svih pretplata, nezavisno od perioda
                  grafikona.
                </p>
              </section>
            </div>
          </>
        ) : null}
      </section>
  </div>;
}
