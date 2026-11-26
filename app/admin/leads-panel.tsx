"use client";
import { useEffect, useState } from "react";
type Row = Record<string, unknown>;
const kinds: Record<string, string> = {
  mlekomat_space: "Ima prostor za mlekomat",
  mlekomat_rent: "Želi svoj mlekomat",
  goat_waitlist: "Kozje mleko — obavesti me",
  chat_support: "Chat podrška",
};
/** Stored UTC timestamps ("2026-11-20 10:00:00") shown in Serbian local time. */
function localTime(value: string) {
  const instant = new Date(/[zZ]$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(instant.getTime()) ? value : new Intl.DateTimeFormat("sr-Latn-RS", { timeZone: "Europe/Belgrade", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(instant);
}
/** Requests from the public site's forms, stored even when email is not configured. New ones first. */
export function LeadsPanel({ request }: { request: <T>(url: string, init?: RequestInit) => Promise<T> }) {
  const [leads, setLeads] = useState<Row[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void request<{ leads: Row[] }>("/api/admin/leads").then((x) => { if (active) setLeads(x.leads); }).catch((e) => { if (active) setNotice(e.message); });
    return () => { active = false; };
  }, [request, revision]);
  const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));
  const fresh = leads.filter((lead) => lead.status !== "handled").length;
  async function toggle(lead: Row) {
    const id = text(lead.id);
    setBusy(id);
    setNotice("");
    try {
      await request("/api/admin/leads", { method: "PATCH", body: JSON.stringify({ id, status: lead.status === "handled" ? "new" : "handled" }) });
      setRevision((value) => value + 1);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Status prijave nije sačuvan.");
    } finally {
      setBusy("");
    }
  }
  return (
    <details>
      <summary>Prijave sa sajta: chat podrška, mlekomati i kozje mleko ({fresh} {fresh === 1 ? "nova" : fresh % 10 >= 2 && fresh % 10 <= 4 && !(fresh % 100 >= 12 && fresh % 100 <= 14) ? "nove" : "novih"} · ukupno {leads.length})</summary>
      <p>Kontakti ostavljeni u chatu, upiti za mlekomate i prijave za obaveštenje o kozjem mleku. Upiti za mlekomate i kozje mleko stižu i na poslovni email kada je slanje podešeno. Nove prijave su na vrhu; kada se javite, označite ih kao obrađene.</p>
      {notice ? <p role="alert" className="notice error">{notice}</p> : null}
      <div className="table-scroll"><table><thead><tr><th>Datum</th><th>Vrsta</th><th>Kontakt</th><th>Grad / adresa</th><th>Opis</th><th>Obrađeno</th></tr></thead><tbody>
        {leads.map((lead) => (
          <tr key={text(lead.id)} className={lead.status === "handled" ? "is-muted" : undefined}>
            <td>{localTime(text(lead.created_at))}</td>
            <td>{kinds[text(lead.kind)] ?? text(lead.kind)}</td>
            <td>{[lead.name, lead.phone, lead.email].map(text).filter(Boolean).join(" · ")}</td>
            <td>{[lead.city, lead.address].map(text).filter(Boolean).join(", ")}</td>
            <td>{text(lead.details)}</td>
            <td>
              <label className="work-check">
                <input type="checkbox" checked={lead.status === "handled"} disabled={busy === text(lead.id)} onChange={() => void toggle(lead)} aria-label={`Obrađeno: ${[lead.name, lead.email, lead.phone].map(text).find(Boolean) ?? "prijava"}`} />
                {lead.status === "handled" ? " Obrađeno" : " Nova"}
              </label>
            </td>
          </tr>
        ))}
      </tbody></table></div>
    </details>
  );
}
