"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { formatDate, formatMoney, type Product } from "../lib/frontend";
import {
  Dialog,
  email,
  str,
  type Row,
  type Requester,
} from "./workspace-shared";

type Customer = {
  fullName: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  deliveryNote: string;
};
const blank: Customer = {
  fullName: "",
  phone: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  city: "Beograd",
  postalCode: "",
  deliveryNote: "",
};
const fromRow = (c: Row): Customer => ({
  fullName: str(c.full_name),
  phone: str(c.phone),
  email: email(c.email),
  addressLine1: str(c.address_line_1),
  addressLine2: str(c.address_line_2),
  city: str(c.city, "Beograd"),
  postalCode: str(c.postal_code),
  deliveryNote: str(c.delivery_note),
});
type Quote = {
  totalMinor: number;
  subtotalMinor: number;
  deliveryFeeMinor: number;
  deliveryOccurrences: number;
  serviceable?: boolean;
  lines: {
    productName: string;
    quantity: number;
    occurrences: number;
    unitLabel: string;
  }[];
};
export function ManualOrder({
  request,
  customers,
  products,
  initialCustomer,
  onClose,
  onSaved,
}: {
  request: Requester;
  customers: Row[];
  products: Product[];
  initialCustomer?: Row;
  onClose: () => void;
  onSaved: (date: string) => void;
}) {
  const [step, setStep] = useState(0),
    [customerId, setCustomerId] = useState(str(initialCustomer?.id)),
    [customer, setCustomer] = useState(
      initialCustomer ? fromRow(initialCustomer) : blank,
    );
  const [found, setFound] = useState<Row[] | null>(null);
  const [search, setSearch] = useState(""),
    [quantities, setQuantities] = useState<Record<string, number>>({}),
    [cadence, setCadence] = useState("one_time");
  const [date, setDate] = useState(""),
    [options, setOptions] = useState<{
      dates: string[];
      emailAvailable: boolean;
    } | null>(null),
    [notify, setNotify] = useState(false);
  const [quoted, setQuoted] = useState<{ key: string; value: Quote } | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState<{ date: string; number: string } | null>(null);
  const key = useRef(crypto.randomUUID()),
    submitting = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void request<{ dates: string[]; emailAvailable: boolean }>(
      "/api/admin/orders/quote",
      { signal: controller.signal },
    )
      .then((v) => {
        setOptions(v);
        setDate(v.dates[0] ?? "");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [request]);
  const items = products
    .filter((p) => quantities[p.id] > 0)
    .map((p) => ({
      productId: p.id,
      quantity: quantities[p.id],
      purchaseType: cadence === "one_time" ? "one_time" : "subscription",
      cadence: cadence === "one_time" ? null : cadence,
    }));
  const quoteKey = JSON.stringify({
    items,
    deliveryDate: date,
    city: customer.city,
    postalCode: customer.postalCode,
  });
  const quote = quoted?.key === quoteKey ? quoted.value : null;
  useEffect(() => {
    if (!date || !items.length) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void request<Quote>("/api/admin/orders/quote", {
        method: "POST",
        body: quoteKey,
        signal: controller.signal,
      })
        .then((v) => {
          if (!controller.signal.aborted) {
            setQuoted({ key: quoteKey, value: v });
            setError("");
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [quoteKey, date, items.length, request]);
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
  const update = (field: keyof Customer, value: string) =>
    setCustomer((c) => ({ ...c, [field]: value }));
  async function save() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await request<{
        order: { orderNumber: string; deliveryDate: string };
      }>("/api/admin/orders", {
        method: "POST",
        headers: { "Idempotency-Key": key.current },
        body: JSON.stringify({
          customerId: customerId || undefined,
          customer,
          items,
          deliveryDate: date,
          notify,
        }),
      });
      setSaved({
        date: result.order.deliveryDate,
        number: result.order.orderNumber,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Porudžbina nije sačuvana.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const selected = products.filter((p) => quantities[p.id] > 0);
  return (
    <Dialog
      title={saved ? "Porudžbina je sačuvana" : "Nova porudžbina"}
      busy={busy}
      onClose={() => {
        if (saved) onSaved(saved.date);
        else onClose();
      }}
    >
      {saved ? (
        <div className="work-success">
          <span aria-hidden="true">✓</span>
          <h3>Dodato u dostavu za {formatDate(saved.date)}</h3>
          <p>
            {saved.number} · {customer.fullName}
          </p>
          <button className="button" onClick={() => onSaved(saved.date)}>
            Otvori dostave
          </button>
        </div>
      ) : (
        <>
          <ol className="work-steps">
            {["Kupac", "Proizvodi", "Dostava i potvrda"].map((label, i) => (
              <li
                key={label}
                aria-current={step === i ? "step" : undefined}
                className={step >= i ? "done" : ""}
              >
                <span>{i + 1}</span>
                {label}
              </li>
            ))}
          </ol>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (step < 2) {
                if (step === 1 && !items.length) {
                  setError("Izaberite najmanje jedan proizvod.");
                  return;
                }
                setStep(step + 1);
              } else void save();
            }}
          >
            {step === 0 ? (
              <div className="work-form">
                <label className="field">
                  <span>Pronađi kupca</span>
                  <input
                    type="search"
                    placeholder="Ime, telefon ili email"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                {search ? (
                  <div className="work-search-results">
                    {(found ?? customers)
                      .filter((c) =>
                        [c.full_name, c.phone, email(c.email)]
                          .join(" ")
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .slice(0, 8)
                      .map((c) => (
                        <button
                          type="button"
                          key={str(c.id)}
                          onClick={() => {
                            setCustomerId(str(c.id));
                            setCustomer(fromRow(c));
                            setSearch("");
                            setNotify(false);
                          }}
                        >
                          <strong>{str(c.full_name, "Kupac")}</strong>
                          <span>
                            {str(c.phone)} · {str(c.address_line_1)}
                          </span>
                        </button>
                      ))}
                  </div>
                ) : null}
                {customerId ? (
                  <p className="work-hint">
                    Postojeći kupac{" "}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setCustomerId("");
                        setCustomer(blank);
                        setNotify(false);
                      }}
                    >
                      Unesi novog kupca
                    </button>
                  </p>
                ) : null}
                <div className="form-grid">
                  {(
                    [
                      ["fullName", "Ime i prezime"],
                      ["phone", "Telefon"],
                      ["email", "Email (opciono)"],
                      ["addressLine1", "Adresa"],
                      ["addressLine2", "Sprat / stan"],
                      ["city", "Grad"],
                      ["postalCode", "Poštanski broj"],
                    ] as const
                  ).map(([field, label]) => (
                    <label className="field" key={field}>
                      <span>{label}</span>
                      <input
                        type={
                          field === "email"
                            ? "email"
                            : field === "phone"
                              ? "tel"
                              : "text"
                        }
                        value={customer[field]}
                        readOnly={field === "email" && !!customerId}
                        required={!["email", "addressLine2"].includes(field)}
                        maxLength={field === "email" ? 254 : 200}
                        onChange={(e) => update(field, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
                <p className="work-hint">
                  Izmena adrese postojećeg kupca važi i za njegove buduće,
                  nezaključane dostave.
                </p>
              </div>
            ) : null}
            {step === 1 ? (
              <div className="work-form">
                <div className="work-product-grid">
                  {products
                    .filter((p) => p.available)
                    .map((p) => (
                      <article
                        key={p.id}
                        className={quantities[p.id] ? "selected" : ""}
                      >
                        <img src={p.imageUrl} alt="" width="80" height="80" />
                        <div>
                          <h3>{p.name}</h3>
                          <p>
                            {formatMoney(
                              cadence === "one_time"
                                ? p.priceRsd
                                : p.subscriptionPriceRsd,
                            )}{" "}
                            / {p.unit}
                          </p>
                        </div>
                        <div className="work-stepper">
                          <button
                            type="button"
                            aria-label={`Smanji ${p.name}`}
                            disabled={!quantities[p.id]}
                            onClick={() =>
                              setQuantities((q) => ({
                                ...q,
                                [p.id]: Math.max(0, (q[p.id] || 0) - 1),
                              }))
                            }
                          >
                            −
                          </button>
                          <input
                            type="number"
                            aria-label={`Količina: ${p.name}`}
                            min="0"
                            max="100"
                            value={quantities[p.id] || 0}
                            onChange={(e) =>
                              setQuantities((q) => ({
                                ...q,
                                [p.id]: Math.min(
                                  100,
                                  Math.max(
                                    0,
                                    Math.floor(Number(e.target.value)),
                                  ),
                                ),
                              }))
                            }
                          />
                          <button
                            type="button"
                            aria-label={`Dodaj ${p.name}`}
                            disabled={quantities[p.id] >= 100}
                            onClick={() =>
                              setQuantities((q) => ({
                                ...q,
                                [p.id]: (q[p.id] || 0) + 1,
                              }))
                            }
                          >
                            +
                          </button>
                        </div>
                        <small>
                          {quantities[p.id] || 0} × {p.unit} po dostavi
                        </small>
                      </article>
                    ))}
                </div>
              </div>
            ) : null}
            {step === 2 ? (
              <div className="work-form">
                <div className="form-grid">
                  <label className="field">
                    <span>Datum dostave</span>
                    <select
                      value={date}
                      required
                      onChange={(e) => setDate(e.target.value)}
                    >
                      {options?.dates.map((d) => (
                        <option key={d} value={d}>
                          {formatDate(d)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Koliko često?</span>
                    <select
                      value={cadence}
                      onChange={(e) => setCadence(e.target.value)}
                    >
                      <option value="one_time">Samo ova dostava</option>
                      <option
                        value="weekly"
                        disabled={selected.some((p) => !p.allowSubscription)}
                      >
                        Svake nedelje
                      </option>
                      <option
                        value="biweekly"
                        disabled={selected.some((p) => !p.allowSubscription)}
                      >
                        Svake dve nedelje
                      </option>
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span>Napomena za vozača</span>
                  <textarea
                    value={customer.deliveryNote}
                    maxLength={500}
                    onChange={(e) => update("deliveryNote", e.target.value)}
                  />
                </label>
                <div className="work-review">
                  <strong>
                    {customer.fullName} · {customer.phone}
                  </strong>
                  <p>
                    {customer.addressLine1}, {customer.city}{" "}
                    {customer.postalCode}
                  </p>
                  {selected.map((p) => (
                    <p key={p.id}>
                      {quantities[p.id]} × {p.unit} {p.name}
                    </p>
                  ))}
                  <p>Plaćanje gotovinom pri dostavi</p>
                  {cadence !== "one_time" ? (
                    <p>
                      Redovna dostava. Prikazan iznos obuhvata{" "}
                      {quote?.deliveryOccurrences ?? "…"} termina do kraja
                      meseca.
                    </p>
                  ) : null}
                </div>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={notify}
                    disabled={!customer.email || !options?.emailAvailable}
                    onChange={(e) => setNotify(e.target.checked)}
                  />
                  Pošalji potvrdu emailom
                </label>
                {!options?.emailAvailable ? (
                  <p className="work-hint">
                    Slanje emaila nije povezano. Porudžbina će biti sačuvana bez
                    slanja poruke.
                  </p>
                ) : null}
              </div>
            ) : null}
            {error ? (
              <p className="notice error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="work-dialog-bottom">
              <div>
                {quote ? (
                  <>
                    <small>
                      Proizvodi {formatMoney(quote.subtotalMinor / 100)} ·
                      dostava {formatMoney(quote.deliveryFeeMinor / 100)}
                    </small>
                    <strong>{formatMoney(quote.totalMinor / 100)}</strong>
                  </>
                ) : (
                  <small>
                    {items.length
                      ? "Obračunavamo cenu…"
                      : "Izaberite proizvode za obračun."}
                  </small>
                )}
              </div>
              <div className="button-row">
                {step > 0 ? (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setStep(step - 1)}
                  >
                    Nazad
                  </button>
                ) : null}
                <button
                  className="button"
                  disabled={
                    busy ||
                    !options?.dates.length ||
                    (step === 2 && (!quote || quote.serviceable === false))
                  }
                >
                  {busy
                    ? "Čuvamo…"
                    : step === 2
                      ? "Sačuvaj porudžbinu"
                      : "Dalje →"}
                </button>
              </div>
            </div>
          </form>
        </>
      )}
    </Dialog>
  );
}
