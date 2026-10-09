"use client";
import { useEffect, useState } from "react";
import type { Requester } from "./workspace-shared";
type Readiness = { payment: { missing: string[] }; fiscalization: { missing: string[] } };
export function CommerceReadinessPanel({ request }: { request: Requester }) {
  const [data, setData] = useState<Readiness | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    request<Readiness>("/api/admin/commerce-readiness").then(value => { if (active) setData(value); }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Provera nije učitana."); });
    return () => { active = false; };
  }, [request]);
  return <details className="admin-panel work-advanced"><summary>Naplata i fiskalizacija · šta još treba povezati</summary><p>Gotovina je dostupna. Online kartice i automatska mesečna kartična naplata čekaju povezivanje banke. Podešena konfiguracija sama ne potvrđuje da je integracija testirana.</p>{error ? <p role="alert">{error}</p> : null}{data ? <div className="admin-grid-2"><section><h3>Kartično plaćanje</h3><ul>{data.payment.missing.map(item => <li key={item}>{item}</li>)}</ul></section><section><h3>Fiskalni računi</h3><ul>{data.fiscalization.missing.map(item => <li key={item}>{item}</li>)}</ul></section></div> : null}</details>;
}
