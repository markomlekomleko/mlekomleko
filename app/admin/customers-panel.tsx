"use client";
import { useEffect, useState } from "react";
import { formatDate, formatMoney, statusLabel } from "../lib/frontend";
import {
  actionLabel,
  Dialog,
  Empty,
  email,
  num,
  obj,
  plusDays,
  rows,
  str,
  type Row,
  type Requester,
} from "./workspace-shared";
export function CustomersPanel({
  request,
  customers,
  subscriptions,
  selectedId,
  onSelect,
  onNew,
  onChanged,
}: {
  request: Requester;
  customers: Row[];
  subscriptions: Row[];
  selectedId: string;
  onSelect: (id: string) => void;
  onNew: (customer: Row) => void;
  onChanged: () => void;
}) {
  const [found, setFound] = useState<Row[] | null>(null);
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [account, setAccount] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [edit, setEdit] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void request<Row>(
      `/api/admin/customers/${encodeURIComponent(selectedId)}`,
      { signal: controller.signal },
    )
      .then((v) => {
        setAccount(v);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [request, selectedId, revision, subscriptions]);
  useEffect(() => {
    if (!search) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void request<{ customers: Row[] }>(
        `/api/admin/customers?q=${encodeURIComponent(search)}`,
        { signal: controller.signal },
      )
        .then((v) => setFound(v.customers))
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [request, search]);
  const matches = (search ? (found ?? customers) : customers).filter(
    (c) =>
      [c.full_name, c.phone, email(c.email)]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "all" ||
        subscriptions.some(
          (s) => s.customer_id === c.id && s.status === filter,
        )),
  );
  const customer = obj(account?.customer);
  async function saveContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await request(`/api/admin/customers/${selectedId}`, {
        method: "PATCH",
        body: JSON.stringify(
          Object.fromEntries(new FormData(event.currentTarget)),
        ),
      });
      setEdit(false);
      setRevision((v) => v + 1);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Izmena nije sačuvana.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-stack">
      <div className="admin-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">LJUDI ZBOG KOJIH SMO TU</p>
            <h2>Kupci i njihove dostave</h2>
          </div>
          <span className="work-badge">{customers.length} kupaca</span>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Pronađi kupca</span>
            <input
              type="search"
              placeholder="Ime, telefon ili email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Redovna dostava</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">Svi kupci</option>
              <option value="active">Aktivna</option>
              <option value="paused">Pauzirana</option>
              <option value="cancelled">Otkazana</option>
            </select>
          </label>
        </div>
        <p className="work-hint">
          Prikaz do 500 rezultata. Pretraga obuhvata sve kupce.
        </p>
      </div>
      {matches.length ? (
        <div className="work-customer-grid">
          {matches.map((c) => (
            <button
              key={str(c.id)}
              className="work-customer-card"
              onClick={() => {
                setAccount(null);
                setError("");
                onSelect(str(c.id));
              }}
            >
              <span className="work-avatar">
                {str(c.full_name, "K").slice(0, 1).toUpperCase()}
              </span>
              <span>
                <strong>{str(c.full_name, "Kupac")}</strong>
                <small>
                  {str(c.phone) || email(c.email) || "Kontakt nije unet"}
                </small>
                <small>
                  {str(c.city)} · {num(c.order_count)} porudžbina
                </small>
              </span>
              <span className="work-card-end">
                {formatMoney(num(c.lifetime_value_minor) / 100)}
                <small>naplaćeno →</small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty title="Nema kupaca za ovu pretragu" />
      )}
      {selectedId ? (
        <Dialog
          title={str(customer.full_name, "Podaci kupca")}
          busy={busy}
          onClose={() => {
            onSelect("");
            setAccount(null);
            setEdit(false);
          }}
        >
          {error ? (
            <p className="notice error" role="alert">
              {error}
            </p>
          ) : null}
          {account && customer.id === selectedId ? (
            <>
              <div className="work-contact">
                <p>
                  {str(customer.phone)} ·{" "}
                  {email(customer.email) || "Bez email adrese"}
                </p>
                <p>
                  {str(customer.address_line_1)} {str(customer.address_line_2)},{" "}
                  {str(customer.city)} {str(customer.postal_code)}
                </p>
                <div className="button-row">
                  <button className="button" onClick={() => onNew(customer)}>
                    + Nova porudžbina
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => setEdit(!edit)}
                  >
                    Izmeni kontakt i adresu
                  </button>
                </div>
              </div>
              {edit ? (
                <form className="work-form" onSubmit={saveContact}>
                  <div className="form-grid">
                    {[
                      ["fullName", "Ime i prezime", "full_name"],
                      ["phone", "Telefon", "phone"],
                      ["addressLine1", "Adresa", "address_line_1"],
                      ["addressLine2", "Sprat / stan", "address_line_2"],
                      ["city", "Grad", "city"],
                      ["postalCode", "Poštanski broj", "postal_code"],
                      ["deliveryNote", "Napomena za vozača", "delivery_note"],
                    ].map(([name, label, key]) => (
                      <label className="field" key={name}>
                        <span>{label}</span>
                        <input
                          name={name}
                          defaultValue={str(customer[key])}
                          required={
                            !["addressLine2", "deliveryNote"].includes(name)
                          }
                          maxLength={name === "deliveryNote" ? 500 : 200}
                        />
                      </label>
                    ))}
                  </div>
                  <p className="work-hint">
                    Važi za buduće nezaključane dostave. Zaključani spiskovi
                    zadržavaju prethodnu adresu.
                  </p>
                  <button className="button" disabled={busy}>
                    Sačuvaj kontakt
                  </button>
                </form>
              ) : null}
              <h3 className="work-section-title">Redovne dostave</h3>
              {rows(account.subscriptions).length ? (
                rows(account.subscriptions).map((s) => (
                  <SubscriptionControl
                    key={`${str(s.id)}-${num(s.version)}`}
                    subscription={s}
                    request={request}
                    onChanged={() => {
                      setRevision((v) => v + 1);
                      onChanged();
                    }}
                  />
                ))
              ) : (
                <p className="work-hint">
                  Ovaj kupac još nema redovnu dostavu.
                </p>
              )}
              <h3 className="work-section-title">Porudžbine i naplata</h3>
              {rows(account.orders).map((o) => (
                <div className="work-history-row" key={str(o.id)}>
                  <span>
                    <strong>{str(o.order_number)}</strong>
                    <small>
                      {formatDate(str(o.delivery_date))} ·{" "}
                      {statusLabel(str(o.fulfillment_status))}
                    </small>
                  </span>
                  <span>
                    {formatMoney(num(o.total_minor) / 100)}
                    <small>{statusLabel(str(o.payment_status))}</small>
                  </span>
                </div>
              ))}
              {!rows(account.orders).length ? (
                <p className="work-hint">Još nema porudžbina.</p>
              ) : null}
              <h3 className="work-section-title">Pauze i promene</h3>
              {rows(account.changes).map((c) => (
                <div className="work-history-row" key={str(c.id)}>
                  <span>
                    {actionLabel(c.action)}
                    <small>
                      {c.action === "subscription.pause"
                        ? `Do ${formatDate(str(obj(JSON.parse(str(c.after_json, "{}"))).pauseUntil))}`
                        : c.action === "subscription.skip_next"
                          ? `Termin ${formatDate(str(obj(JSON.parse(str(c.before_json, "{}"))).next_delivery_date))}`
                          : ""}
                    </small>
                  </span>
                  <small>{formatDate(str(c.created_at))}</small>
                </div>
              ))}
            </>
          ) : (
            <p role="status">Učitavamo podatke kupca…</p>
          )}
        </Dialog>
      ) : null}
    </div>
  );
}
function SubscriptionControl({
  subscription: s,
  request,
  onChanged,
}: {
  subscription: Row;
  request: Requester;
  onChanged: () => void;
}) {
  const [action, setAction] = useState(""),
    [date, setDate] = useState(plusDays(str(s.nextDeliveryDate), 14)),
    [quantity, setQuantity] = useState(1),
    [itemId, setItemId] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const items = rows(s.items).filter((i) => i.status === "active");
  let resumeDate = str(s.nextDeliveryDate);
  if (action === "pause" && date) {
    for (let i = 0; i < 80; i++) {
      const due = items.some((item) => {
        const difference = Math.round(
          (Date.parse(resumeDate) - Date.parse(str(item.cadenceAnchorDate))) /
            86400000,
        );
        return (
          difference >= 0 &&
          difference % (item.cadence === "biweekly" ? 14 : 7) === 0
        );
      });
      if (resumeDate >= date && due) break;
      resumeDate = plusDays(resumeDate, 7);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await request(`/api/admin/subscriptions/${str(s.id)}`, {
        method: "PATCH",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          action,
          expectedVersion: s.version,
          ...(action === "pause" ? { pauseUntil: date } : {}),
          ...(action === "update_item" ? { itemId, quantity } : {}),
        }),
      });
      setAction("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Promena nije sačuvana.");
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="work-subscription">
      <div className="panel-heading">
        <div>
          <span className={`work-badge ${str(s.status)}`}>
            {statusLabel(str(s.status))}
          </span>
          <h4>
            Sledeća dostava:{" "}
            {s.status === "cancelled"
              ? "—"
              : formatDate(str(s.nextDeliveryDate))}
          </h4>
          {s.pauseUntil ? (
            <p>Pauza do {formatDate(str(s.pauseUntil))}</p>
          ) : null}
        </div>
      </div>
      {items.map((i) => (
        <div className="work-history-row" key={str(i.id)}>
          <span>
            {num(i.quantity)} × {str(i.unitLabel)} {str(i.productName)}
            <small>
              {i.cadence === "biweekly" ? "Svake dve nedelje" : "Svake nedelje"}
            </small>
          </span>
          {s.status === "active" && !s.locked ? (
            <button
              className="text-button"
              onClick={() => {
                setAction("update_item");
                setItemId(str(i.id));
                setQuantity(num(i.quantity));
              }}
            >
              Promeni količinu
            </button>
          ) : null}
        </div>
      ))}
      {s.locked && s.status === "active" ? (
        <p className="work-hint">
          Rok za promenu ovog termina je prošao. Pripremljena dostava se ne
          menja.
        </p>
      ) : null}
      <div className="button-row">
        {s.status === "active" ? (
          <>
            <button
              className="button secondary small"
              disabled={!!s.locked || busy}
              onClick={() => setAction("skip_next")}
            >
              Preskoči termin
            </button>
            <button
              className="button secondary small"
              disabled={!!s.locked || busy}
              onClick={() => setAction("pause")}
            >
              Pauziraj
            </button>
          </>
        ) : s.status === "paused" ? (
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() => setAction("resume")}
          >
            Nastavi dostavu
          </button>
        ) : null}
      </div>
      {action ? (
        <div className="work-review">
          {action === "pause" ? (
            <>
              <label className="field">
                <span>Pauza do datuma</span>
                <input
                  type="date"
                  min={plusDays(str(s.nextDeliveryDate), 1)}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <p>
                Sledeća dostava po rasporedu:{" "}
                <strong>{formatDate(resumeDate)}</strong>
              </p>
            </>
          ) : action === "skip_next" ? (
            <p>
              Preskoči {formatDate(str(s.nextDeliveryDate))}? Sledeći termin je{" "}
              {formatDate(str(s.afterSkipDate))}.
            </p>
          ) : action === "resume" ? (
            <p>
              Nastavi redovnu dostavu u prvom narednom dostupnom terminu
              postojećeg rasporeda?
            </p>
          ) : (
            <label className="field">
              <span>Nova količina po dostavi</span>
              <input
                type="number"
                min="1"
                max="100"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </label>
          )}
          <div className="button-row">
            <button
              className="button small"
              disabled={
                busy ||
                (action === "update_item" &&
                  (!Number.isInteger(quantity) ||
                    quantity < 1 ||
                    quantity > 100)) ||
                (action === "pause" && date <= str(s.nextDeliveryDate))
              }
              onClick={() => void save()}
            >
              {busy ? "Čuvamo…" : "Potvrdi promenu"}
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setAction("")}
            >
              Odustani
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="notice error">
          {error}
        </p>
      ) : null}
    </article>
  );
}
