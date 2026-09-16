"use client";
/* eslint-disable @next/next/no-img-element -- Optimized catalog photography and admin-managed image URLs are served directly. */

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, fetchJson, formatMoney, normalizeProduct, statusLabel, unwrapList, type Product } from "../lib/frontend";
import Link from "next/link";
import { OrdersPanel } from "./orders-panel";
import { ManualOrder } from "./manual-order";
import { Overview } from "./overview";
import { CustomersPanel } from "./customers-panel";
import { DeliveriesPanel } from "./deliveries-panel";
import "./workspace.css";
import { BundleAdmin } from "./revenue-panels";

const ADMIN_KEY = "mleko-i-mleko-admin-secret";
type Access = { authenticated: boolean; configured: boolean; sessionToken?: string };
type Connection = "checking" | "required" | "ready" | "unconfigured" | "error";
type Row = Record<string, unknown>;
type Tab = "pregled" | "zarada" | "porudzbine" | "proizvodi" | "paketi" | "kupci" | "pretplate" | "dostave" | "popusti" | "sadrzaj" | "podesavanja";
type AdminData = { dashboard: Row; products: Product[]; bundles: Row[]; customers: Row[]; subscriptions: Row[]; deliveries: Row[]; delivery: Row; deliveryPreparation: Row[]; deliveryCanGenerate: boolean; promos: Row[]; settings: Row; integrations: Row };
const emptyData: AdminData = { dashboard: {}, products: [], bundles: [], customers: [], subscriptions: [], deliveries: [], delivery: {}, deliveryPreparation: [], deliveryCanGenerate: false, promos: [], settings: {}, integrations: {} };

function row(value: unknown): Row { return value && typeof value === "object" ? value as Row : {}; }
function string(value: unknown, fallback = "-") { return typeof value === "string" && value ? value : fallback; }
function number(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function bool(value: unknown, fallback = false) { return value === true || value === 1 || value === "1" ? true : value === false || value === 0 || value === "0" ? false : fallback; }
function idOf(value: Row) { return string(value.id ?? value.customerId ?? value.customer_id ?? value.subscriptionId ?? value.subscription_id ?? value.orderId ?? value.order_id); }
function extractObject(payload: unknown, keys: string[]): Row { const wrapper = row(payload); for (const key of keys) if (wrapper[key] && typeof wrapper[key] === "object" && !Array.isArray(wrapper[key])) return row(wrapper[key]); return wrapper.data && typeof wrapper.data === "object" && !Array.isArray(wrapper.data) ? row(wrapper.data) : wrapper; }
function businessDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

const nav: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "pregled", label: "Pregled", icon: "⌂" },
  { id: "porudzbine", label: "Porudžbine", icon: "▤" },
  { id: "dostave", label: "Dostave", icon: "→" },
  { id: "kupci", label: "Kupci", icon: "◎" },
  { id: "podesavanja", label: "Podešavanja", icon: "⚙" },
];
const settingTabs: Array<{id:Tab;label:string}> = [
  {id:"podesavanja",label:"Dostava i naplata"}, {id:"proizvodi",label:"Proizvodi"}, {id:"paketi",label:"Paketi"}, {id:"popusti",label:"Popusti"}, {id:"sadrzaj",label:"Sadržaj sajta"},
];

