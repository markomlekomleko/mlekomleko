"use client";

import { useLocalize, useLocale } from "@/app/lib/i18n/client";
import { useState } from "react";
import { fetchJson, formatDate, formatMoney } from "../lib/frontend";

export type LoyaltyReward = {
  id: string;
  cycle: number;
  status: "unlocked" | "claimed" | "applied" | "used";
  giftQuantity: number;
  giftProductName: string;
  deliveryDiscountMinor: number;
  discountStatus: string;
  deliveryDate: string | null;
  usedAt: string | null;
};
export type Loyalty = {
  target: number;
  progress: number;
  remaining: number;
  gift: { quantity: number; deliveryDiscountMinor: number };
  rewards: LoyaltyReward[];
  available: LoyaltyReward | null;
  /** Free-delivery credit from a handed-over reward, deducted from the next package charge. */
  openDeliveryCreditMinor?: number;
};

/** 2 L at the subscription price + one delivery: the reward's sale value (850 RSD). */
const GIFT_MILK_PRICE_MINOR = 25000;

function rewardStatus(status: LoyaltyReward["status"]) {
  return status === "used" ? "Iskorišćena" : status === "applied" ? "Primenjena" : "Dostupna";
}

/** Serbian plural chosen in the sentence itself, so each form has its own catalogue entry. */
function remainingLabel(count: number) {
  const last = count % 10, lastTwo = count % 100;
  if (count === 1) return "Još 1 dostava do poklona.";
  return last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? `Još ${count} dostave do poklona.` : `Još ${count} dostava do poklona.`;
}

export function LoyaltyCard({ loyalty, readOnly, onChange }: { loyalty: Loyalty; readOnly: boolean; onChange: (loyalty: Loyalty, notice: string) => void }) {
  const localize = useLocalize();
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const value = loyalty.gift.quantity * GIFT_MILK_PRICE_MINOR + loyalty.gift.deliveryDiscountMinor;
  const reward = loyalty.available;
  const credit = Number(loyalty.openDeliveryCreditMinor ?? 0);
  const history = loyalty.rewards.filter((item) => item.status === "applied" || item.status === "used");
  async function act(action: "claim" | "apply", rewardId: string) {
    setBusy(true);
    setError("");
    try {
      const result = await fetchJson<{ loyalty: Loyalty }>("/api/account/loyalty", { method: "POST", body: JSON.stringify({ action, rewardId }) });
      onChange(result.loyalty, action === "claim" ? "Nagrada je preuzeta. Klikni „Iskoristi“ i stiže uz sledeću dostavu." : `Nagrada je primenjena: ${loyalty.gift.quantity} L mleka stiže na poklon uz sledeću dostavu, a ${formatMoney(loyalty.gift.deliveryDiscountMinor / 100, locale)} za dostavu oduzimamo od sledećeg paketa.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nagrada trenutno nije dostupna. Pokušaj ponovo.");
    } finally {
      setBusy(false);
    }
  }
  return localize((
    <section className="card account-loyalty" id="vernost" aria-labelledby="loyalty-title">
      <div className="account-card-head">
        <h2 id="loyalty-title">Tvoja vernost se nagrađuje <span aria-hidden="true">💙</span></h2>
        <strong className="account-loyalty-counter" aria-label={`${loyalty.progress} od ${loyalty.target} realizovanih dostava`}>{`${loyalty.progress} / ${loyalty.target}`}</strong>
      </div>
      <ol className="account-loyalty-boxes" aria-label="Realizovane dostave u ovom krugu">
        {Array.from({ length: loyalty.target }, (_, index) => {
          const done = index < loyalty.progress;
          return (
            <li key={index} className={done ? "is-done" : undefined} aria-label={done ? `Dostava broj ${index + 1}: realizovana` : `Dostava broj ${index + 1}`}>
              <span aria-hidden="true">{done ? "✓" : index + 1}</span>
            </li>
          );
        })}
      </ol>
      <p className="account-loyalty-remaining">
        {loyalty.remaining > 0
          ? remainingLabel(loyalty.remaining)
          : "Krug je završen. Novi počinje sa sledećom dostavom."}
      </p>
      <p className="account-loyalty-gift">
        {`Posle 12 realizovanih dostava poklanjamo ti 2 L mleka i jednu dostavu: njenu cenu oduzimamo od sledećeg paketa (ukupna vrednost ${formatMoney(value / 100, locale)}).`}
      </p>
      <p className="small-text account-muted">Računaju se samo realizovane dostave. Preskočene i pauzirane ne ulaze u brojanje.</p>
      {reward ? (
        <div className="account-loyalty-reward" role="status">
          <div>
            <span className="account-status is-ready">{rewardStatus(reward.status)}</span>
            <strong>Tvoj poklon je spreman!</strong>
            <span>{`${reward.giftQuantity} L mleka + ${formatMoney(reward.deliveryDiscountMinor / 100, locale)} popusta na dostavu, koji oduzimamo od sledećeg paketa`}</span>
          </div>
          {reward.status === "unlocked" ? (
            <button className="button small" type="button" disabled={busy || readOnly} onClick={() => void act("claim", reward.id)}>Preuzmi nagradu</button>
          ) : (
            <button className="button small" type="button" disabled={busy || readOnly} onClick={() => void act("apply", reward.id)}>Iskoristi</button>
          )}
        </div>
      ) : null}
      {credit > 0 ? (
        <p className="account-loyalty-credit" role="status">
          <strong>{`Imaš ${formatMoney(credit / 100, locale)} popusta na dostavu — oduzimamo ga od sledećeg paketa.`}</strong>
        </p>
      ) : null}
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      {history.length ? (
        <ul className="list-clean account-loyalty-history">
          {history.map((item) => (
            <li key={item.id}>
              <span className={`account-status ${item.status === "used" ? "" : "is-ready"}`}>{rewardStatus(item.status)}</span>
              <span>
                {item.status === "used"
                  ? <>Poklon uručen: {formatDate(item.deliveryDate ?? item.usedAt ?? undefined, locale)}</>
                  : <>Stiže uz dostavu: {formatDate(item.deliveryDate ?? undefined, locale)} <br />Ako je preskočiš, poklon prelazi na sledeću.{item.discountStatus === "pending" ? <><br />{`Posle te dostave ${formatMoney(item.deliveryDiscountMinor / 100, locale)} za dostavu oduzimamo od sledećeg paketa.`}</> : null}</>}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="small-text account-muted">Nagrada se ne isplaćuje u novcu i koristi se jednom. Mleko iz tvog paketa ostaje plaćeno kao i do sada.</p>
    </section>
  ));
}
