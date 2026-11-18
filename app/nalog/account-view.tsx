"use client";

import { useLocalize, useLocale } from "@/app/lib/i18n/client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ApiError,
  fetchJson,
  formatDate,
  formatMoney,
  normalizeProduct,
  statusLabel,
} from "../lib/frontend";
import { useAnalytics } from "../components/analytics-provider";
import {
  OrderItemEditor,
  type EditableOrder,
} from "../components/order-item-editor";
import { RefundRequest } from "./refund-request";
import { ProfileEditor } from "./profile-editor";
import { LoginSettings } from "./login-settings";
import { LoginForm } from "../prijava/login-form";
import { SubscriptionCard, type Subscription } from "./subscription-card";
import "./account.css";

type Row = Record<string, unknown>;
type Delivery = {
  id: string;
  date: string;
  status: string;
  items: { product_name: string; unit_label: string; quantity: number }[];
};
type AccountPayload = {
  demo?: boolean;
  currentDate: string;
  customer: {
    fullName: string;
    email: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    postalCode: string;
  };
  subscriptions: Subscription[];
  orders: Row[];
  addonProducts: Row[];
  deliveryHistory: Delivery[];
  oneTimeDeliveries: {
    date: string;
    items: { product_name: string; quantity: number; unit_label: string }[];
  }[];
};
function label(value: unknown) {
  return typeof value === "string" ? value : "";
}
function deliveryStatus(status: string) {
  return (
    (
      {
        planned: "Zakazana",
        locked: "U pripremi",
        completed: "Isporučena",
        failed: "Dostava nije uspela",
        out_for_delivery: "Na putu",
        cancelled: "Otkazana",
        skipped: "Preskočena",
        delivered: "Isporučena",
      } as Record<string, string>
    )[status] ?? "Status se ažurira"
  );
}

/** The account page's sections, in page order: anchor id and menu label. */
const ACCOUNT_SECTIONS = [
  ["pregled", "Pregled"],
  ["pretplata", "Pretplata"],
  ["porudzbine", "Porudžbine"],
  ["istorija-dostava", "Istorija dostava"],
  ["adresa", "Adresa"],
  ["podesavanja-naloga", "Podešavanja"],
] as const;

