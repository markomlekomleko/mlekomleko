"use client";
import { useEffect, useState } from "react";
import { formatDate, formatDateTime } from "../lib/frontend";
import { plusDays, today, type Requester } from "./workspace-shared";
type Day = {
  date: string;
  status: string;
  cutoffAt: string;
  customers: number;
  stops: number;
  packages: number;
};
export function DeliveryCalendar({
  request,
  selected,
  onSelect,
  version,
}: {
  request: Requester;
  selected: string;
  onSelect: (date: string) => void;
  version: number;
}) {
  const [from, setFrom] = useState(today);
  const [result, setResult] = useState<{ from: string; days: Day[] } | null>(
    null,
  );
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    request<{ from: string; days: Day[] }>(
      `/api/admin/delivery-calendar?from=${from}&to=${plusDays(from, 27)}`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted) {
          setResult(value);
          setError("");
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, [request, from, version]);
  return (
    <details className="admin-panel" open>
      <summary>
        <strong>Kalendar narednih dostava</strong>
      </summary>
      <p className="work-hint">
        Stvarne jednokratne porudžbine i projekcija pretplata prema ritmu,
        pauzama i preskakanjima. Otvoreni termini mogu da se promene do roka.
      </p>
      <div className="button-row">
        <button
          className="button secondary small"
          disabled={from <= today()}
          onClick={() =>
            setFrom((value) => {
              const previous = plusDays(value, -28);
              return previous < today() ? today() : previous;
            })
          }
        >
          Prethodne 4 nedelje
        </button>
        <span>
          {formatDate(from)} – {formatDate(plusDays(from, 27))}
        </span>
        <button
          className="button secondary small"
          onClick={() => setFrom((value) => plusDays(value, 28))}
        >
          Naredne 4 nedelje
        </button>
      </div>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : !result || result.from !== from ? (
        <p role="status">Učitavamo kalendar…</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
            gap: "0.75rem",
            marginTop: "1rem",
          }}
        >
          {result.days.map((day) => (
            <button
              className={`button ${selected === day.date ? "" : "secondary"}`}
              style={{
                display: "grid",
                textAlign: "left",
                whiteSpace: "normal",
                gap: ".25rem",
              }}
              aria-pressed={selected === day.date}
              key={day.date}
              onClick={() => onSelect(day.date)}
            >
              <strong>{formatDate(day.date)}</strong>
              <span>
                {day.customers} kupaca · {day.packages} pakovanja
              </span>
              <small>
                {day.status === "open"
                  ? `Izmene do ${formatDateTime(day.cutoffAt)}`
                  : day.status === "completed"
                    ? "Završeno"
                    : "Zaključano"}
              </small>
            </button>
          ))}
        </div>
      )}
    </details>
  );
}
