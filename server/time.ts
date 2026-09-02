import { assertDomain, DomainError } from "./domain";

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
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  assertLocalDate(from);
  assertLocalDate(to);
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
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
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function timezoneOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - instant.getTime();
}

export function localDateTimeToUtc(date: string, localTime = "08:00"): Date {
  assertLocalDate(date);
  assertDomain(/^\d{2}:\d{2}$/.test(localTime), "INVALID_SETTING", "deliveryLocalTime must be HH:mm.", 500);
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  guess = new Date(guess.getTime() - timezoneOffsetMs(guess));
  guess = new Date(Date.UTC(year, month - 1, day, hour, minute) - timezoneOffsetMs(guess));
  return guess;
}

export function cutoffForDelivery(date: string, cutoffHours: number, localTime = "08:00"): string {
  assertDomain(Number.isSafeInteger(cutoffHours) && cutoffHours >= 0 && cutoffHours <= 168, "INVALID_SETTING", "cutoffHours must be an integer from 0 to 168.", 500);
  return new Date(localDateTimeToUtc(date, localTime).getTime() - cutoffHours * 3_600_000).toISOString();
}

export function assertBeforeCutoff(cutoffAt: string, lockedAt?: string | null, now = new Date()): void {
  if (lockedAt || now.getTime() >= Date.parse(cutoffAt)) {
    throw new DomainError("DELIVERY_LOCKED", "This delivery is past its change deadline and can no longer be modified.", 409, { cutoffAt });
  }
}

export function remainingOccurrencesInMonth(firstDate: string, cadence: "weekly" | "biweekly"): number {
  assertLocalDate(firstDate);
  const month = firstDate.slice(0, 7);
  let count = 0;
  for (let cursor = firstDate; cursor.startsWith(month); cursor = addLocalDays(cursor, cadence === "weekly" ? 7 : 14)) count += 1;
  return count;
}
