"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cadenceLabel,
  ApiError,
  fetchJson,
  formatDate,
  formatMoney,
  normalizeProduct,
  statusLabel,
  unwrapList,
  type DeliveryCadence,
  type Product,
} from "../lib/frontend";
import { useAnalytics } from "../components/analytics-provider";

type Row = Record<string, unknown>;

type AccountPayload = {
  customer?: Row;
  account?: Row;
  nextDelivery?: Row;
  next_delivery?: Row;
  subscriptions?: unknown[];
  addonProducts?: unknown[];
  data?: unknown;
};

function row(value: unknown): Row {
  return value && typeof value === "object" ? value as Row : {};
}

function string(value: unknown, fallback = "-") {
  return typeof value === "string" && value ? value : fallback;
}

function number(value: unknown, fallback = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function idOf(value: Row) {
  return string(value.id ?? value.subscriptionId ?? value.subscription_id);
}

export function AccountView() {
  const { track } = useAnalytics();
  const [authenticated, setAuthenticated] = useState(true);
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [cancellingId, setCancellingId] = useState("");
  const [cancelReason, setCancelReason] = useState("too_frequent");

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await fetchJson<AccountPayload>("/api/account");
      setAccount(payload);
      setAuthenticated(true);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        setAuthenticated(false);
        setAccount(null);
      } else setError(requestError instanceof Error ? requestError.message : "Nalog trenutno nije moguće učitati.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadAccount());
  }, [loadAccount]);

  const wrapper = useMemo(() => row(account?.data), [account]);
  const customer = row(account?.customer ?? account?.account ?? wrapper.customer);
  const subscriptions = unwrapList(account ?? {}, ["subscriptions"]).map(row);
  const addonProducts: Product[] = unwrapList(account ?? {}, ["addonProducts", "addon_products"]).map(normalizeProduct);
  const derivedNextSubscription = subscriptions
    .filter((subscription) => ["active", "paused"].includes(string(subscription.status, "active")))
    .sort((a, b) => string(a.nextDeliveryDate ?? a.next_delivery_date, "9999").localeCompare(string(b.nextDeliveryDate ?? b.next_delivery_date, "9999")))[0];
  const nextDelivery = row(
    account?.nextDelivery ??
    account?.next_delivery ??
    wrapper.nextDelivery ??
    wrapper.next_delivery ??
    (derivedNextSubscription
      ? {
          date: derivedNextSubscription.nextDeliveryDate ?? derivedNextSubscription.next_delivery_date,
          items: derivedNextSubscription.items,
        }
      : undefined),
  );
  const nextItems = unwrapList(nextDelivery, ["items", "products"]).map(row);

  async function mutate(subscriptionId: string, action: string, details: Row = {}) {
    const current = subscriptions.find((subscription) => idOf(subscription) === subscriptionId);
    if (!current) return;
    setBusy(`${subscriptionId}:${action}`);
    setError("");
    setNotice("");
    try {
      await fetchJson(`/api/account/subscriptions/${encodeURIComponent(subscriptionId)}`, {
        method: "PATCH",
        headers: { "Idempotency-Key": window.crypto.randomUUID() },
        body: JSON.stringify({ action, expectedVersion: number(current.version, 0), ...details }),
      });
      setNotice("Izmena je sačuvana. Sledeća dostava je ažurirana ako rok nije istekao.");
      if (action === "add_next_only") track("add_to_next_delivery", { subscriptionId, productId: string(details.productId, "") });
      if (["skip_next", "slow_down", "pause"].includes(action) && cancellingId === subscriptionId) {
        track("subscription_saved", { subscriptionId, action });
        setCancellingId("");
      }
      await loadAccount();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Izmena nije sačuvana.");
      if (requestError instanceof ApiError && requestError.status === 409) await loadAccount();
    } finally {
      setBusy("");
    }
  }

  function pauseDate(subscription: Row) {
    const base = new Date(string(subscription.nextDeliveryDate ?? subscription.next_delivery_date, new Date().toISOString()));
    base.setDate(base.getDate() + 35);
    return base.toISOString().slice(0, 10);
  }

  async function signOut() {
    try { await fetchJson("/api/auth/logout", { method: "POST" }); } catch { /* Clear local UI even if the session already expired. */ }
    setAuthenticated(false);
    setAccount(null);
  }

  if (loading) {
    return <div className="page-shell"><p className="loading-state" role="status">Učitavamo vaš nalog…</p></div>;
  }

  if (!authenticated) {
    return (
      <div className="page-shell narrow">
        <div className="empty-state">
          <p className="eyebrow">Korisnički nalog</p>
          <h1>Prijavite se bez lozinke.</h1>
          <p className="lead">Poslaćemo vam siguran jednokratni link putem emaila.</p>
          <a className="button" href="/prijava">Pošalji link za prijavu</a>
        </div>
      </div>
    );
  }

  if (error && !account) {
    return (
      <div className="page-shell narrow">
        <div className="notice error" role="alert">
          <h1>Nalog nije učitan.</h1>
          <p>{error}</p>
          <div className="button-row">
            <button className="button secondary" type="button" onClick={() => void loadAccount()}>Pokušaj ponovo</button>
            <button className="button danger" type="button" onClick={() => void signOut()}>Odjavi ovaj uređaj</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <header className="page-heading">
        <p className="eyebrow">Korisnički nalog</p>
        <h1>Zdravo, {string(customer.fullName ?? customer.full_name ?? customer.name, "kupče")}.</h1>
        <div className="button-row">
          <a className="button secondary small" href="/prodavnica">Dodaj proizvod</a>
          <button className="button danger small" type="button" onClick={() => void signOut()}>Odjavi se</button>
        </div>
      </header>

      {notice ? <p className="notice success" role="status">{notice}</p> : null}
      {error ? <p className="notice error" role="alert">{error}</p> : null}

      <div className="account-layout" style={{ marginTop: "1rem" }}>
        <div className="form-stack">
          <section className="card" aria-labelledby="sledeca-title">
            <p className="eyebrow">Sledeća dostava</p>
            <h2 id="sledeca-title">
              {formatDate(string(nextDelivery.date ?? nextDelivery.deliveryDate ?? nextDelivery.delivery_date, ""))}
            </h2>
            <p className="muted">
              Izmene su moguće do roka koji važi za ovaj termin dostave.
            </p>
            {nextDelivery.locked === true ? (
              <p className="notice">Ova dostava je zaključana i više se ne može menjati.</p>
            ) : null}
            {nextItems.length === 0 ? (
              <p className="empty-state">Nema planiranih proizvoda za sledeću dostavu.</p>
            ) : (
              <ul className="list-clean">
                {nextItems.map((item, index) => (
                  <li className="summary-row" key={string(item.id, String(index))}>
                    <span>{string(item.name ?? item.productName ?? item.product_name)}</span>
                    <strong>{number(item.quantity)} × {string(item.unit ?? item.unitLabel ?? item.unit_label, "kom")}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="pretplate-title">
            <h2 id="pretplate-title">Pretplate</h2>
            {subscriptions.length === 0 ? (
              <div className="empty-state">
                <p>Nemate aktivne ili prethodne pretplate.</p>
                <a className="button small" href="/prodavnica">Izaberite proizvode</a>
              </div>
            ) : (
              <div className="form-stack">
                {subscriptions.map((subscription) => {
                  const subscriptionId = idOf(subscription);
                  const items = unwrapList(subscription, ["items", "products"]).map(row);
                  const status = string(subscription.status, "active");
                  const disabled = Boolean(busy) || status === "cancelled" || status === "canceled";
                  return (
                    <article className="card form-stack" key={subscriptionId}>
                      <div className="summary-row">
                        <div>
                          <span className="tag">{statusLabel(status)}</span>
                          <h3 style={{ marginTop: "0.7rem" }}>Pretplata {subscriptionId}</h3>
                        </div>
                        <strong>{cadenceLabel(string(subscription.cadence ?? subscription.frequency, "weekly"))}</strong>
                      </div>
                      {items.length > 0 ? (
                        <ul className="list-clean">
                          {items.map((item, index) => {
                            const itemId = string(item.id ?? item.subscriptionItemId ?? item.subscription_item_id, String(index));
                            return (
                              <li className="inline-controls" key={itemId}>
                                <span style={{ minWidth: "160px", flex: 1 }}>{string(item.name ?? item.productName ?? item.product_name)}</span>
                                <label className="field" style={{ width: "100px" }}>
                                  <span>Količina</span>
                                  <input
                                    type="number"
                                    min="1"
                                    defaultValue={number(item.quantity)}
                                    disabled={disabled}
                                    aria-label={`Količina za ${string(item.name ?? item.productName)}`}
                                    onBlur={(event) => {
                                      const quantity = Math.max(1, Number(event.target.value) || 1);
                                      if (quantity !== number(item.quantity)) {
                                        void mutate(subscriptionId, "update_item", { itemId, quantity });
                                      }
                                    }}
                                  />
                                </label>
                                <label className="field" style={{ width: "180px" }}>
                                  <span>Ritam</span>
                                  <select
                                    defaultValue={string(item.cadence ?? item.frequency, "weekly")}
                                    disabled={disabled}
                                    aria-label={`Ritam za ${string(item.name ?? item.productName)}`}
                                    onChange={(event) => void mutate(subscriptionId, "update_item", { itemId, cadence: event.target.value as DeliveryCadence })}
                                  >
                                    <option value="weekly">Svake nedelje</option>
                                    <option value="biweekly">Svake 2 nedelje</option>
                                  </select>
                                </label>
                                <button className="button danger small" type="button" disabled={disabled} onClick={() => mutate(subscriptionId, "remove_item", { itemId })}>Ukloni</button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                      {unwrapList(subscription, ["nextOnlyAddons", "next_only_addons"]).length ? <div className="next-addon-summary"><strong>Dodato samo sledećoj dostavi</strong>{unwrapList(subscription, ["nextOnlyAddons", "next_only_addons"]).map(row).map((addon, index) => <span key={string(addon.id, String(index))}>{number(addon.quantity)}× {string(addon.product_name ?? addon.productName)} · {formatMoney(number(addon.unit_price_minor ?? addon.unitPriceMinor, 0) * number(addon.quantity) / 100)} · {statusLabel(string(addon.payment_status, "pending"))}</span>)}</div> : null}
                      {status === "active" && addonProducts.length ? <section className="next-addon-picker" aria-label="Dodajte sledećoj dostavi"><div><p className="eyebrow">Bez nove dostave</p><h3>Dodajte samo sledećoj dostavi</h3></div><div>{addonProducts.slice(0, 3).map((product) => <button type="button" disabled={disabled} key={product.id} onClick={() => void mutate(subscriptionId, "add_next_only", { productId: product.id, quantity: 1 })}><span><strong>{product.name}</strong><small>{product.unit}</small></span><b>＋ {formatMoney(product.priceRsd)}</b></button>)}</div></section> : null}
                      <div className="inline-controls">
                        <button className="button secondary small" type="button" disabled={disabled} onClick={() => mutate(subscriptionId, "skip_next")}>Preskoči sledeću</button>
                        {status === "paused" ? (
                          <button className="button secondary small" type="button" disabled={Boolean(busy)} onClick={() => mutate(subscriptionId, "resume")}>Nastavi pretplatu</button>
                        ) : (
                          <label className="field">
                            <span>Pauziraj do</span>
                            <input
                              type="date"
                              disabled={disabled}
                              min={new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(new Date())}
                              onChange={(event) => event.target.value && void mutate(subscriptionId, "pause", { pauseUntil: event.target.value })}
                            />
                          </label>
                        )}
                        <button className="button danger small" type="button" disabled={disabled} onClick={() => { setCancellingId(subscriptionId); track("subscription_cancel_started", { subscriptionId }); }}>Razmišljam o otkazivanju</button>
                      </div>
                      {cancellingId === subscriptionId ? <section className="cancel-saver" aria-labelledby={`cancel-${subscriptionId}`}><div><p className="eyebrow">Pre nego što odete</p><h3 id={`cancel-${subscriptionId}`}>Šta bi vam više odgovaralo?</h3><p>Izaberite lakšu opciju ili nastavite na trajno otkazivanje. Nema skrivenih koraka.</p></div><div className="cancel-save-grid"><button className="button secondary small" type="button" onClick={() => void mutate(subscriptionId, "skip_next")}>Preskoči samo sledeću</button><button className="button secondary small" type="button" onClick={() => void mutate(subscriptionId, "slow_down")}>Prebaci sve na 2 nedelje</button><button className="button secondary small" type="button" onClick={() => void mutate(subscriptionId, "pause", { pauseUntil: pauseDate(subscription) })}>Pauziraj oko mesec dana</button></div><label className="field"><span>Zašto želite da otkažete?</span><select value={cancelReason} onChange={(event) => setCancelReason(event.target.value)}><option value="too_frequent">Prečesto stiže</option><option value="too_expensive">Preskupo mi je</option><option value="too_much_product">Ostaje mi proizvoda</option><option value="delivery_issue">Problem sa dostavom</option><option value="quality_issue">Problem sa kvalitetom</option><option value="other">Drugi razlog</option></select></label><div className="inline-controls"><button className="text-button danger-text" type="button" onClick={() => void mutate(subscriptionId, "cancel", { reason: cancelReason })}>Ipak trajno otkaži</button><button className="text-button" type="button" onClick={() => setCancellingId("")}>Zadrži pretplatu</button></div></section> : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="card" style={{ alignSelf: "start" }}>
          <h2>Podaci</h2>
          <dl>
            <dt className="muted small-text">Email</dt>
            <dd>{string(customer.email)}</dd>
            <dt className="muted small-text">Telefon</dt>
            <dd>{string(customer.phone)}</dd>
            <dt className="muted small-text">Adresa</dt>
            <dd>{[
              customer.addressLine1 ?? customer.address_line_1,
              customer.addressLine2 ?? customer.address_line_2,
              customer.postalCode ?? customer.postal_code,
              customer.city,
            ].filter(Boolean).join(", ") || string(customer.address ?? customer.deliveryAddress ?? customer.delivery_address)}</dd>
          </dl>
          <p className="muted small-text">Za promenu kontakt podataka javite nam se putem kontakt stranice.</p>
          <a className="button secondary small" href="/kontakt">Kontakt</a>
          <section className="referral-mockup" aria-labelledby="referral-title">
            <span className="tag">DEMO · nije povezano</span>
            <h3 id="referral-title">500 RSD vama, 500 RSD komšiji</h3>
            <p>Pozovite prijatelja; nagrada bi se aktivirala tek posle njegove prve plaćene porudžbine.</p>
            <div className="mock-referral-code"><code>MLEKO-{String(customer.fullName ?? customer.full_name ?? "DEMO").slice(0, 4).toUpperCase()}</code><button type="button" disabled aria-disabled="true">Kopiraj link</button></div>
            <small>Vizuelni mockup — ne kreira kod, kredit ni evidenciju.</small>
          </section>
        </aside>
      </div>
    </div>
  );
}
