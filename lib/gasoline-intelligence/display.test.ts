import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDistance, getStationDistances, resultValidity } from "./display.ts";

const first = { id: "first", routeMiles: 60, detourMiles: 4 };
const second = { id: "second", routeMiles: 150, detourMiles: 6 };

test("distance units convert miles to kilometers without changing the stored distance", () => {
  assert.equal(formatDistance(100, "mi"), "100.0 mi");
  assert.equal(formatDistance(100, "km"), "160.9 km");
  assert.equal(formatDistance(1, "km", 3), "1.609 km");
  assert.equal(formatDistance(0, "km"), "0.0 km");
});

test("planned station distances use verified road legs and the full route through all stops", () => {
  const plan = { route: { miles: 315 }, stops: [
    { station: first, number: 1, milesFromStart: 65, legMiles: 65 },
    { station: second, number: 2, milesFromStart: 162, legMiles: 97 },
  ] };
  assert.deepEqual(getStationDistances(second, 300, [first, second], plan), {
    fromStart: 162, fromPrevious: 97, toDestination: 153, previousLabel: "stop 1", estimated: false,
  });
  assert.equal(getStationDistances(first, 300, [first, second], plan).previousLabel, "start");
});

test("candidate and pending-selection distances include detours and follow the previous selected stop", () => {
  const candidate = { id: "candidate", routeMiles: 100, detourMiles: 2 };
  assert.deepEqual(getStationDistances(candidate, 300, [second, first], null), {
    fromStart: 105, fromPrevious: 43, toDestination: 207, previousLabel: "stop 1", estimated: true,
  });
  assert.deepEqual(getStationDistances(second, 300, [first, second], null), {
    fromStart: 157, fromPrevious: 95, toDestination: 153, previousLabel: "stop 1", estimated: true,
  });
  const early = getStationDistances({ ...candidate, routeMiles: 20 }, 300, [first, second], null);
  assert.equal(early.previousLabel, "start");
  assert.equal(early.fromPrevious, 21);
});

test("search validity counts down to zero and stays expired", () => {
  const expiresAt = "2026-11-20T12:30:00Z", expiry = Date.parse(expiresAt);
  assert.equal(resultValidity(expiresAt, expiry - 1800000), "Results expire in 30:00");
  assert.equal(resultValidity(expiresAt, expiry - 60100), "Results expire in 1:01");
  assert.equal(resultValidity(expiresAt, expiry), "Results expired · Search again");
  assert.equal(resultValidity(expiresAt, expiry + 60000), "Results expired · Search again");
});
