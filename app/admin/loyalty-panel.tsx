"use client";
import { useEffect, useState } from "react";
import { formatDate, formatMoney } from "../lib/frontend";
import { Empty, num, plural, rows, str, type Requester, type Row } from "./workspace-shared";

const rewardStatus: Record<string, string> = {
  unlocked: "Otključana",
  claimed: "Preuzeta",
  applied: "Primenjena",
  used: "Iskorišćena",
};

/** Program vernosti: realized deliveries toward 12 and each customer's rewards (read-only). */
export function LoyaltyPanel({ request, version }: { request: Requester; version: number }) {
  const [data, setData] = useState<Row | null>(null), [error, setError] = useState(""), [search, setSearch] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    request<Row>("/api/admin/loyalty", { signal: controller.signal })
      .then(value => { setData(value); setError(""); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [request, version]);
  const target = num(data?.target) || 12;
  const customers = rows(data?.customers).filter(customer => !search || [customer.fullName, customer.email, customer.phone].map(value => str(value).toLowerCase()).join(" ").includes(search.toLowerCase()));
  const rewardCount = rows(data?.customers).reduce((sum, customer) => sum + rows(customer.rewards).length, 0);
  return <section className="admin-panel">
    <div className="panel-heading"><div><h2>Program vernosti</h2><p>{`Posle ${target} realizovanih dostava kupac dobija ${num(data?.giftQuantity) || 2} L mleka i ${formatMoney((num(data?.deliveryDiscountMinor) || 35000) / 100)} popusta na dostavu. Računaju se samo potvrđene (isporučene) dostave pretplate od početka programa.`}</p></div>{data ? <span className="work-badge">{plural(rewardCount, "nagrada", "nagrade", "nagrada")}</span> : null}</div>
    {data ? <p><strong>Početak programa:</strong> {formatDate(str(data.startDate))} <small>(podešavanje „loyaltyStartDate“, samo za čitanje)</small></p> : null}
    {error ? <p role="alert" className="notice error">{error}</p> : null}
    {!data && !error ? <p role="status">Učitavamo program vernosti…</p> : null}
    {data ? <>
      <label className="field"><span>Pretraži kupce</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Ime, email ili telefon" /></label>
      {customers.length ? <div className="table-scroll"><table><thead><tr><th>Kupac</th><th>Dostave u krugu</th><th>Ukupno od početka</th><th>Nagrade</th><th>Kredit za dostavu</th></tr></thead><tbody>
        {customers.map(customer => <tr key={str(customer.id)}>
          <td data-label="Kupac"><strong>{str(customer.fullName, "Kupac")}</strong><br /><small>{[customer.phone, customer.email].map(value => str(value)).filter(value => value && !value.endsWith("@manual.invalid")).join(" · ")}</small></td>
          <td data-label="Dostave u krugu"><strong>{`${num(customer.progress)} / ${target}`}</strong><br /><progress aria-label={`${str(customer.fullName, "Kupac")}: ${num(customer.progress)} od ${target} dostava`} max={target} value={num(customer.progress)} />{num(customer.progress) >= target ? <><br /><small>Nagrada se otključava pri sledećoj potvrdi dostave ili otvaranju naloga.</small></> : null}</td>
          <td data-label="Ukupno od početka">{plural(num(customer.realizedSinceStart), "dostava", "dostave", "dostava")}</td>
          <td data-label="Nagrade">{rows(customer.rewards).length ? <ul className="list-clean">{rows(customer.rewards).map(reward => <li key={str(reward.id)}>
            <span className="work-badge">{rewardStatus[str(reward.status)] ?? str(reward.status)}</span>{` Krug ${num(reward.cycle)} · ${num(reward.giftQuantity)} L ${str(reward.giftProductName)}`}
            <br /><small>{reward.usedAt ? `Iskorišćena ${formatDate(str(reward.usedAt))}` : reward.appliedAt ? `Primenjena ${formatDate(str(reward.appliedAt))}` : reward.claimedAt ? `Preuzeta ${formatDate(str(reward.claimedAt))}` : `Otključana ${formatDate(str(reward.unlockedAt))}`}{reward.discountStatus === "credited" ? " · popust na dostavu prebačen u kredit" : reward.discountStatus === "deducted" ? " · popust na dostavu odbijen u porudžbini" : ""}</small>
          </li>)}</ul> : <small>Još nema nagrada</small>}</td>
          <td data-label="Kredit za dostavu">{num(customer.openDeliveryCreditMinor) > 0 ? <><strong>{formatMoney(num(customer.openDeliveryCreditMinor) / 100)}</strong><br /><small>Odbija se od sledećeg paketa</small></> : "—"}</td>
        </tr>)}
      </tbody></table></div> : <Empty title={search ? "Nema kupaca za ovu pretragu" : "Još nema pretplatnika u programu"} />}
    </> : null}
  </section>;
}
