import assert from "node:assert/strict";
import test from "node:test";
import { addCalendarDays, businessLocalDate, businessLocalDateTimeToUtc, calendarDaysBetween, isBeforeCutoff, occurrenceDates } from "../integrations/business-calendar.mjs";

test("weekly and biweekly schedules use the exact remaining dates", () => {
  assert.deepEqual(occurrenceDates("2027-01-01", "weekly"), ["2027-01-01", "2027-01-08", "2027-01-15", "2027-01-22", "2027-01-29"]);
  assert.deepEqual(occurrenceDates("2027-01-08", "weekly"), ["2027-01-08", "2027-01-15", "2027-01-22", "2027-01-29"]);
  assert.deepEqual(occurrenceDates("2027-01-01", "biweekly"), ["2027-01-01", "2027-01-15", "2027-01-29"]);
  assert.deepEqual(occurrenceDates("2027-01-08", "biweekly"), ["2027-01-08", "2027-01-22"]);
});

test("calendar arithmetic crosses months without DST drift", () => {
  assert.equal(addCalendarDays("2027-03-26", 7), "2027-04-02");
  assert.equal(addCalendarDays("2027-10-29", 7), "2027-11-05");
  assert.equal(calendarDaysBetween("2027-03-26", "2027-04-02"), 7);
});

test("Belgrade business time handles midnight and both DST offsets", () => {
  assert.equal(businessLocalDate(new Date("2027-01-01T23:30:00.000Z")), "2027-01-02");
  assert.equal(businessLocalDateTimeToUtc("2027-03-26", "08:00").toISOString(), "2027-03-26T07:00:00.000Z");
  assert.equal(businessLocalDateTimeToUtc("2027-04-02", "08:00").toISOString(), "2027-04-02T06:00:00.000Z");
  assert.equal(businessLocalDateTimeToUtc("2027-10-29", "08:00").toISOString(), "2027-10-29T06:00:00.000Z");
  assert.equal(businessLocalDateTimeToUtc("2027-11-05", "08:00").toISOString(), "2027-11-05T07:00:00.000Z");
});

test("cutoff comparison is open before and locked exactly at or after the instant", () => {
  const cutoff = "2027-01-07T07:00:00.000Z";
  assert.equal(isBeforeCutoff(cutoff, new Date("2027-01-07T06:59:59.999Z")), true);
  assert.equal(isBeforeCutoff(cutoff, new Date(cutoff)), false);
  assert.equal(isBeforeCutoff(cutoff, new Date("2027-01-07T07:00:00.001Z")), false);
});
