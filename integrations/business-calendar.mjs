export const BUSINESS_TIMEZONE = "Europe/Belgrade";

export function addCalendarDays(date, days) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function calendarDaysBetween(from, to) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

export function businessLocalDate(instant = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function timezoneOffsetMs(instant) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - instant.getTime();
}

export function businessLocalDateTimeToUtc(date, localTime = "08:00") {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  guess = new Date(guess.getTime() - timezoneOffsetMs(guess));
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - timezoneOffsetMs(guess));
}

export function occurrenceDates(firstDate, cadence) {
  const month = firstDate.slice(0, 7);
  const dates = [];
  for (let cursor = firstDate; cursor.startsWith(month); cursor = addCalendarDays(cursor, cadence === "weekly" ? 7 : 14)) dates.push(cursor);
  return dates;
}

export function isBeforeCutoff(cutoffAt, now = new Date()) {
  return now.getTime() < Date.parse(cutoffAt);
}
