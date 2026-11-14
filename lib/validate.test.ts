import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTripInput } from "./validate.ts";

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
