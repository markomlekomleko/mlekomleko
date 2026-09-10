import { assertDomain, DomainError } from "./domain";
import { addCalendarDays, businessLocalDate, businessLocalDateTimeToUtc, calendarDaysBetween, isBeforeCutoff, occurrenceDates } from "../integrations/business-calendar.mjs";

export const BUSINESS_TIMEZONE = "Europe/Belgrade";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertLocalDate(value: unknown, field = "deliveryDate"): string {
  assertDomain(typeof value === "string" && DATE_RE.test(value), "VALIDATION_ERROR", `${field} must be YYYY-MM-DD in Europe/Belgrade.`, 422, { field });
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  assertDomain(parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day, "VALIDATION_ERROR", `${field} is not a valid date.`, 422, { field });
  return value;
}

export function addLocalDays(date: string, days: number): string {
  assertLocalDate(date);
  return addCalendarDays(date, days);
}

export function daysBetween(from: string, to: string): number {
  assertLocalDate(from);
  assertLocalDate(to);
  return calendarDaysBetween(from, to);
}

export function isCadenceDue(anchor: string, date: string, cadence: "weekly" | "biweekly"): boolean {
  const difference = daysBetween(anchor, date);
  return difference >= 0 && difference % (cadence === "weekly" ? 7 : 14) === 0;
}

export function nextWeekday(from = new Date(), weekday = 5): string {
  const current = localDateAt(from);
  const noon = new Date(`${current}T12:00:00Z`);
  const delta = (weekday - noon.getUTCDay() + 7) % 7;
  return addLocalDays(current, delta === 0 ? 7 : delta);
}

export function localDateAt(instant = new Date()): string {
  return businessLocalDate(instant);
}

export function localDateTimeToUtc(date: string, localTime = "08:00"): Date {
  assertLocalDate(date);
  assertDomain(/^\d{2}:\d{2}$/.test(localTime), "INVALID_SETTING", "deliveryLocalTime must be HH:mm.", 500);
  return businessLocalDateTimeToUtc(date, localTime);
}

export function cutoffForDelivery(date: string, cutoffHours: number, localTime = "08:00"): string {
  assertDomain(Number.isSafeInteger(cutoffHours) && cutoffHours >= 0 && cutoffHours <= 168, "INVALID_SETTING", "cutoffHours must be an integer from 0 to 168.", 500);
  return new Date(localDateTimeToUtc(date, localTime).getTime() - cutoffHours * 3_600_000).toISOString();
}

export function assertBeforeCutoff(cutoffAt: string, lockedAt?: string | null, now = new Date()): void {
  if (lockedAt || !isBeforeCutoff(cutoffAt, now)) {
    throw new DomainError("DELIVERY_LOCKED", "This delivery is past its change deadline and can no longer be modified.", 409, { cutoffAt });
  }
}

export function remainingOccurrencesInMonth(firstDate: string, cadence: "weekly" | "biweekly"): number {
  return occurrenceDatesInMonth(firstDate, cadence).length;
}

export function occurrenceDatesInMonth(firstDate: string, cadence: "weekly" | "biweekly"): string[] {
  assertLocalDate(firstDate);
  return occurrenceDates(firstDate, cadence);
}
