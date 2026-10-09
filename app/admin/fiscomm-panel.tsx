"use client";
import { useState } from "react";
import { obj, rows, str, type Requester, type Row } from "./workspace-shared";
export function FiscommPanel({request}: {request: Requester}) {
  const [data, setData] = useState<Row | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function check() {setBusy(true); setError(""); try {setData(await request<Row>("/api/admin/fiscomm"));} catch (e) {setError(e instanceof Error ? e.message : "Provera nije uspela.");} finally {setBusy(false);}}
  return <section className="admin-panel"><h2>Fiscomm fiskalizacija</h2><p>Uplata celog paketa → avansni račun. Potvrđena poslednja dostava → zatvaranje avansa i konačni račun. Dokumenti se šalju kupcu posebno od naplate.</p><button className="button secondary" disabled={busy} onClick={() => void check()}>{busy ? "Proveravamo…" : "Proveri vezu i poreske oznake"}</button>{error ? <p role="alert">{error}</p> : null}{data ? <><p><strong>{str(data.companyName)} · {str(data.shopName)}</strong></p><p>Veza je potvrđena. Ova provera ne izdaje račun.</p><ul>{rows(obj(data.currentTaxRates).taxCategories).flatMap(category => rows(category.taxRates).map(rate => <li key={str(rate.label)}>{str(rate.label)} — {String(rate.rate)}% · {str(category.name)}</li>))}</ul><p>Poresku oznaku svakog proizvoda izaberite prema potvrdi knjigovođe. Aktivacija izdavanja i oznaka dostave podešavaju se na serveru.</p></> : null}</section>;
}
