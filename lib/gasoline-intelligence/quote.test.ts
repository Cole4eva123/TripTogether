import assert from "node:assert/strict";
import { test } from "node:test";
import { parseStationQuote } from "./quote.ts";

const now = Date.parse("2026-11-15T18:00:00Z");
const stations = [{ id: "station-one", address: "5695 Fox Creek Rd, Eureka, MO" }];
const sources = [{ title: "Station price report", url: "https://example.com/station-one" }];
const quote = { id: "station-one", address: stations[0].address, fuelGrade: "regular", pricePerGallon: 3.19, observedAt: "2026-11-15T12:00:00Z", sourceUrl: sources[0].url };

test("single-station prices preserve the matching address, grade, date and citation", () => {
  const result = parseStationQuote(quote, stations, "regular", sources, now);
  assert.equal(result?.id, "station-one");
  assert.equal(result?.price.perGallon, 3.19);
  assert.equal(result?.price.observedAt, quote.observedAt.replace("Z", ".000Z"));
  assert.deepEqual(result?.price.source, sources[0]);
});

test("regional, wrong-station, wrong-grade, uncited and stale values cannot become pump quotes", () => {
  for (const change of [
    { id: "MO" }, { address: "999 Other Rd, Eureka, MO" }, { fuelGrade: "premium" },
    { address: undefined }, { fuelGrade: undefined }, { sourceUrl: "https://example.com/state-average" },
    { sourceUrl: "javascript:alert(1)" }, { observedAt: undefined }, { observedAt: "2026-11-11T00:00:00Z" },
    { observedAt: "2026-11-17T00:00:00Z" }, { pricePerGallon: null }, { pricePerGallon: 0 },
  ]) assert.equal(parseStationQuote({ ...quote, ...change }, stations, "regular", sources, now), null);
});