export function AdminDashboard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [connection, setConnection] = useState<Connection>("checking");
  const loadVersion = useRef(0);
  const [activeTab, setActiveTab] = useState<Tab>("pregled");
  const [data, setData] = useState<AdminData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(businessDate);
  const [billingMonth, setBillingMonth] = useState(() => businessDate().slice(0, 7));
  const [ordersVersion, setOrdersVersion] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCustomer, setManualCustomer] = useState<Row | undefined>();
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [orderFilters, setOrderFilters] = useState<Record<string,string>>({});
  const [globalSearch, setGlobalSearch] = useState("");
  const [editingProduct, setEditingProduct] = useState<Product | null | undefined>(undefined);

  const checkAccess = useCallback(async (credentials?: { email: string; password: string }, signal?: AbortSignal) => {
    setConnection("checking"); setError("");
    try {
      const access = await fetchJson<Access>("/api/admin/access", credentials ? { signal, method: "POST", body: JSON.stringify(credentials) } : { signal });
      if (signal?.aborted) return;
      setSessionToken(access.sessionToken ?? "");
      setConnection(access.authenticated ? "ready" : access.configured ? "required" : "unconfigured");
      setPassword("");
    } catch (requestError) {
      if (signal?.aborted) return;
      setSessionToken("");
      setConnection(requestError instanceof ApiError && requestError.code === "ADMIN_FORBIDDEN" ? "required" : requestError instanceof ApiError && requestError.code === "ADMIN_NOT_CONFIGURED" ? "unconfigured" : "error");
      setError(requestError instanceof Error ? requestError.message : "Provera pristupa nije uspela.");
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    // Remove the old permanent browser credential. Credentials now live only in
    // memory for this page. Reloading requires a fresh login.
    try { window.localStorage.removeItem(ADMIN_KEY); } catch { /* Storage may be disabled. */ }
    queueMicrotask(() => { if (!controller.signal.aborted) void checkAccess(undefined, controller.signal); });
    return () => { controller.abort(); loadVersion.current += 1; };
  }, [checkAccess]);
  const adminFetch = useCallback(<T,>(url: string, init?: RequestInit) => fetchJson<T>(url, { ...init, headers: { ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}), ...init?.headers } }), [sessionToken]);

  const loadAdmin = useCallback(async (silent = false) => {
    if (connection !== "ready") return;
    const version = ++loadVersion.current;
    if (!silent) { setLoading(true); setError(""); }
    const endpoints = [
      ["dashboard", "/api/admin/dashboard"], ["products", "/api/admin/products"],
      ["customers", "/api/admin/customers"], ["subscriptions", "/api/admin/subscriptions"],
      ["deliveries", `/api/admin/deliveries?date=${encodeURIComponent(deliveryDate)}`], ["promos", "/api/admin/promos"], ["bundles", "/api/admin/bundles"], ["settings", "/api/admin/settings"], ["integrations", "/api/admin/integrations"],
    ] as const;
    const results = await Promise.allSettled(endpoints.map(([, endpoint]) => adminFetch<unknown>(endpoint)));
    if (version !== loadVersion.current) return;
    const accessFailure = results.find((result) => result.status === "rejected" && result.reason instanceof ApiError && ["ADMIN_FORBIDDEN", "ADMIN_NOT_CONFIGURED"].includes(result.reason.code ?? ""));
    if (accessFailure?.status === "rejected") {
      setData(emptyData); setSessionToken(""); setLoading(false);
      setConnection(accessFailure.reason.code === "ADMIN_NOT_CONFIGURED" ? "unconfigured" : "required");
      setError(accessFailure.reason.message); return;
    }
    const next: AdminData = { ...emptyData }; const failed: string[] = [];
    results.forEach((result, index) => {
      const name = endpoints[index][0]; if (result.status === "rejected") { failed.push(name); return; }
      if (name === "products") next.products = unwrapList(result.value, ["products", "items"]).map(normalizeProduct);
      else if (name === "dashboard") next.dashboard = extractObject(result.value, ["dashboard", "stats"]);
      else if (name === "settings") next.settings = extractObject(result.value, ["settings"]);
      else if (name === "integrations") next.integrations = row(result.value);
      else if (name === "deliveries") {
        next.deliveries = unwrapList(result.value, ["orders", "deliveries", "items"]).map(row);
        next.delivery = extractObject(result.value, ["delivery"]);
        next.deliveryPreparation = unwrapList(result.value, ["preparation"]).map(row);
        next.deliveryCanGenerate = row(result.value).canGenerate === true;
      }
      else next[name] = unwrapList(result.value, [name, "items"]).map(row) as never;
    });
    const labels: Record<string, string> = { dashboard: "pregled", products: "proizvodi", orders: "porudžbine", customers: "kupci", subscriptions: "pretplate", deliveries: "dostave", promos: "popusti", bundles: "paketi", settings: "podešavanja", integrations: "integracije" };
    const databaseFailure = results.some((result) => result.status === "rejected" && result.reason instanceof ApiError && result.reason.code === "DATABASE_NOT_READY");
    setData((current) => silent && failed.length ? current : next);
    setOrdersVersion((version) => version + 1);
    if (failed.length) setError(databaseFailure ? "Baza podataka nije spremna. Primenite migracije i osvežite stranicu." : `Nije uspelo učitavanje: ${failed.map((name) => labels[name]).join(", ")}. Pokušajte ponovo pomoću dugmeta Osveži.`);
    setLoading(false);
  }, [adminFetch, connection, deliveryDate]);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void loadAdmin(); });
    return () => { cancelled = true; loadVersion.current += 1; };
  }, [loadAdmin]);

  useEffect(() => {
    if (connection !== "ready") return;
    let running = false;
    const refreshVisible = async () => {
      const editing = document.activeElement?.closest("input, select, textarea, form");
      if (document.visibilityState !== "visible" || busy || loading || editing || document.querySelector("dialog[open]") || running) return;
      running = true;
      try { await loadAdmin(true); } finally { running = false; }
    };
    const timer = window.setInterval(() => void refreshVisible(), 15_000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refreshVisible); document.removeEventListener("visibilitychange", refreshVisible); };
  }, [connection, busy, loading, loadAdmin]);

  function start(message = "") { setBusy(true); setError(""); setNotice(message); }
  function fail(requestError: unknown, fallback: string) {
    if (requestError instanceof ApiError && requestError.code === "ADMIN_FORBIDDEN") {
      loadVersion.current += 1; setSessionToken(""); setData(emptyData); setConnection("required");
    }
    setError(requestError instanceof Error ? requestError.message : fallback);
  }
  async function refresh(message: string) { setNotice(message); await loadAdmin(); }
  function signIn(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void checkAccess({ email, password }); }
  async function disconnect() {
    start();
    try {
      await adminFetch("/api/admin/access", { method: "DELETE" });
      loadVersion.current += 1; setSessionToken(""); setPassword(""); setEmail(""); setData(emptyData); setNotice(""); setConnection("required");
    } catch (e) { fail(e, "Odjava nije uspela. Pokušajte ponovo."); } finally { setBusy(false); }
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); start();
    const payload = {
      name: values.get("name"), slug: values.get("slug"), category: values.get("category"), unitLabel: values.get("unitLabel"),
      priceMinor: Math.round(Number(values.get("priceRsd")) * 100), subscriptionPriceMinor: Math.round(Number(values.get("subscriptionPriceRsd") || values.get("priceRsd")) * 100),
      costMinor: Math.round(Number(values.get("costRsd") || 0) * 100), packagingCostMinor: Math.round(Number(values.get("packagingCostRsd") || 0) * 100),
      compareAtPriceMinor: values.get("compareAtPriceRsd") ? Math.round(Number(values.get("compareAtPriceRsd")) * 100) : null,
      shortDescription: values.get("shortDescription"), description: values.get("description"), imageUrl: values.get("imageUrl"), imageAlt: values.get("imageAlt"),
      badge: values.get("badge"), origin: values.get("origin"), sortOrder: Number(values.get("sortOrder") || 0),
      seoTitle: values.get("seoTitle"), seoDescription: values.get("seoDescription"),
      badiSku: values.get("badiSku") ? Number(values.get("badiSku")) : null,
      isFeatured: values.get("isFeatured") === "on", allowSubscription: values.get("allowSubscription") === "on", isActive: values.get("isActive") === "on",
    };
    try {
      const url = editingProduct ? `/api/admin/products/${encodeURIComponent(editingProduct.id)}` : "/api/admin/products";
      await adminFetch(url, { method: editingProduct ? "PATCH" : "POST", body: JSON.stringify(payload) });
      setEditingProduct(undefined); await refresh(editingProduct ? "Proizvod je sačuvan." : "Proizvod je dodat.");
    } catch (requestError) { fail(requestError, "Proizvod nije sačuvan."); } finally { setBusy(false); }
  }

  async function toggleProduct(product: Product) { start(); try { await adminFetch(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: "PATCH", body: JSON.stringify({ isActive: !product.available }) }); await refresh(product.available ? "Proizvod je sakriven." : "Proizvod je objavljen."); } catch (e) { fail(e, "Izmena nije sačuvana."); } finally { setBusy(false); } }
  async function deleteProduct(product: Product) { if (!window.confirm(`Obrisati „${product.name}“? Ako pripada paketu ili ima istoriju, biće bezbedno arhiviran.`)) return; start(); try { const result = await adminFetch<{ archived?: boolean }>(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: "DELETE" }); await refresh(result.archived ? "Proizvod ima istoriju ili pripada paketu pa je arhiviran." : "Proizvod je obrisan."); } catch (e) { fail(e, "Proizvod nije obrisan."); } finally { setBusy(false); } }

  async function saveSettings(event: FormEvent<HTMLFormElement>, kind: "content" | "operations") {
    event.preventDefault(); const values = new FormData(event.currentTarget); start();
    const payload = kind === "content" ? {
      storeName: values.get("storeName"), announcementEnabled: values.get("announcementEnabled") === "on", announcementText: values.get("announcementText"), announcementLinkLabel: values.get("announcementLinkLabel"), announcementUrl: values.get("announcementUrl"),
      heroEyebrow: values.get("heroEyebrow"), heroTitle: values.get("heroTitle"), heroSubtitle: values.get("heroSubtitle"), heroPrimaryLabel: values.get("heroPrimaryLabel"), heroPrimaryUrl: values.get("heroPrimaryUrl"), heroSecondaryLabel: values.get("heroSecondaryLabel"), heroSecondaryUrl: values.get("heroSecondaryUrl"),
      guaranteeTitle: values.get("guaranteeTitle"), guaranteeText: values.get("guaranteeText"), trustItemOne: values.get("trustItemOne"), trustItemTwo: values.get("trustItemTwo"), trustItemThree: values.get("trustItemThree"),
    } : {
      cutoffHours: Number(values.get("cutoffHours")), deliveryWeekdays: values.getAll("deliveryWeekdays").map(Number), deliveryLocalTime: values.get("deliveryLocalTime"), serviceAreaTitle: values.get("serviceAreaTitle"), serviceAreaNote: values.get("serviceAreaNote"), servicePostalCodes: String(values.get("servicePostalCodes") ?? "").split(",").map((item) => item.trim()).filter(Boolean), deliveryFeeMinor: Math.round(Number(values.get("deliveryFeeRsd") || 0) * 100), freeDeliveryThresholdMinor: Math.round(Number(values.get("freeDeliveryThresholdRsd") || 0) * 100), routeCapacity: Number(values.get("routeCapacity") || 0), estimatedDeliveryCostMinor: Math.round(Number(values.get("estimatedDeliveryCostRsd") || 0) * 100), paymentFeeBps: Math.round(Number(values.get("paymentFeePercent") || 0) * 100),
    };
    try { await adminFetch("/api/admin/settings", { method: "PATCH", body: JSON.stringify(payload) }); await refresh("Podešavanja su sačuvana i odmah su vidljiva na sajtu."); } catch (e) { fail(e, "Podešavanja nisu sačuvana."); } finally { setBusy(false); }
  }

  async function createPromo(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); start(); try { await adminFetch("/api/admin/promos", { method: "POST", body: JSON.stringify({ code: values.get("code"), description: values.get("description"), discountType: values.get("discountType"), discountValue: values.get("discountType") === "fixed" ? Math.round(Number(values.get("discountValue")) * 100) : Number(values.get("discountValue")), minimumOrderMinor: Math.round(Number(values.get("minimumOrderRsd") || 0) * 100), usageLimit: values.get("usageLimit") || null, isActive: true }) }); form.reset(); await refresh("Promo kod je dodat."); } catch (e) { fail(e, "Promo kod nije dodat."); } finally { setBusy(false); } }
  async function togglePromo(promo: Row) { start(); try { await adminFetch(`/api/admin/promos/${encodeURIComponent(idOf(promo))}`, { method: "PATCH", body: JSON.stringify({ isActive: !bool(promo.is_active) }) }); await refresh("Status promo koda je promenjen."); } catch (e) { fail(e, "Promo kod nije izmenjen."); } finally { setBusy(false); } }
  async function deletePromo(promo: Row) { if (!window.confirm(`Obrisati kod ${string(promo.code)}?`)) return; start(); try { await adminFetch(`/api/admin/promos/${encodeURIComponent(idOf(promo))}`, { method: "DELETE" }); await refresh("Promo kod je obrisan."); } catch (e) { fail(e, "Promo kod nije obrisan."); } finally { setBusy(false); } }
  async function saveBundle(id: string | null, payload: Row) { start(); try { await adminFetch(id ? `/api/admin/bundles/${encodeURIComponent(id)}` : "/api/admin/bundles", { method: id ? "PATCH" : "POST", body: JSON.stringify(payload) }); await refresh(id ? "Paket je sačuvan." : "Paket je dodat."); } catch (e) { fail(e, "Paket nije sačuvan."); throw e; } finally { setBusy(false); } }
  async function deleteBundle(id: string) { if (!window.confirm("Obrisati ovaj paket?")) return; start(); try { await adminFetch(`/api/admin/bundles/${encodeURIComponent(id)}`, { method: "DELETE" }); await refresh("Paket je obrisan."); } catch (e) { fail(e, "Paket nije obrisan."); } finally { setBusy(false); } }
  async function saveOrder(id: string, paymentStatus: string, fulfillmentStatus: string) { start(); try { await adminFetch("/api/admin/orders", { method: "PATCH", body: JSON.stringify({ id, paymentStatus, fulfillmentStatus }) }); await refresh("Porudžbina je ažurirana."); } catch (e) { fail(e, "Porudžbina nije ažurirana."); } finally { setBusy(false); } }


  async function runBilling() { start(); try { const result = await adminFetch<{ processed?: number }>("/api/jobs/billing", { method: "POST", headers: { "Idempotency-Key": window.crypto.randomUUID() }, body: JSON.stringify({ month: billingMonth }) }); await refresh(`Mesečni obračun je završen: ${number(result.processed)} pretplata.`); } catch (e) { fail(e, "Mesečni obračun nije uspeo."); } finally { setBusy(false); } }
  async function runIntegrationAction(action: "process" | "retry_failed") { start(); try { const result = await adminFetch<Row>("/api/admin/integrations", { method: "POST", body: JSON.stringify({ action, limit: 100 }) }); await refresh(action === "process" ? `Obrađeno događaja: ${number(result.attempted)}.` : `Vraćeno u red: ${number(result.requeued)}.`); } catch (e) { fail(e, "Integracioni red nije obrađen."); } finally { setBusy(false); } }
  async function downloadExport(path: string, filename: string, message: string) {
    start();
    try {
      const response = await fetch(path, { headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {} });
      if (!response.ok) {
        const payload = await response.json();
        throw new ApiError(payload.error?.message ?? "Izvoz nije generisan.", response.status, payload.error?.code);
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(message);
    } catch (e) { fail(e, "Izvoz nije generisan."); } finally { setBusy(false); }
  }
  function downloadDeliveryExport(format: "csv" | "xlsx") {
    return downloadExport(`/api/admin/deliveries/export?date=${encodeURIComponent(deliveryDate)}&format=${format}`, `mleko-dostave-${deliveryDate}.${format}`, format === "csv" ? "CSV za Spoke je preuzet." : "Excel sa dostavama i zbirnom pripremom je preuzet.");
  }
  function downloadOrderExport(id: string, format: "csv" | "xlsx") {
    return downloadExport(`/api/admin/orders/${encodeURIComponent(id)}/export?format=${format}`, `potvrda-${id}.${format}`, "Potvrda porudžbine je preuzeta.");
  }

  const s = data.settings;
  const inSettings = settingTabs.some(item => item.id === activeTab);

  if (connection !== "ready") return (
    <div className="admin-access">
      <section className="admin-access-card" aria-labelledby="admin-access-title">
        <Link className="admin-brand" href="/"><img src="/images/mleko-i-mleko-logo.png" alt="" width="80" height="80" /><strong>Mleko Admin</strong></Link>
        <h1 id="admin-access-title">{connection === "checking" ? "Proveravamo pristup…" : connection === "unconfigured" ? "Pristup još nije podešen" : "Prijava u administraciju"}</h1>
        {connection === "checking" ? <p role="status">Sačekajte trenutak.</p> : null}
        {connection === "unconfigured" ? <p>Postavite email adresu i lozinku u podešavanjima servera i ponovo objavite aplikaciju.</p> : null}
        {error ? <p className="notice error" role="alert">{error}</p> : null}
        {connection === "required" ? <form className="admin-form" onSubmit={signIn}><label className="field"><span>Email</span><input name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label className="field"><span>Lozinka</span><input name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button className="button" type="submit">Prijavi se</button></form> : null}
        {connection === "error" || connection === "unconfigured" ? <button className="button secondary" type="button" onClick={() => void checkAccess()}>Pokušaj ponovo</button> : null}
        <Link className="text-link" href="/">Nazad u prodavnicu</Link>
      </section>
    </div>
  );

  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/admin"><img src="/images/mleko-i-mleko-logo.png" alt="" width="4167" height="4167" /><strong>Mleko Admin</strong></a>
        <nav aria-label="Administracija">{nav.map((item) => <button key={item.id} type="button" className={(activeTab === item.id || (item.id === "podesavanja" && inSettings)) ? "active" : ""} onClick={() => { setActiveTab(item.id); setEditingProduct(undefined); }}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}</nav>
        <a className="admin-store-link" href="/" target="_blank" rel="noreferrer">Otvori prodavnicu ↗</a>
      </aside>
      <section className="admin-main">
        <header className="admin-topbar"><div><p className="eyebrow">Administracija</p><h1>{nav.find((item) => item.id === activeTab)?.label ?? settingTabs.find(item => item.id === activeTab)?.label}</h1></div><div className="admin-top-actions"><button className="button" onClick={() => { setManualCustomer(undefined); setManualOpen(true); }}>+ Nova porudžbina</button><span className="status-dot" role="status">{loading ? "Učitavanje…" : error ? "Potrebna provera" : "● Povezano"}</span><button className="button secondary small" type="button" disabled={loading} onClick={() => void loadAdmin()}>Osveži</button><button className="text-button" type="button" disabled={busy} onClick={() => void disconnect()}>Odjavi se</button></div></header>
        <form className="work-global-search" onSubmit={event => { event.preventDefault(); setOrderFilters({q:globalSearch}); setActiveTab("porudzbine"); }}><label><span className="sr-only">Pretraži porudžbine i kupce</span><input type="search" placeholder="Pronađi porudžbinu · ime, telefon ili broj" value={globalSearch} onChange={event => setGlobalSearch(event.target.value)} /></label><button className="button secondary small">Pretraži</button></form>
        {globalSearch.length >= 2 ? <div className="work-global-results">{data.customers.filter(customer => [customer.full_name,customer.phone,customer.email].join(" ").toLowerCase().includes(globalSearch.toLowerCase())).slice(0,5).map(customer => <button key={idOf(customer)} onClick={() => { setSelectedCustomer(idOf(customer)); setGlobalSearch(""); setActiveTab("kupci"); }}><strong>{string(customer.full_name,"Kupac")}</strong> · {string(customer.phone,"")} <span>Otvori kupca →</span></button>)}</div> : null}
        {inSettings ? <nav className="work-settings-nav" aria-label="Podešavanja prodavnice">{settingTabs.map(item => <button key={item.id} className={activeTab === item.id ? "active" : ""} onClick={() => { setActiveTab(item.id); setEditingProduct(undefined); }}>{item.label}</button>)}</nav> : null}
        {manualOpen ? <ManualOrder request={adminFetch} customers={data.customers} products={data.products} initialCustomer={manualCustomer} onClose={() => setManualOpen(false)} onSaved={date => { setManualOpen(false); setDeliveryDate(date); setActiveTab("dostave"); void loadAdmin(true); }} /> : null}
        {notice ? <p className="notice success" role="status">{notice}</p> : null}{error ? <p className="notice error" role="alert">{error}</p> : null}
        {activeTab === "porudzbine" ? <OrdersPanel key={JSON.stringify(orderFilters)} initialFilters={orderFilters} request={adminFetch} version={ordersVersion} busy={busy} onSave={saveOrder} onExport={downloadOrderExport} /> : null}
        {loading ? <p className="loading-state">Učitavamo administraciju…</p> : <section className="admin-content">
          {activeTab === "pregled" ? <Overview request={adminFetch} version={ordersVersion} onDelivery={date => { setDeliveryDate(date); setActiveTab("dostave"); }} onCustomer={id => { setSelectedCustomer(id); setActiveTab("kupci"); }} onOrders={filters => { setOrderFilters(filters); setActiveTab("porudzbine"); }} onSettings={() => setActiveTab("podesavanja")} /> : null}

          {activeTab === "proizvodi" ? <section className="admin-panel"><div className="panel-heading"><div><h2>Svi proizvodi</h2><p>{data.products.length} proizvoda</p></div><button className="button small" type="button" disabled={busy} onClick={() => setEditingProduct(null)}>＋ Dodaj proizvod</button></div>{editingProduct !== undefined ? <ProductForm product={editingProduct} busy={busy} onSubmit={saveProduct} onCancel={() => setEditingProduct(undefined)} /> : null}<div className="product-admin-list">{data.products.map((product) => <article key={product.id}><div className="admin-product-image">{product.imageUrl ? <img src={product.imageUrl} alt="" width="1080" height="1080" loading="lazy" /> : <span>□</span>}</div><div><strong>{product.name}</strong><p>{product.category} · {product.unit}</p></div><div><strong>{formatMoney(product.priceRsd)}</strong><p>{product.allowSubscription ? `Redovno ${formatMoney(product.subscriptionPriceRsd)}` : "Samo jednokratno"}</p></div><span className={`status-pill ${product.available ? "active" : ""}`}>{product.available ? "Objavljen" : "Sakriven"}</span><div className="row-actions"><button type="button" disabled={busy} onClick={() => setEditingProduct(product)}>Izmeni</button><button type="button" disabled={busy} onClick={() => void toggleProduct(product)}>{product.available ? "Sakrij" : "Objavi"}</button><button className="danger-text" type="button" disabled={busy} onClick={() => void deleteProduct(product)}>Obriši</button></div></article>)}</div></section> : null}
          {activeTab === "paketi" ? <BundleAdmin products={data.products} bundles={data.bundles} busy={busy} onSave={saveBundle} onDelete={deleteBundle} /> : null}



          {activeTab === "kupci" ? <CustomersPanel request={adminFetch} customers={data.customers} subscriptions={data.subscriptions} selectedId={selectedCustomer} onSelect={setSelectedCustomer} onNew={customer => { setSelectedCustomer(""); setManualCustomer(customer); setManualOpen(true); }} onChanged={() => void loadAdmin(true)} /> : null}

          {activeTab === "dostave" ? <DeliveriesPanel request={adminFetch} date={deliveryDate} onDate={setDeliveryDate} version={ordersVersion} onExport={downloadDeliveryExport} onChanged={() => void loadAdmin(true)} /> : null}

          {activeTab === "popusti" ? <div className="admin-grid-2"><form className="admin-panel admin-form" onSubmit={createPromo}><div className="panel-heading"><div><h2>Novi promo kod</h2><p>Popust se proverava u korpi i checkout-u.</p></div></div><label className="field"><span>Kod</span><input name="code" placeholder="DOBRODOSLI10" pattern="[A-Za-z0-9_-]+" required /></label><label className="field"><span>Interni opis</span><input name="description" /></label><div className="form-grid"><label className="field"><span>Vrsta</span><select name="discountType"><option value="percent">Procenat</option><option value="fixed">Fiksni RSD</option></select></label><label className="field"><span>Vrednost</span><input name="discountValue" type="number" min="1" required /></label><label className="field"><span>Minimalna porudžbina (RSD)</span><input name="minimumOrderRsd" type="number" min="0" defaultValue="0" /></label><label className="field"><span>Limit korišćenja</span><input name="usageLimit" type="number" min="1" /></label></div><button className="button" type="submit" disabled={busy}>Dodaj kod</button></form><section className="admin-panel"><div className="panel-heading"><h2>Aktivni kodovi</h2></div><div className="promo-list">{data.promos.map((promo) => <article key={idOf(promo)}><div><code>{string(promo.code)}</code><p>{string(promo.description, "Bez opisa")}</p></div><strong>{string(promo.discount_type) === "percent" ? `${number(promo.discount_value)}%` : formatMoney(number(promo.discount_value) / 100)}</strong><span>{number(promo.times_used)} korišćenja</span><div className="row-actions"><button type="button" onClick={() => void togglePromo(promo)}>{bool(promo.is_active) ? "Pauziraj" : "Aktiviraj"}</button><button className="danger-text" type="button" onClick={() => void deletePromo(promo)}>Obriši</button></div></article>)}{!data.promos.length ? <p className="admin-empty">Nema promo kodova.</p> : null}</div></section></div> : null}

          {activeTab === "sadrzaj" ? <form className="admin-panel admin-form wide-form" key={JSON.stringify(s)} onSubmit={(event) => void saveSettings(event, "content")}><div className="panel-heading"><div><h2>Početna strana i announcement bar</h2><p>Promene su odmah vidljive na sajtu.</p></div><button className="button small" type="submit" disabled={busy}>Sačuvaj sve</button></div><FormSection title="Brend"><label className="field"><span>Naziv prodavnice</span><input name="storeName" defaultValue={string(s.storeName, "Mleko i Mleko")} required /></label></FormSection><FormSection title="Announcement bar" description="Traka iznad glavne navigacije; tekst i link su potpuno izmenjivi."><Check name="announcementEnabled" label="Prikaži announcement bar" checked={bool(s.announcementEnabled)} /><div className="form-grid"><label className="field"><span>Tekst</span><input name="announcementText" defaultValue={string(s.announcementText, "")} required /></label><label className="field"><span>Tekst linka</span><input name="announcementLinkLabel" defaultValue={string(s.announcementLinkLabel, "Saznaj više")} required /></label><label className="field"><span>Link</span><input name="announcementUrl" defaultValue={string(s.announcementUrl, "/prodavnica")} required /></label></div></FormSection><FormSection title="Glavni hero"><label className="field"><span>Nadnaslov</span><input name="heroEyebrow" defaultValue={string(s.heroEyebrow, "")} required /></label><label className="field"><span>Naslov</span><input name="heroTitle" defaultValue={string(s.heroTitle, "")} required /></label><label className="field"><span>Podnaslov</span><textarea name="heroSubtitle" defaultValue={string(s.heroSubtitle, "")} required /></label><div className="form-grid"><label className="field"><span>Glavno dugme</span><input name="heroPrimaryLabel" defaultValue={string(s.heroPrimaryLabel, "")} required /></label><label className="field"><span>Glavni link</span><input name="heroPrimaryUrl" defaultValue={string(s.heroPrimaryUrl, "/prodavnica")} required /></label><label className="field"><span>Sporedno dugme</span><input name="heroSecondaryLabel" defaultValue={string(s.heroSecondaryLabel, "")} required /></label><label className="field"><span>Sporedni link</span><input name="heroSecondaryUrl" defaultValue={string(s.heroSecondaryUrl, "/kako-funkcionise")} required /></label></div></FormSection><FormSection title="Poverenje i garancija"><label className="field"><span>Naslov garancije</span><input name="guaranteeTitle" defaultValue={string(s.guaranteeTitle, "")} required /></label><label className="field"><span>Tekst garancije</span><textarea name="guaranteeText" defaultValue={string(s.guaranteeText, "")} required /></label><div className="form-grid"><label className="field"><span>Pogodnost 1</span><input name="trustItemOne" defaultValue={string(s.trustItemOne, "")} required /></label><label className="field"><span>Pogodnost 2</span><input name="trustItemTwo" defaultValue={string(s.trustItemTwo, "")} required /></label><label className="field"><span>Pogodnost 3</span><input name="trustItemThree" defaultValue={string(s.trustItemThree, "")} required /></label></div></FormSection><div className="form-submit"><button className="button" type="submit" disabled={busy}>Sačuvaj sadržaj</button><a className="button secondary" href="/" target="_blank" rel="noreferrer">Pogledaj sajt ↗</a></div></form> : null}

          {activeTab === "podesavanja" ? <form className="admin-panel admin-form wide-form" key={JSON.stringify(s)} onSubmit={(event) => void saveSettings(event, "operations")}><div className="panel-heading"><div><h2>Dostava i naplata</h2><p>Pravila važe za obračun korpe, checkout i nalog kupca.</p></div><button className="button small" type="submit" disabled={busy}>Sačuvaj</button></div><FormSection title="Termini i rok za izmene"><div className="form-grid"><fieldset><legend>Dani dostave</legend>{[[2, "Utorak"], [5, "Petak"]].map(([day, label]) => <label key={day}><input type="checkbox" name="deliveryWeekdays" value={day} defaultChecked={(Array.isArray(s.deliveryWeekdays) ? s.deliveryWeekdays : [2, 5]).includes(day)} /> {label}</label>)}</fieldset><label className="field"><span>Vreme</span><input name="deliveryLocalTime" type="time" defaultValue={string(s.deliveryLocalTime, "08:00")} required /></label><label className="field"><span>Rok za izmenu (sati)</span><input name="cutoffHours" type="number" min="0" defaultValue={number(s.cutoffHours, 24)} required /></label><label className="field"><span>Kapacitet dostave (0 = bez limita)</span><input name="routeCapacity" type="number" min="0" defaultValue={number(s.routeCapacity)} /></label></div></FormSection><FormSection title="Zona dostave"><label className="field"><span>Naslov provere</span><input name="serviceAreaTitle" defaultValue={string(s.serviceAreaTitle, "Proverite sledeću dostavu")} required /></label><label className="field"><span>Napomena</span><input name="serviceAreaNote" defaultValue={string(s.serviceAreaNote, "")} required /></label><label className="field"><span>Poštanski brojevi ili prefiksi, odvojeni zarezom</span><input name="servicePostalCodes" defaultValue={Array.isArray(s.servicePostalCodes) ? s.servicePostalCodes.join(", ") : ""} placeholder="11, 21" /></label></FormSection><FormSection title="Trošak dostave i marža"><div className="form-grid"><label className="field"><span>Cena po jednoj dostavi (RSD)</span><input name="deliveryFeeRsd" type="number" min="0" defaultValue={number(s.deliveryFeeMinor) / 100} /></label><label className="field"><span>Besplatna dostava iznad (RSD, 0 = isključeno)</span><input name="freeDeliveryThresholdRsd" type="number" min="0" defaultValue={number(s.freeDeliveryThresholdMinor) / 100} /></label><label className="field"><span>Procenjeni stvarni trošak jedne dostave (RSD)</span><input name="estimatedDeliveryCostRsd" type="number" min="0" defaultValue={number(s.estimatedDeliveryCostMinor) / 100} /></label><label className="field"><span>Naknada za plaćanje (%)</span><input name="paymentFeePercent" type="number" min="0" max="100" step="0.01" defaultValue={number(s.paymentFeeBps) / 100} /></label></div></FormSection><button className="button" type="submit" disabled={busy}>Sačuvaj operativna pravila</button></form> : null}
          {activeTab === "podesavanja" ? <details className="admin-panel work-advanced"><summary>Napredno · poruke, obračuni i integracije</summary><OperationsPanel integrations={data.integrations} billingMonth={billingMonth} busy={busy} onBillingMonth={setBillingMonth} onRunBilling={() => void runBilling()} onProcess={() => void runIntegrationAction("process")} onRetry={() => void runIntegrationAction("retry_failed")} /></details> : null}
        </section>}
      </section>
    </div>
  );
}

