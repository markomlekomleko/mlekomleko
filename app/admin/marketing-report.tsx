"use client";
/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The horizontally scrollable report needs keyboard focus, including in Safari. */
import { useState } from "react";
import { formatMoney } from "../lib/frontend";
import { Empty, num, obj, rows, str, type Row } from "./workspace-shared";
export function MarketingReport({ data }: { data: Row }) {
  const [filter,setFilter] = useState("");
  const channels = rows(data.channels);
  const visible = channels.filter(row => `${str(row.label)} ${str(row.source)} ${str(row.campaign)}`.toLowerCase().includes(filter.toLowerCase()));
  const readiness = obj(data.readiness);
  const totals = ["visits","products","carts","checkouts","paidOrders"].map(key => channels.reduce((total,row) => total + num(row[key]),0));
  return <section className="admin-panel" aria-label="Izvori prodaje i kampanje">
    <h3>Odakle dolaze kupci</h3><p className="work-hint">{str(data.attribution)}</p>
    <div className="work-sub-stats" style={{ flexWrap: "wrap" }}>{["Posete","Pregled proizvoda","Dodavanje u korpu","Checkout","Plaćene porudžbine"].map((label,i) => <div key={label}><span>{label}</span><strong>{totals[i]}</strong></div>)}</div>
    <label>Pronađi kanal ili kampanju<input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Google, Instagram, QR…" /></label>
    {visible.length ? <div tabIndex={0} role="region" aria-label="Tabela izvora prodaje" style={{ overflowX:"auto" }}><table className="admin-table"><caption className="sr-only">Kanali i kampanje u izabranom periodu</caption><thead><tr>{["Kanal / kampanja","Posete","Proizvodi","Korpa","Checkout","Porudžbine","Plaćene","Prihod","Konverzija"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{visible.map(row => <tr key={str(row.key)}><td><strong>{str(row.label)}</strong><br/>{str(row.source)} · {str(row.campaign)}</td>{["visits","products","carts","checkouts","orders","paidOrders"].map(key=><td key={key}>{num(row[key])}</td>)}<td>{formatMoney(num(row.paidMinor)/100)}</td><td>{num(row.conversionRate)}%</td></tr>)}</tbody></table></div> : <Empty title="Nema zabeleženih aktivnosti">Kampanje će se pojaviti kada posetioci dozvole analitiku. Neplaćene porudžbine nisu prihod.</Empty>}
    <details><summary>Povezivanje analitike</summary><p className="work-hint">Ovo potvrđuje samo prisustvo konfiguracije. Prijem događaja proverava se u nalozima servisa.</p><ul>{[["GA4 + serverski purchase",readiness.ga4],["GTM (isključuje direktne tagove)",readiness.gtm],["Meta Pixel",readiness.metaPixel],["Meta serverski purchase",readiness.metaConversions],["Google Ads tag",readiness.googleAds]].map(([label,configured])=><li key={String(label)}>{String(label)}: <strong>{configured ? "Konfigurisan" : "Nije konfigurisan"}</strong></li>)}</ul><p className="work-hint">Google Ads prodaju uvozi iz GA4 purchase događaja. U Ads nalogu povežite GA4 i uključite purchase kao konverziju samo jednom.</p></details>
  </section>;
}
