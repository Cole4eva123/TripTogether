import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePlanInput, parseTripInput } from "./validate.ts";

const ok = { origin: " Champaign ", destination: "Chicago", startDate: "2026-11-27", endDate: "2026-11-30" };

test("trims and keeps only trip fields", () => {
  assert.deepEqual(parseTripInput({ ...ok, ownerId: "someone-else" }), { ...ok, origin: "Champaign" });
});

test("a one-day trip is fine", () => {
  assert.equal(typeof parseTripInput({ ...ok, endDate: ok.startDate }), "object");
});

test("rejects bad input with a message", () => {
  for (const bad of [
    { ...ok, origin: "  " },
    { ...ok, destination: 42 },
    { ...ok, startDate: "2026-02-31" },
    { ...ok, endDate: "11/30/2026" },
    { ...ok, endDate: "2026-11-26" },
  ]) {
    assert.equal(typeof parseTripInput(bad), "string", JSON.stringify(bad));
  }
});

test("rejects trips longer than 60 days", () => {
  assert.equal(typeof parseTripInput({ ...ok, startDate: "2026-01-01", endDate: "2026-03-01" }), "object"); // 60 days
  assert.equal(typeof parseTripInput({ ...ok, startDate: "2026-01-01", endDate: "2026-03-02" }), "string"); // 61
});

const span = { startDate: "2026-11-27", endDate: "2026-11-30" };
const plan = { date: "2026-11-28", time: "14:30", title: " Art Institute ", place: "", note: "" };

test("plan input: trims, defaults empty time to null, drops unknown fields", () => {
  assert.deepEqual(parsePlanInput({ ...plan, addedBy: "x" }, span), { ...plan, title: "Art Institute" });
  assert.deepEqual(parsePlanInput({ ...plan, time: "" }, span), { ...plan, title: "Art Institute", time: null });
});

test("plan input: rejects bad input with a message", () => {
  for (const bad of [
    { ...plan, title: " " },
    { ...plan, date: "2026-12-01" },
    { ...plan, date: "2026-11-26" },
    { ...plan, time: "24:00" },
    { ...plan, time: "2pm" },
    { ...plan, note: "x".repeat(1001) },
  ]) {
    assert.equal(typeof parsePlanInput(bad, span), "string", JSON.stringify(bad));
  }
});
