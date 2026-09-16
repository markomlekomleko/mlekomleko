"use client";
import { useEffect, useRef, type ReactNode } from "react";
export type Row = Record<string, unknown>;
export type Requester = <T>(url: string, init?: RequestInit) => Promise<T>;
export const str = (value: unknown, fallback = "") =>
  value == null ? fallback : String(value);
export const num = (value: unknown) => Number(value) || 0;
export const rows = (value: unknown): Row[] =>
  Array.isArray(value) ? value : [];
export const obj = (value: unknown): Row =>
  value && typeof value === "object" ? (value as Row) : {};
export const email = (value: unknown) =>
  str(value).endsWith("@manual.invalid") ? "" : str(value);
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const shortDate = (date: string) =>
  date
    ? new Intl.DateTimeFormat("sr-Latn-RS", {
        day: "numeric",
        month: "short",
        timeZone: "Europe/Belgrade",
      }).format(new Date(date.length === 10 ? `${date}T12:00:00Z` : date))
    : "—";
export const plusDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400000)
    .toISOString()
    .slice(0, 10);
export const actionLabel = (action: unknown) =>
  ({
    "order.created": "Nova porudžbina",
    "subscription.pause": "Pauzirana dostava",
    "subscription.resume": "Nastavljena dostava",
    "subscription.skip_next": "Preskočen termin",
    "subscription.cancel": "Otkazana pretplata",
    "subscription.update_item": "Promenjena količina",
    "customer.updated": "Promenjeni kontakt podaci",
  })[str(action)] || "Ažurirani podaci";
export function Dialog({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      className="work-dialog"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-label={title}
    >
      <div className="work-dialog-head">
        <h2>{title}</h2>
        <button
          className="work-icon-button"
          aria-label="Zatvori"
          onClick={onClose}
          disabled={busy}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="work-empty">
      <span aria-hidden="true">○</span>
      <h3>{title}</h3>
      {children}
    </div>
  );
}