function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) { return <section className="form-section"><div><h3>{title}</h3>{description ? <p>{description}</p> : null}</div><div className="form-section-fields">{children}</div></section>; }
function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) { return <label className="checkbox-row"><input type="checkbox" name={name} defaultChecked={checked} /><span>{label}</span></label>; }

function OperationsPanel({ integrations, billingMonth, busy, onBillingMonth, onRunBilling, onProcess, onRetry }: { integrations: Row; billingMonth: string; busy: boolean; onBillingMonth: (value: string) => void; onRunBilling: () => void; onProcess: () => void; onRetry: () => void }) {
  const config = row(integrations.config); const outbox = unwrapList(integrations, ["outbox"]).map(row); const receipts = unwrapList(integrations, ["recentReceipts"]).map(row); const failures = unwrapList(integrations, ["failures"]).map(row);
  const statusCount = (status: string) => number(outbox.find((item) => string(item.status) === status)?.count);
  return <section className="admin-panel admin-form wide-form"><div className="panel-heading"><div><h2>Automatska obrada i povezani servisi</h2><p>Pratite obračune, slanje poruka i stvarni status povezanih servisa.</p></div></div><div className="admin-grid-2"><div className="form-section-fields"><h3>Mesečni obračun</h3><p>Generiše po jednu mesečnu fakturu po pretplati, sa nedeljnim ili dvonedeljnim terminima i prenosom kredita.</p><div className="inline-controls"><label className="field"><span>Mesec</span><input type="month" value={billingMonth} onChange={(event) => onBillingMonth(event.target.value)} /></label><button className="button small" type="button" disabled={busy} onClick={onRunBilling}>Pokreni obračun</button></div></div><div className="form-section-fields"><h3>Poruke i obrada</h3><ul className="list-clean"><li className="summary-row"><span>Na čekanju</span><strong>{statusCount("pending")}</strong></li><li className="summary-row"><span>Poslato / obrađeno</span><strong>{statusCount("sent")}</strong></li><li className="summary-row"><span>Neuspešno</span><strong>{statusCount("failed")}</strong></li></ul><div className="button-row"><button className="button small" type="button" disabled={busy} onClick={onProcess}>Obradi poruke</button><button className="button secondary small" type="button" disabled={busy || !failures.length} onClick={onRetry}>Ponovi neuspešne</button></div></div></div><div className="admin-grid-2"><div><h3>Režimi</h3><ul className="list-clean"><li className="summary-row"><span>Naplata</span><strong>{string(row(config.payment).mode)}</strong></li><li className="summary-row"><span>Fiskalizacija</span><strong>{string(row(config.fiscalization).mode)}</strong></li><li className="summary-row"><span>Email</span><strong>{string(row(config.email).mode)}</strong></li></ul></div><div><h3>Poslednji računi</h3>{receipts.length ? <ul className="list-clean">{receipts.slice(0, 5).map((receipt) => <li className="summary-row" key={idOf(receipt)}><span>{string(receipt.order_number)}<small> · {string(receipt.invoice_number, string(receipt.last_error_code, "bez broja"))}</small></span><strong>{statusLabel(string(receipt.status))}</strong></li>)}</ul> : <p className="admin-empty">Još nema obrađenih fiskalnih računa.</p>}</div></div>{failures.length ? <div><h3>Potrebna pažnja</h3><ul className="list-clean">{failures.slice(0, 5).map((failure) => <li className="summary-row" key={idOf(failure)}><span>{string(failure.topic)}<small> · {string(failure.last_error_message)}</small></span><strong>{number(failure.attempts)}×</strong></li>)}</ul></div> : null}</section>;
}

