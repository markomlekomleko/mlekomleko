"use client";
import { useEffect, useState } from "react";
import { formatDate, formatMoney } from "../lib/frontend";
import {
  Dialog,
  Empty,
  num,
  obj,
  plusDays,
  rows,
  str,
  today,
  type Row,
  type Requester,
} from "./workspace-shared";
export function DeliveriesPanel({
  request,
  date,
  onDate,
  version,
  onExport,
  onChanged,
}: {
  request: Requester;
  date: string;
  onDate: (date: string) => void;
  version: number;
  onExport: (format: "csv" | "xlsx") => Promise<void>;
  onChanged: () => void;
}) {
  const [data, setData] = useState<Row | null>(null),
    [view, setView] = useState("pack"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [lock, setLock] = useState(false),
    [reminders, setReminders] = useState<Row | null>(null),
    [notice, setNotice] = useState(""),
    [nextDate, setNextDate] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void request<Row>(
      `/api/admin/delivery-preview?date=${encodeURIComponent(date)}`,
      { signal: controller.signal },
    )
      .then((v) => {
        setData(v);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(e.message);
        }
      });
    return () => controller.abort();
  }, [request, date, version, revision]);
  useEffect(() => {
    void request<{ dates: string[] }>("/api/admin/orders/quote")
      .then((v) => setNextDate(v.dates[0] ?? ""))
      .catch(() => setNextDate(""));
  }, [request]);
  async function generate() {
    return request("/api/admin/deliveries", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ action: "generate", date }),
    });
  }
  async function download(format: "csv" | "xlsx") {
    setBusy(true);
    setError("");
    try {
      await generate();
      await onExport(format);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preuzimanje nije uspelo.");
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    setBusy(true);
    setError("");
    try {
      await generate();
      await request("/api/admin/deliveries", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ action: "lock", date, force: true }),
      });
      setLock(false);
      setNotice("Priprema je završena. Spisak za ovaj datum je zaključan.");
      setRevision((v) => v + 1);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Zaključavanje nije uspelo.");
    } finally {
      setBusy(false);
    }
  }
  async function preview() {
    setBusy(true);
    setError("");
    try {
      setReminders(await request<Row>(`/api/admin/reminders?date=${date}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pregled nije dostupan.");
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    setBusy(true);
    setError("");
    try {
      setReminders(
        await request<Row>("/api/admin/reminders", {
          method: "POST",
          body: JSON.stringify({ date }),
        }),
      );
      setNotice(
        "Obrada podsetnika je završena. Status svake poruke je prikazan ispod.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Slanje nije uspelo.");
    } finally {
      setBusy(false);
    }
  }
  const delivery = obj(data?.delivery),
    orders = rows(data?.orders),
    isLocked = delivery.status === "locked" || delivery.status === "completed";
  return (
    <div className="admin-stack">
      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">OD NAŠIH VRATA DO NJIHOVIH</p>
            <h2>Dostave za {formatDate(date)}</h2>
          </div>
          <span className={`work-badge ${isLocked ? "active" : ""}`}>
            {isLocked ? "Spisak je zaključan" : "Otvoreno za pripremu"}
          </span>
        </div>
        <div className="work-delivery-controls">
          <label className="field">
            <span>Datum dostave</span>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => {
                if (e.target.value) {
                  onDate(e.target.value);
                  setNotice("");
                }
              }}
            />
          </label>
          <div className="button-row">
            <button
              className="button secondary small"
              onClick={() => onDate(today())}
            >
              Danas
            </button>
            <button
              className="button secondary small"
              onClick={() => onDate(plusDays(today(), 1))}
            >
              Sutra
            </button>
            <button
              className="button secondary small"
              disabled={!nextDate}
              onClick={() => onDate(nextDate)}
            >
              Sledeći termin
            </button>
          </div>
        </div>
        <div className="button-row">
          <button
            className="button"
            disabled={busy || isLocked || !orders.length}
            onClick={() => setLock(true)}
          >
            Završi pripremu
          </button>
          <button
            className="button secondary"
            disabled={busy || !data}
            onClick={() => void download("xlsx")}
          >
            Spisak za pakovanje · Excel
          </button>
          <button
            className="button secondary"
            disabled={busy || !data}
            onClick={() => void download("csv")}
          >
            Spisak za vozača · CSV
          </button>
          <button
            className="button secondary"
            disabled={busy || date !== plusDays(today(), 1) || !orders.length}
            onClick={() => void preview()}
          >
            Podseti kupce za sutra
          </button>
        </div>
        <p className="work-hint">
          {isLocked
            ? "Prikazana je sačuvana lista. Naknadne promene kupca važe za buduće dostave."
            : "Lista prati aktuelne porudžbine, pauze i preskakanja. Zaključajte je kada završite pripremu."}
        </p>
      </section>
      {notice ? (
        <p role="status" className="notice success">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="notice error">
          {error}{" "}
          <button
            className="text-button"
            onClick={() => setRevision((v) => v + 1)}
          >
            Pokušaj ponovo
          </button>
        </p>
      ) : null}
      <div className="work-segment" aria-label="Prikaz dostava">
        <button
          className={view === "pack" ? "active" : ""}
          onClick={() => setView("pack")}
        >
          Za pakovanje
        </button>
        <button
          className={view === "driver" ? "active" : ""}
          onClick={() => setView("driver")}
        >
          Za vozača
        </button>
      </div>
      {view === "pack" && rows(data?.preparation).length ? (
        <div className="work-pack-totals">
          {rows(data?.preparation).map((p) => (
            <article key={str(p.product_id)}>
              <span>{str(p.product_name)}</span>
              <strong>
                {num(p.total_quantity)} <small>× {str(p.unit_label)}</small>
              </strong>
            </article>
          ))}
        </div>
      ) : null}
      {orders.length ? (
        <div className="work-route-list">
          {orders.map((order, i) => {
            const c = obj(order.customer_snapshot);
            return (
              <article
                className="admin-panel work-route-card"
                key={str(order.id)}
              >
                <span className="work-stop">{i + 1}</span>
                <div>
                  <h3>{str(c.fullName, "Kupac")}</h3>
                  <p>
                    {str(c.addressLine1)} {str(c.addressLine2)}, {str(c.city)}{" "}
                    {str(c.postalCode)}
                  </p>
                  {view === "driver" ? (
                    <>
                      <a className="work-phone" href={`tel:${str(c.phone)}`}>
                        {str(c.phone)}
                      </a>
                      <p>
                        <strong>
                          {formatMoney(num(order.cash_due_minor) / 100)}
                        </strong>{" "}
                        za naplatu <small>· {str(order.billing_label)}</small>
                      </p>
                    </>
                  ) : null}
                  {rows(order.items).map((item) => (
                    <div
                      className="work-pack-item"
                      key={`${str(item.product_id)}-${str(item.source_type)}`}
                    >
                      <strong>
                        {num(item.quantity)} × {str(item.unit_label)}
                      </strong>
                      <span>{str(item.product_name)}</span>
                    </div>
                  ))}
                  {order.note ? (
                    <p className="work-delivery-note">
                      Napomena: {str(order.note)}
                    </p>
                  ) : null}
                </div>
                <span className="work-badge">
                  {order.subscription_id ? "Redovna" : "Jednokratna"}
                </span>
              </article>
            );
          })}
        </div>
      ) : data ? (
        <Empty title="Nema dostava za ovaj datum">
          <p>Izaberite drugi datum ili dodajte novu porudžbinu.</p>
        </Empty>
      ) : !error ? (
        <p role="status">Učitavamo spisak…</p>
      ) : null}
      {rows(data?.excluded).length ? (
        <details className="admin-panel">
          <summary>Pauze i preskakanja ({rows(data?.excluded).length})</summary>
          {rows(data?.excluded).map((s, i) => (
            <div className="work-history-row" key={`${str(s.id)}-${i}`}>
              <strong>{str(s.full_name)}</strong>
              <span>
                {s.skipped_date
                  ? `Preskočeno ${formatDate(str(s.skipped_date))}`
                  : `Trenutno na pauzi do ${formatDate(str(s.pause_until))}`}
              </span>
            </div>
          ))}
        </details>
      ) : null}
      {lock ? (
        <Dialog
          title="Završi pripremu"
          busy={busy}
          onClose={() => setLock(false)}
        >
          <div className="work-form">
            <p>
              Zaključavate spisak za <strong>{formatDate(date)}</strong> sa{" "}
              {orders.length} dostava. Posle ovoga promene neće menjati spisak,
              čak ni ako redovan rok još nije prošao.
            </p>
            <p>Proverite proizvode i adrese pre potvrde.</p>
            {error ? (
              <p role="alert" className="notice error">
                {error}
              </p>
            ) : null}
            <div className="button-row">
              <button
                className="button"
                disabled={busy}
                onClick={() => void finish()}
              >
                Potvrdi i zaključaj spisak
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setLock(false)}
              >
                Vrati se na proveru
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}
      {reminders ? (
        <Dialog
          title="Podsetnici za sutra"
          busy={busy}
          onClose={() => setReminders(null)}
        >
          <div className="work-form">
            <p>
              {formatDate(date)} ·{" "}
              {rows(reminders.recipients).filter((r) => r.email).length} email
              primaoca
            </p>
            {!reminders.emailAvailable ? (
              <p className="notice">
                Slanje emaila nije povezano. Ovo je samo pregled poruka.
              </p>
            ) : null}
            <p className="work-hint">
              Kupci sa povezanim WhatsApp-om i uključenim obaveštenjima dobijaju
              i poruku tim kanalom.
            </p>
            {rows(reminders.recipients).map((r) => (
              <details key={str(r.id)} className="work-reminder">
                <summary>
                  {str(r.name)} · {str(r.email, "Bez emaila")}{" "}
                  <span className="work-badge">
                    {!r.email
                      ? "Preskočeno"
                      : obj(r.job).status === "sent"
                        ? str(obj(r.job).external_id).startsWith("console:")
                          ? "Simulirano"
                          : str(obj(r.job).external_id).startsWith(
                                "suppressed:",
                              )
                            ? "Preskočeno"
                            : "Poslato"
                        : obj(r.job).last_error_message
                          ? "Slanje nije uspelo"
                          : obj(r.job).status === "pending"
                            ? "Čeka slanje"
                            : "Spremno"}
                  </span>
                </summary>
                <p className="work-message-preview">{str(r.message)}</p>
                {obj(r.job).last_error_message ? (
                  <p className="notice error">
                    {str(obj(r.job).last_error_message)}
                  </p>
                ) : null}
              </details>
            ))}
            {error ? (
              <p role="alert" className="notice error">
                {error}
              </p>
            ) : null}
            <button
              className="button"
              disabled={
                busy ||
                !reminders.eligible ||
                !reminders.emailAvailable ||
                !rows(reminders.recipients).some((r) => r.email)
              }
              onClick={() => void send()}
            >
              {busy ? "Šaljemo…" : "Pošalji podsetnike"}
            </button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
