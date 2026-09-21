"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ApiError, fetchJson, formatDate, formatMoney, normalizeProduct, statusLabel } from "../lib/frontend";
import { useAnalytics } from "../components/analytics-provider";
import { LoginSettings } from "./login-settings";
import { LoginForm } from "../prijava/login-form";
import { SubscriptionCard, type Subscription } from "./subscription-card";
import "./account.css";

type Row = Record<string, unknown>;
type Delivery = { id: string; date: string; status: string; items: { product_name: string; unit_label: string; quantity: number }[] };
type AccountPayload = {
  currentDate: string;
  customer: { fullName: string; email: string; phone: string; addressLine1: string; addressLine2?: string; city: string; postalCode: string };
  subscriptions: Subscription[]; orders: Row[]; addonProducts: Row[]; deliveryHistory: Delivery[];
  oneTimeDeliveries: { date: string; items: { product_name: string; quantity: number; unit_label: string }[] }[];
};
function label(value: unknown) { return typeof value === "string" ? value : ""; }
function deliveryStatus(status: string) {
  return ({ planned: "Zakazana", locked: "U pripremi", completed: "Isporučena", failed: "Dostava nije uspela", out_for_delivery: "Na putu", cancelled: "Otkazana", skipped: "Preskočena", delivered: "Isporučena" } as Record<string, string>)[status] ?? "Status se ažurira";
}

