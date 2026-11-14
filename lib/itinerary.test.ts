import assert from "node:assert/strict";
import { test } from "node:test";
import { planDays } from "./itinerary.ts";
import type { PlanItem } from "./types.ts";

const item = (date: string, time: string | null, title: string): PlanItem => ({
  id: title,
  date,
  time,
  title,
  place: "",
  note: "",
  addedBy: "Maya",
});
const trip = { startDate: "2026-11-30", endDate: "2026-12-02" }; // crosses a month end

test("lists every trip day, numbered, even with no plans", () => {
  assert.deepEqual(
    planDays(trip, []).map((d) => [d.date, d.n]),
    [
      ["2026-11-30", 1],
      ["2026-12-01", 2],
      ["2026-12-02", 3],
    ],
  );
});

test("sorts a day's plans: any-time first, then by time", () => {
  const day = planDays(trip, [
    item("2026-12-01", "14:00", "b"),
    item("2026-12-01", null, "a"),
    item("2026-12-01", "09:30", "c"),
  ])[1];
  assert.deepEqual(
    day.items.map((i) => i.title),
    ["a", "c", "b"],
  );
});

test("keeps plans left outside the trip dates, unnumbered, in date order", () => {
  const days = planDays(trip, [item("2026-12-05", null, "late"), item("2026-11-01", null, "early")]);
  assert.deepEqual(
    days.map((d) => [d.date, d.n]),
    [
      ["2026-11-01", null],
      ["2026-11-30", 1],
      ["2026-12-01", 2],
      ["2026-12-02", 3],
      ["2026-12-05", null],
    ],
  );
});