export function AccountView() {
  const localize = useLocalize();
  const locale = useLocale();
  const { track } = useAnalytics();
  const [authenticated, setAuthenticated] = useState(true);
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<EditableOrder | null>(
    null,
  );
  const [historyFilter, setHistoryFilter] = useState("all");
  const [activeSection, setActiveSection] = useState("pregled");
  const loadAccount = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setAccount(await fetchJson<AccountPayload>("/api/account"));
      setAuthenticated(true);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        setAuthenticated(false);
        setAccount(null);
      } else
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Nalog trenutno nije moguće učitati.",
        );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => void loadAccount());
  }, [loadAccount]);
  // The left menu follows the section in view, like a table of contents.
  useEffect(() => {
    if (!account) return;
    const sections = ACCOUNT_SECTIONS.map(([id]) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [account]);
  // On a phone the menu is one swipeable row: keep the active pill in view.
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>(".account-nav");
    const pill = nav?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!nav || !pill || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollTo({ left: pill.offsetLeft - (nav.clientWidth - pill.clientWidth) / 2, behavior: "smooth" });
  }, [activeSection]);

  async function mutate(id: string, action: string, details: Row = {}) {
    const current = account?.subscriptions.find((sub) => sub.id === id);
    if (!current || busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await fetchJson<{
        account: AccountPayload;
        adjustmentMinor: number;
        appliesTo?: string;
        cancelAfterPackage?: boolean;
      }>(`/api/account/subscriptions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Idempotency-Key": window.crypto.randomUUID() },
        body: JSON.stringify({
          action,
          expectedVersion: current.version,
          ...details,
        }),
      });
      setAccount(result.account);
      const updated = result.account.subscriptions.find((sub) => sub.id === id);
      const date = formatDate(updated?.nextDeliveryDate, locale);
      let message =
        updated?.status === "cancelled"
          ? "Pretplata je otkazana. Redovne dostave više nisu zakazane."
          : action === "skip_next"
            ? `Dostava je preskočena. Sledeća redovna dostava: ${date}.`
            : action === "pause"
              ? `Dostave su pauzirane. Automatski se nastavljaju od ${date}.`
              : action === "resume"
                ? `Pretplata je ponovo aktivna. Sledeća redovna dostava: ${date}.`
                : action === "add_next_only"
                  ? `Proizvod je dodat samo dostavi za ${date}.`
                  : `Izmena je sačuvana. Novi izbor važi za naredne redovne dostave, od ${date}, prema ritmu svakog proizvoda.`;
      if (result.appliesTo === "next_package") message = "Izmena je sačuvana za sledeći paket. Količine i ritam već kupljenog paketa ostaju isti.";
      if (result.cancelAfterPackage) message = "Obnova je otkazana. Preostale plaćene dostave ostaju zakazane.";
      if (result.adjustmentMinor > 0)
        message += ` Odobreno za naredni obračun: ${formatMoney(result.adjustmentMinor / 100, locale)}.`;
      if (result.adjustmentMinor < 0)
        message += ` Doplata u obračunu: ${formatMoney(-result.adjustmentMinor / 100, locale)}.`;
      setNotice(message);
      const event =
        action === "pause"
          ? "subscription_paused"
          : action === "resume"
            ? "subscription_resumed"
            : updated?.status === "cancelled"
              ? "subscription_cancelled"
              : "subscription_saved";
      if (action !== "add_next_only")
        track(event, { subscriptionId: id, action });
      if (action === "add_next_only")
        track("add_to_next_delivery", {
          subscriptionId: id,
          productId: label(details.productId),
        });
      return true;
    } catch (requestError) {
      // Refresh stale versions without replacing the page or erasing the error.
      if (requestError instanceof ApiError && requestError.status === 409) {
        try {
          setAccount(await fetchJson<AccountPayload>("/api/account"));
        } catch {
          /* Keep the last loaded account available for retry. */
        }
      }
      if (requestError instanceof ApiError && requestError.status === 401)
        setAuthenticated(false);
      setError(
        requestError instanceof ApiError &&
          requestError.code === "DELIVERY_LOCKED"
          ? "Rok za izmenu ove dostave je istekao. Za pomoć nam se javite preko kontakta."
          : requestError instanceof Error
            ? requestError.message
            : "Izmena nije sačuvana. Pokušajte ponovo.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    try {
      await fetchJson("/api/auth/logout", { method: "POST" });
      setAuthenticated(false);
      setAccount(null);
    } catch {
      setError("Odjava nije uspela. Pokušajte ponovo.");
    }
  }
  if (loading)
    return localize((
      <div className="page-shell">
        <p className="loading-state" role="status">
          Učitavamo vaš nalog…
        </p>
      </div>
    ));
  if (!authenticated) return localize(<LoginForm />);
  if (!account)
    return localize((
      <div className="page-shell narrow">
        <div className="notice error" role="alert">
          <h1>Nalog nije učitan.</h1>
          <p>{error}</p>
          <button
            className="button secondary"
            onClick={() => void loadAccount()}
          >
            Pokušaj ponovo
          </button>
        </div>
      </div>
    ));
  const { customer } = account;
  const subscriptions = [...account.subscriptions].sort(
    (a, b) =>
      Number(a.status === "cancelled") - Number(b.status === "cancelled") ||
      a.nextDeliveryDate.localeCompare(b.nextDeliveryDate),
  );
  const history = (account.deliveryHistory ?? []).filter(
    (delivery) =>
      historyFilter === "all" ||
      (historyFilter === "delivered"
        ? ["delivered", "completed"].includes(delivery.status)
        : delivery.status === "skipped"),
  );
  return localize((
    <div className="account-dashboard">
      <div className="page-shell account-shell">
        <h1 className="account-title">Moj nalog</h1>
        <div className="account-layout">
          <nav className="account-nav" aria-label="Navigacija naloga">
            {ACCOUNT_SECTIONS.map(([id, title]) => (
              <a key={id} href={`#${id}`} aria-current={activeSection === id ? "true" : undefined}>{title}</a>
            ))}
          </nav>
          <div className="account-content">
            <div className="account-feedback">
              {account.demo && (
                <p className="notice" role="status">Pregledate demo nalog sa primerima podataka. Za izmene i poručivanje odjavite se i prijavite na svoj nalog.</p>
              )}
              {notice && (
                <p className="notice success" role="status">
                  {notice}
                </p>
              )}
              {error && (
                <p className="notice error" role="alert">
                  {error}
                </p>
              )}
            </div>

            <section className="card account-hello" id="pregled" aria-labelledby="hello-title">
              <div className="account-card-head">
                <h2 id="hello-title">Zdravo, {customer.fullName ? <span data-no-translate>{customer.fullName}</span> : <span data-no-translate>{customer.email}</span>}</h2>
                <button className="button secondary small" disabled={busy} onClick={() => void signOut()}>Odjavi se</button>
              </div>
              <dl className="account-rows">
                <div><dt>Email</dt><dd data-no-translate>{customer.email}</dd></div>
                <div><dt>Telefon</dt><dd>{customer.phone ? <span data-no-translate>{customer.phone}</span> : "Nije unet"}</dd></div>
              </dl>
            </section>

            <div className="account-section" id="pretplata">
              <h2 className="account-section-title">Pretplata</h2>
              {(account.deliveryHistory ?? [])
                .filter(
                  (delivery) =>
                    delivery.status === "locked" &&
                    delivery.date >= account.currentDate,
                )
                .map((delivery) => (
                  <section className="card" key={delivery.id}>
                    <p className="eyebrow">Dostava u pripremi</p>
                    <h3>{formatDate(delivery.date, locale)}</h3>
                    <p>
                      Ova dostava je već zaključana. Izmene redovne dostave ispod
                      važe za naredne termine.
                    </p>
                    <ul className="list-clean">
                      {delivery.items.map((item, index) => (
                        <li key={index}>
                          {item.quantity} × {item.product_name} · {item.unit_label}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              {subscriptions.length ? (
                subscriptions.map((sub, index) => (
                  <SubscriptionCard
                    key={sub.id}
                    subscription={sub}
                    products={account.addonProducts.map(normalizeProduct)}
                    busy={busy}
                    readOnly={account.demo}
                    mutate={mutate}
                    index={index}
                  />
                ))
              ) : (
                <section className="card">
                  <p>Pretplati se i mleko stiže na tvoja vrata, bez odlaska u prodavnicu.</p>
                  <Link className="account-arrow-link" href="/#izaberite-mleko">
                    Izaberi svoje mleko <span aria-hidden="true">→</span>
                  </Link>
                </section>
              )}
              {(account.oneTimeDeliveries ?? []).map((delivery) => (
                <section className="card" key={delivery.date}>
                  <p className="eyebrow">Naručeno jednokratno</p>
                  <h3>{formatDate(delivery.date, locale)}</h3>
                  <ul className="list-clean">
                    {delivery.items.map((item, index) => (
                      <li key={index}>
                        {item.quantity} × {item.product_name} · {item.unit_label}
                      </li>
                    ))}
                  </ul>
                  <p className="small-text">
                    Ovi proizvodi nisu deo redovne dostave. Pauza ili preskakanje
                    pretplate ih ne pomera. Izmenu i otkazivanje otvorite u „Moje
                    porudžbine“ ispod, do prikazanog roka.
                  </p>
                </section>
              ))}
              {subscriptions.length ? (
                <section className="account-help">
                  <p><strong>Treba vam više ili manje?</strong> Podesite količinu sa − / + i sačuvajte.</p>
                  <p><strong>Imate još mleka?</strong> Preskočite samo sledeći termin.</p>
                  <p><strong>Putujete?</strong> Pauzirajte do datuma povratka.</p>
                </section>
              ) : null}
            </div>

            <section className="card account-orders-panel" id="porudzbine" aria-labelledby="orders-title">
              <h2 id="orders-title">Porudžbine <span className="account-count">{account.orders.length}</span></h2>
              {account.orders.length ? (
                <>
                  <p className="account-muted">
                    Mesečni obračuni i jednokratne kupovine. Jedna mesečna porudžbina
                    može obuhvatiti više dostava.
                  </p>
                  <ul className="list-clean account-orders">
                    {account.orders.map((order) => (
                      <li key={label(order.id)}>
                        <div className="summary-row">
                          <strong>{label(order.order_number)}</strong>
                          <strong>
                            {formatMoney(Number(order.total_minor) / 100, locale)}
                          </strong>
                        </div>
                        <p>
                          {order.kind === "subscription_invoice"
                            ? "Početak obračunatog perioda"
                            : "Termin dostave"}
                          : {formatDate(label(order.delivery_date), locale)}
                        </p>
                        <p>
                          Plaćanje: {statusLabel(label(order.payment_status))} ·{" "}
                          {deliveryStatus(label(order.fulfillment_status))}
                        </p>
                        {order.kind === "one_time" && (
                          <button
                            className="button secondary small"
                            disabled={busy}
                            onClick={async () => {
                              try {
                                setSelectedOrder(
                                  await fetchJson<EditableOrder>(
                                    `/api/account/orders/${encodeURIComponent(label(order.id))}`,
                                  ),
                                );
                              } catch (cause) {
                                setError(
                                  cause instanceof Error
                                    ? cause.message
                                    : "Porudžbina nije učitana.",
                                );
                              }
                            }}
                          >
                            Otvori porudžbinu {label(order.order_number)}
                          </button>
                        )}
                        {selectedOrder && selectedOrder.order.id === order.id && (
                          <div className="account-confirm">
                            <OrderItemEditor
                              key={String(selectedOrder.order.updated_at)}
                              detail={selectedOrder}
                              onSaved={() => {
                                setSelectedOrder(null);
                                setNotice("Porudžbina je ažurirana.");
                                void loadAccount();
                              }}
                            />
                            <button
                              className="text-button"
                              onClick={() => setSelectedOrder(null)}
                            >
                              Zatvori detalje porudžbine
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <p>Još nemaš nijednu porudžbinu.</p>
                  <Link className="account-arrow-link" href="/#izaberite-mleko">
                    Izaberi svoje mleko <span aria-hidden="true">→</span>
                  </Link>
                </>
              )}
            </section>

            <section
              className="card account-history"
              id="istorija-dostava"
              aria-labelledby="history-title"
            >
              <div className="account-section-heading">
                <h2 id="history-title">Istorija dostava</h2>
                <label className="field">
                  <span>Prikaži</span>
                  <select
                    aria-label="Prikaži"
                    value={historyFilter}
                    onChange={(event) => setHistoryFilter(event.target.value)}
                  >
                    <option value="all">Sve dostave</option>
                    <option value="delivered">Isporučene</option>
                    <option value="skipped">Preskočene</option>
                  </select>
                </label>
              </div>
              {history.length ? (
                <ul className="list-clean account-timeline">
                  {history.map((delivery) => (
                    <li key={delivery.id}>
                      <div className="account-history-title">
                        <strong>{formatDate(delivery.date, locale)}</strong>
                        <span className="account-status">
                          {deliveryStatus(delivery.status)}
                        </span>
                      </div>
                      {delivery.items.length ? (
                        <ul className="list-clean">
                          {delivery.items.map((item, index) => (
                            <li key={index}>
                              {item.quantity} × {item.product_name} ·{" "}
                              {item.unit_label}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>
                          {delivery.status === "skipped"
                            ? "Ovaj termin ste preskočili."
                            : "Detalji dostave još nisu dostupni."}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="account-empty">
                  <strong>
                    {historyFilter === "all"
                      ? "Ovde će se pojaviti vaše dostave."
                      : "Još nema dostava u ovom prikazu."}
                  </strong>
                  <p>
                    Datum, proizvodi i status prikazuju se kada dostava bude
                    evidentirana. Račune i naručene proizvode pratite u
                    porudžbinama iznad.
                  </p>
                </div>
              )}
              <p className="small-text muted">
                Prikazujemo poslednjih 50 evidentiranih dostava i preskakanja.
              </p>
            </section>

            <div className="account-pair">
              <section className="card" id="adresa" aria-labelledby="address-title">
                <h2 id="address-title">Adresa</h2>
                {customer.addressLine1 ? (
                  <p className="account-address">
                    <span data-no-translate>{customer.addressLine1}</span>
                    <br />
                    <span data-no-translate>{[customer.addressLine2, customer.postalCode, customer.city].filter(Boolean).join(", ")}</span>
                  </p>
                ) : (
                  <p className="account-muted">Još nemaš sačuvanu adresu.</p>
                )}
                <p className="small-text">
                  Promenu adrese ili dogovor oko dostave rešavamo preko kontakta.
                </p>
                <a className="account-arrow-link" href="/kontakt">Javite nam se <span aria-hidden="true">→</span></a>
              </section>
              <section className="card" aria-labelledby="details-title">
                <h2 id="details-title">Moji podaci</h2>
                <dl className="account-rows">
                  <div><dt>Ime i prezime</dt><dd>{customer.fullName ? <span data-no-translate>{customer.fullName}</span> : "Nije uneto"}</dd></div>
                  <div><dt>Email</dt><dd data-no-translate>{customer.email}</dd></div>
                  <div><dt>Telefon</dt><dd>{customer.phone ? <span data-no-translate>{customer.phone}</span> : "Nije unet"}</dd></div>
                </dl>
              </section>
            </div>

            <section
              className="card account-settings"
              id="podesavanja-naloga"
              aria-labelledby="settings-title"
            >
              <h2 id="settings-title">Podešavanja</h2>
              {account.demo ? <p>Demo nalog služi za pregled. Za izmene i poručivanje prijavite se na svoj nalog.</p> : (
                <details>
                  <summary>Prijava, email i WhatsApp</summary>
                  <ProfileEditor customer={account.customer} />
                  <RefundRequest orders={account.orders} />
                  <LoginSettings />
                </details>
              )}
              <a className="account-arrow-link" href="/kontakt">Zatraži izmenu podataka <span aria-hidden="true">→</span></a>
            </section>
          </div>
        </div>
      </div>
      <Link className="account-home-pill" href="/"><span aria-hidden="true">←</span> Početna strana</Link>
    </div>
  ));
}