export function AccountView() {
  const { track } = useAnalytics();
  const [authenticated, setAuthenticated] = useState(true);
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("all");
  const loadAccount = useCallback(async () => {
    setLoading(true); setError("");
    try { setAccount(await fetchJson<AccountPayload>("/api/account")); setAuthenticated(true); }
    catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) { setAuthenticated(false); setAccount(null); }
      else setError(requestError instanceof Error ? requestError.message : "Nalog trenutno nije moguće učitati.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { queueMicrotask(() => void loadAccount()); }, [loadAccount]);

  async function mutate(id: string, action: string, details: Row = {}) {
    const current = account?.subscriptions.find(sub => sub.id === id);
    if (!current || busy) return false;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await fetchJson<{ account: AccountPayload; adjustmentMinor: number }>(`/api/account/subscriptions/${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "Idempotency-Key": window.crypto.randomUUID() },
        body: JSON.stringify({ action, expectedVersion: current.version, ...details }),
      });
      setAccount(result.account);
      const updated = result.account.subscriptions.find(sub => sub.id === id);
      const date = formatDate(updated?.nextDeliveryDate);
      let message = updated?.status === "cancelled" ? "Pretplata je otkazana. Redovne dostave više nisu zakazane." : action === "skip_next" ? `Dostava je preskočena. Sledeća redovna dostava: ${date}.` : action === "pause" ? `Dostave su pauzirane. Automatski se nastavljaju od ${date}.` : action === "resume" ? `Pretplata je ponovo aktivna. Sledeća redovna dostava: ${date}.` : action === "add_next_only" ? `Proizvod je dodat samo dostavi za ${date}.` : `Izmena je sačuvana. Novi izbor važi za naredne redovne dostave, od ${date}, prema ritmu svakog proizvoda.`;
      if (result.adjustmentMinor > 0) message += ` Odobreno za naredni obračun: ${formatMoney(result.adjustmentMinor / 100)}.`;
      if (result.adjustmentMinor < 0) message += ` Doplata u obračunu: ${formatMoney(-result.adjustmentMinor / 100)}.`;
      setNotice(message);
      if (action === "add_next_only") track("add_to_next_delivery", { subscriptionId: id, productId: label(details.productId) });
      return true;
    } catch (requestError) {
      // Refresh stale versions without replacing the page or erasing the error.
      if (requestError instanceof ApiError && requestError.status === 409) {
        try { setAccount(await fetchJson<AccountPayload>("/api/account")); } catch { /* Keep the last loaded account available for retry. */ }
      }
      if (requestError instanceof ApiError && requestError.status === 401) setAuthenticated(false);
      setError(requestError instanceof ApiError && requestError.code === "DELIVERY_LOCKED" ? "Rok za izmenu ove dostave je istekao. Za pomoć nam se javite preko kontakta." : requestError instanceof Error ? requestError.message : "Izmena nije sačuvana. Pokušajte ponovo.");
      return false;
    } finally { setBusy(false); }
  }
  async function signOut() {
    try { await fetchJson("/api/auth/logout", { method: "POST" }); setAuthenticated(false); setAccount(null); }
    catch { setError("Odjava nije uspela. Pokušajte ponovo."); }
  }
  if (loading) return <div className="page-shell"><p className="loading-state" role="status">Učitavamo vaš nalog…</p></div>;
  if (!authenticated) return <LoginForm />;
  if (!account) return <div className="page-shell narrow"><div className="notice error" role="alert"><h1>Nalog nije učitan.</h1><p>{error}</p><button className="button secondary" onClick={() => void loadAccount()}>Pokušaj ponovo</button></div></div>;
  const { customer } = account;
  const subscriptions = [...account.subscriptions].sort((a, b) => Number(a.status === "cancelled") - Number(b.status === "cancelled") || a.nextDeliveryDate.localeCompare(b.nextDeliveryDate));
  const history = (account.deliveryHistory ?? []).filter(delivery => historyFilter === "all" || (historyFilter === "delivered" ? ["delivered", "completed"].includes(delivery.status) : delivery.status === "skipped"));
  return <div className="account-dashboard">
      <aside className="account-sidebar" aria-label="Meni naloga">
        <Link className="account-brand" href="/">
          <Image src="/images/mleko-i-mleko-logo.png" alt="" width={42} height={42} />
          <strong>Mleko i Mleko</strong>
        </Link>
        <p className="account-sidebar-label">Moj nalog</p>
        <nav className="account-nav" aria-label="Navigacija naloga">
          <a href="#moje-dostave">Moje dostave</a>
          <a href="#istorija-dostava">Istorija dostava</a>
          <a href="#podesavanja-naloga">Podešavanja</a>
        </nav>
        <div className="account-sidebar-footer">
          <a href="/prodavnica">← Nazad u prodavnicu</a>
          <a href="/kontakt">Pomoć i kontakt</a>
          <button disabled={busy} onClick={() => void signOut()}>Odjavi se</button>
        </div>
      </aside>
    <div className="account-content">
    <header className="account-welcome"><div><p className="eyebrow">Moj nalog</p><h1>Zdravo, {customer.fullName || "kupče"}.</h1><p>Pregled dostava, porudžbina i podešavanja naloga.</p></div><a className="button secondary small" href="/prodavnica">Dodaj proizvod</a></header>
    <div className="account-feedback">{notice && <p className="notice success" role="status">{notice}</p>}{error && <p className="notice error" role="alert">{error}</p>}</div>
    <div className="account-main-grid"><div className="form-stack" id="moje-dostave">
      {(account.deliveryHistory ?? []).filter(delivery => delivery.status === "locked" && delivery.date >= account.currentDate).map(delivery => <section className="card" key={delivery.id}><p className="eyebrow">Dostava u pripremi</p><h2>{formatDate(delivery.date)}</h2><p>Ova dostava je već zaključana. Izmene redovne dostave ispod važe za naredne termine.</p><ul className="list-clean">{delivery.items.map((item, index) => <li key={index}>{item.quantity} × {item.product_name} · {item.unit_label}</li>)}</ul></section>)}
      {subscriptions.length ? subscriptions.map((sub, index) => <SubscriptionCard key={sub.id} subscription={sub} products={account.addonProducts.map(normalizeProduct)} busy={busy} mutate={mutate} index={index} />) : <section className="card"><h2>Još nemate redovnu dostavu.</h2><p>Izaberite mleko, količinu i koliko često želite da stiže.</p><a className="button" href="/prodavnica">Izaberi mleko</a></section>}
      {(account.oneTimeDeliveries ?? []).map(delivery => <section className="card" key={delivery.date}><p className="eyebrow">Naručeno jednokratno</p><h2>{formatDate(delivery.date)}</h2><ul className="list-clean">{delivery.items.map((item, index) => <li key={index}>{item.quantity} × {item.product_name} · {item.unit_label}</li>)}</ul><p className="small-text">Ovi proizvodi nisu deo redovne dostave. Pauza ili preskakanje pretplate ih ne pomera. Za izmenu <a href="/kontakt">javite nam se</a>.</p></section>)}
      <section className="card account-history" id="istorija-dostava" aria-labelledby="history-title"><div className="account-section-heading"><div><p className="eyebrow">Sve na jednom mestu</p><h2 id="history-title">Istorija dostava</h2></div><label className="field"><span>Prikaži</span><select aria-label="Prikaži" value={historyFilter} onChange={event => setHistoryFilter(event.target.value)}><option value="all">Sve dostave</option><option value="delivered">Isporučene</option><option value="skipped">Preskočene</option></select></label></div>
        {history.length ? <ul className="list-clean account-timeline">{history.map(delivery => <li key={delivery.id}><div className="account-history-title"><strong>{formatDate(delivery.date)}</strong><span className="account-status">{deliveryStatus(delivery.status)}</span></div>{delivery.items.length ? <ul className="list-clean">{delivery.items.map((item, index) => <li key={index}>{item.quantity} × {item.product_name} · {item.unit_label}</li>)}</ul> : <p>{delivery.status === "skipped" ? "Ovaj termin ste preskočili." : "Detalji dostave još nisu dostupni."}</p>}</li>)}</ul> : <div className="account-empty"><strong>{historyFilter === "all" ? "Ovde će se pojaviti vaše dostave." : "Još nema dostava u ovom prikazu."}</strong><p>Datum, proizvodi i status prikazuju se kada dostava bude evidentirana. Račune i naručene proizvode pratite u porudžbinama ispod.</p></div>}
        <p className="small-text muted">Prikazujemo poslednjih 50 evidentiranih dostava i preskakanja.</p>
      </section>
      <details className="card account-orders-panel"><summary>Moje porudžbine <span>{account.orders.length}</span></summary><p>Mesečni obračuni i jednokratne kupovine. Jedna mesečna porudžbina može obuhvatiti više dostava.</p><ul className="list-clean account-orders">{account.orders.map(order => <li key={label(order.id)}><div className="summary-row"><strong>{label(order.order_number)}</strong><strong>{formatMoney(Number(order.total_minor) / 100)}</strong></div><p>{order.kind === "subscription_invoice" ? "Početak obračunatog perioda" : "Termin dostave"}: {formatDate(label(order.delivery_date))}</p><p>Plaćanje: {statusLabel(label(order.payment_status))} · {deliveryStatus(label(order.fulfillment_status))}</p></li>)}</ul>{!account.orders.length && <p>Još nema porudžbina.</p>}</details>
    </div><aside className="account-side" aria-label="Informacije o dostavi"><section className="card"><p className="eyebrow">Stižemo na adresu</p><h2>{customer.addressLine1 || "Adresa za dostavu"}</h2><p>{[customer.addressLine2, customer.postalCode, customer.city].filter(Boolean).join(", ")}</p><p className="small-text">Promenu adrese ili dogovor oko dostave rešavamo preko kontakta.</p><a href="/kontakt">Javite nam se →</a></section><section className="account-help"><h3>Šta vam danas odgovara?</h3><p><strong>Treba vam više ili manje?</strong><br />Podesite količinu sa − / + i sačuvajte.</p><p><strong>Imate još mleka?</strong><br />Preskočite samo sledeći termin.</p><p><strong>Putujete?</strong><br />Pauzirajte do datuma povratka.</p></section></aside></div>
    <section className="account-settings" id="podesavanja-naloga" aria-labelledby="settings-title"><h2 id="settings-title">Podaci i obaveštenja</h2><details className="card"><summary>Prijava, email i WhatsApp</summary><LoginSettings /></details><details className="card"><summary>Moji kontakt podaci</summary><dl><dt>Email</dt><dd>{customer.email}</dd><dt>Telefon</dt><dd>{customer.phone || "Nije unet"}</dd></dl><a href="/kontakt">Zatraži izmenu podataka</a></details></section>
    </div>
  </div>;
}
