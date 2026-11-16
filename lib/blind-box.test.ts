import assert from "node:assert/strict";
import { test } from "node:test";
import { drawBlindBox, destinationKey, parseBlindBoxOption, parseBlindBoxSettings } from "./blind-box.ts";
import type { BlindBoxOption, BlindBoxSettings } from "./blind-box-types.ts";
import type { Trip } from "./types.ts";

const trip: Trip = { id: "blind-box-test", origin: "Urbana", destination: "Test city", startDate: "2026-11-27", endDate: "2026-11-30", inviteCode: "TEST22", ownerId: "owner", memberCount: 2 };
const settings: BlindBoxSettings = { destination: "Test city", date: "2026-11-28", startTime: "09:00", budget: 50, availableMinutes: 180, maxStops: 3, preferences: ["Food", "Outdoors"] };
const input = { title: "Secret picnic", place: "Test park", category: "Outdoors" as const, cost: 10, durationMinutes: 45, note: "Bring snacks" };
const option: BlindBoxOption = { ...input, id: "a", destination: "Test city", submittedBy: "member", addedBy: "Member" };

test("blind box settings validate dates, numbers, categories and the daily time window", () => {
  assert.deepEqual(parseBlindBoxSettings({ ...settings, destination: " Test city ", ownerId: "forged" }, trip), settings);
  for (const bad of [
    { date: "2026-02-31" }, { date: "2026-12-01" }, { startTime: "24:00" }, { startTime: "" },
    { budget: -1 }, { budget: 0.001 }, { budget: "50" }, { budget: Infinity }, { availableMinutes: 14 },
    { availableMinutes: 30.5 }, { maxStops: 6 }, { preferences: [] }, { preferences: ["Unknown"] }, { preferences: null },
    { startTime: "23:00", availableMinutes: 120 }, { destination: " " },
  ]) assert.equal(typeof parseBlindBoxSettings({ ...settings, ...bad }, trip), "string", JSON.stringify(bad));
  assert.equal(typeof parseBlindBoxSettings({ ...settings, budget: 0, startTime: "23:45", availableMinutes: 15 }, trip), "object");
});

test("hidden options drop forged identity and validate bounds", () => {
  assert.deepEqual(parseBlindBoxOption({ ...input, title: " Secret picnic ", submittedBy: "owner" }), input);
  for (const bad of [{ title: "" }, { place: "" }, { cost: -1 }, { cost: 1.999 }, { durationMinutes: 1 }, { durationMinutes: 45.5 }, { category: "Unknown" }, { note: "a".repeat(501) }]) {
    assert.equal(typeof parseBlindBoxOption({ ...input, ...bad }), "string");
  }
});

test("destination matching supports city regions and aliases without substring matches", () => {
  assert.equal(destinationKey(" Chicago, IL "), destinationKey("芝加哥"));
  assert.equal(destinationKey("NYC"), destinationKey("New York City"));
  assert.notEqual(destinationKey("West Chicago"), destinationKey("Chicago"));
});

test("draw obeys aggregate cost, time including buffers, preferences and destination", () => {
  const result = drawBlindBox({ ...settings, budget: 20, availableMinutes: 105 }, [
    option, { ...option, id: "b", title: "Second" }, { ...option, id: "c", title: "Third" },
    { ...option, id: "d", destination: "Other city" }, { ...option, id: "e", category: "Culture" },
    { ...option, id: "f", cost: 100 }, { ...option, id: "g", durationMinutes: 200 },
  ], (max) => max - 1)!;
  assert.deepEqual(result.stops.map((s) => [s.id, s.time]), [["a", "09:00"], ["b", "10:00"]]);
  assert.equal(result.totalCost, 20);
  assert.equal(result.totalMinutes, 105);
});

test("draw has no repeats, handles zero budget, exact decimal totals and empty matches", () => {
  const pool = [option, { ...option, id: "duplicate" }, { ...option, id: "c", title: "Other", cost: 0.2 }];
  const result = drawBlindBox({ ...settings, budget: 0.3 }, pool.map((o) => ({ ...o, cost: o.id === "c" ? 0.2 : 0.1 })), (max) => max - 1)!;
  assert.equal(result.stops.length, 2);
  assert.equal(result.totalCost, 0.3);
  assert.equal(drawBlindBox({ ...settings, budget: 0 }, [option]), null);
  assert.equal(drawBlindBox({ ...settings, budget: 0 }, [{ ...option, cost: 0 }])?.stops.length, 1);
  assert.equal(drawBlindBox(settings, []), null);
  assert.equal(drawBlindBox({ ...settings, maxStops: 1 }, pool)?.stops.length, 1);
});

test("different shuffle choices can select different mystery routes without mutating candidates", () => {
  const pool = [option, { ...option, id: "b", title: "Second" }];
  const config = { ...settings, maxStops: 1 };
  assert.notEqual(drawBlindBox(config, pool, () => 0)?.stops[0].id, drawBlindBox(config, pool, (max) => max - 1)?.stops[0].id);
  assert.deepEqual(pool.map((o) => o.id), ["a", "b"]);
});
