// The days a trip covers and the days two trips share. Everything else in the app is built on these, so
// they are checked on their own.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, hasEnded, sharedWindow, today, tripLength } from "./dates.ts";

test("a trip counts both ends", () => {
  assert.equal(tripLength("2026-11-27", "2026-11-30"), 4);
  assert.equal(tripLength("2026-11-27", "2026-11-27"), 1);
  assert.equal(tripLength("2026-11-27", "2026-12-01"), 5);
});

test("counting days doesn't drift across a month or a year", () => {
  // A month has 30 or 31 days and February has 28 or 29, so a trip that runs over a boundary still counts
  // the right number of days.
  assert.equal(tripLength("2026-11-27", "2026-12-01"), 5);
  assert.equal(tripLength("2026-01-30", "2026-02-02"), 4);
  assert.equal(tripLength("2028-02-26", "2028-03-01"), 5); // a leap year
  assert.equal(tripLength("2026-02-26", "2026-03-01"), 4);
});

test("adding days crosses a month and a year", () => {
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
});

test("two trips share the days they overlap, not the days in between", () => {
  const window = sharedWindow(
    { startDate: "2026-11-27", endDate: "2026-11-30" },
    { startDate: "2026-11-29", endDate: "2026-12-02" },
  );
  assert.ok(window);
  assert.equal(window!.startDate, "2026-11-29");
  assert.equal(window!.endDate, "2026-11-30");
  assert.equal(window!.days, 2);
});

test("trips that touch at the edge share one day", () => {
  const window = sharedWindow(
    { startDate: "2026-11-27", endDate: "2026-11-28" },
    { startDate: "2026-11-28", endDate: "2026-11-29" },
  );
  assert.equal(window?.days, 1);
});

test("trips that don't touch share nothing", () => {
  const window = sharedWindow(
    { startDate: "2026-11-27", endDate: "2026-11-28" },
    { startDate: "2026-12-01", endDate: "2026-12-02" },
  );
  assert.equal(window, null);
});

test("a trip is over once its last day has passed", () => {
  assert.equal(hasEnded("2026-11-27", "2026-11-28"), true);
  assert.equal(hasEnded("2026-11-28", "2026-11-28"), false, "the last day is still the trip");
  assert.equal(hasEnded("2026-11-29", "2026-11-28"), false);
});

test("today is a plain date", () => {
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
});