function ProductForm({ product, busy, onSubmit, onCancel }: { product: Product | null; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return <form className="admin-editor admin-form" key={product?.id ?? "new"} onSubmit={onSubmit}><div className="panel-heading"><div><h2>{product ? `Izmeni: ${product.name}` : "Novi proizvod"}</h2><p>Sva polja kasnije možete menjati.</p></div><button className="text-button" type="button" onClick={onCancel}>Zatvori ×</button></div><div className="form-grid"><label className="field"><span>Naziv</span><input name="name" defaultValue={product?.name ?? ""} required /></label><label className="field"><span>URL slug</span><input name="slug" defaultValue={product?.slug ?? ""} pattern="[a-z0-9]+(-[a-z0-9]+)*" title="Mala slova, brojevi i crtice između reči" required /></label><label className="field"><span>Kategorija</span><input name="category" defaultValue={product?.category ?? "Mleko"} required /></label><label className="field"><span>Pakovanje</span><input name="unitLabel" defaultValue={product?.unit ?? "1 L"} required /></label><label className="field"><span>Jednokratna cena (RSD)</span><input name="priceRsd" type="number" min="0" step="0.01" defaultValue={product?.priceRsd ?? 0} required /></label><label className="field"><span>Cena redovne dostave (RSD)</span><input name="subscriptionPriceRsd" type="number" min="0" step="0.01" defaultValue={product?.subscriptionPriceRsd ?? ""} /></label><label className="field"><span>Nabavna/proizvodna cena (RSD)</span><input name="costRsd" type="number" min="0" step="0.01" defaultValue={product?.costRsd ?? 0} /></label><label className="field"><span>Ambalaža po komadu (RSD)</span><input name="packagingCostRsd" type="number" min="0" step="0.01" defaultValue={product?.packagingCostRsd ?? 0} /></label><label className="field"><span>Precrtana cena (RSD)</span><input name="compareAtPriceRsd" type="number" min="0" step="0.01" defaultValue={product?.compareAtPriceRsd ?? ""} /></label><label className="field"><span>Redosled</span><input name="sortOrder" type="number" min="0" defaultValue={product?.sortOrder ?? 0} /></label><label className="field"><span>Badi SKU</span><input name="badiSku" type="number" min="1" step="1" defaultValue={product?.badiSku ?? ""} placeholder="Unosi se pre Badi aktivacije" /></label></div><label className="field"><span>Kratak opis</span><input name="shortDescription" defaultValue={product?.shortDescription ?? ""} /></label><label className="field"><span>Pun opis</span><textarea name="description" defaultValue={product?.description ?? ""} /></label><div className="form-grid"><label className="field"><span>Putanja fotografije</span><input name="imageUrl" defaultValue={product?.imageUrl ?? ""} placeholder="/images/proizvod.jpg" /></label><label className="field"><span>Alt opis fotografije</span><input name="imageAlt" defaultValue={product?.imageAlt ?? ""} /></label><label className="field"><span>Bedž</span><input name="badge" defaultValue={product?.badge ?? ""} placeholder="Najčešći izbor" /></label><label className="field"><span>Poreklo</span><input name="origin" defaultValue={product?.origin ?? ""} /></label><label className="field"><span>SEO naslov</span><input name="seoTitle" defaultValue={product?.seoTitle ?? ""} maxLength={70} /></label><label className="field"><span>SEO opis</span><input name="seoDescription" defaultValue={product?.seoDescription ?? ""} maxLength={170} /></label></div><div className="check-grid"><Check name="isActive" label="Objavljen" checked={product?.available ?? true} /><Check name="isFeatured" label="Izdvojen na početnoj" checked={product?.isFeatured ?? false} /><Check name="allowSubscription" label="Dozvoli redovnu dostavu" checked={product?.allowSubscription ?? true} /></div><div className="button-row"><button className="button" type="submit" disabled={busy}>{busy ? "Čuvamo…" : "Sačuvaj proizvod"}</button><button className="button secondary" type="button" onClick={onCancel}>Odustani</button></div></form>;
}
