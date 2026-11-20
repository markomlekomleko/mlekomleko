"use client";
import { useEffect, useState } from "react";
type Row = Record<string, unknown>;
const kinds: Record<string, string> = {
  mlekomat_space: "Ima prostor za mlekomat",
  mlekomat_rent: "Želi svoj mlekomat",
  goat_waitlist: "Kozje mleko — obavesti me",
};
/** Requests from the public site's forms, stored even when email is not configured. */
export function LeadsPanel({ request }: { request: <T>(url: string, init?: RequestInit) => Promise<T> }) {
  const [leads, setLeads] = useState<Row[]>([]);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    void request<{ leads: Row[] }>("/api/admin/leads").then((x) => { if (active) setLeads(x.leads); }).catch((e) => { if (active) setNotice(e.message); });
    return () => { active = false; };
  }, [request]);
  const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));
  return (
    <details>
      <summary>Prijave sa sajta: mlekomati i kozje mleko ({leads.length})</summary>
      <p>Upiti iz formi na stranici Mlekomati i prijave za obaveštenje o kozjem mleku. Kopija stiže i na poslovni email kada je slanje podešeno.</p>
      {notice ? <p role="status">{notice}</p> : null}
      <div className="table-scroll"><table><thead><tr><th>Datum</th><th>Vrsta</th><th>Kontakt</th><th>Grad / adresa</th><th>Opis</th></tr></thead><tbody>
        {leads.map((lead) => (
          <tr key={text(lead.id)}>
            <td>{text(lead.created_at).slice(0, 16).replace("T", " ")}</td>
            <td>{kinds[text(lead.kind)] ?? text(lead.kind)}</td>
            <td>{[lead.name, lead.phone, lead.email].map(text).filter(Boolean).join(" · ")}</td>
            <td>{[lead.city, lead.address].map(text).filter(Boolean).join(", ")}</td>
            <td>{text(lead.details)}</td>
          </tr>
        ))}
      </tbody></table></div>
    </details>
  );
}
