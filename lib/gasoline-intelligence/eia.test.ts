import assert from "node:assert/strict";
import { test } from "node:test";
import { eiaPriceUrl, EIA_STATE_AREAS, mergeStateReports, parseEiaStatePrices } from "./eia.ts";

const now = Date.parse("2026-11-15T18:00:00Z");
const row = { period: "2026-11-09", duoarea: "SCA", product: "EPMR", process: "PTE", series: "EMM_EPMR_PTE_SCA_DPG", value: "4.125", units: "$/GAL" };
const response = (...data: unknown[]) => ({ response: { frequency: "weekly", data } });

test("EIA queries are bounded to weekly retail prices, the selected product and exact state facets", () => {
  const url = new URL(eiaPriceUrl("example-test-key", "premium", now));
  assert.equal(url.origin, "https://api.eia.gov");
  assert.equal(url.pathname, "/v2/petroleum/pri/gnd/data/");
  assert.equal(url.searchParams.get("facets[product][0]"), "EPMP");
  assert.equal(url.searchParams.get("facets[process][0]"), "PTE");
  assert.equal(url.searchParams.get("frequency"), "weekly");
  assert.equal(url.searchParams.get("length"), "200");
  assert.equal(url.searchParams.get("start"), "2026-11-07");
  assert.deepEqual([...url.searchParams].filter(([key]) => key.startsWith("facets[duoarea]")).map(([, value]) => value), [...EIA_STATE_AREAS]);
});

test("EIA preserves the observed date, exact state and grade without leaking the API key in source links", () => {
  const report = parseEiaStatePrices(response(row), "regular", now)[0];
  assert.equal(report.state, "CA");
  assert.equal(report.average, 4.125);
  assert.equal(report.observedAt, "2026-11-09T00:00:00.000Z");
  assert.equal(report.kind, "regional report");
  assert.ok(report.source?.url.includes("EMM_EPMR_PTE_SCA_DPG"));
  assert.ok(!report.source?.url.includes("api_key"));
  assert.deepEqual(parseEiaStatePrices(response(row), "premium", now), []);
  const diesel = { ...row, product: "EPD2D", series: "EMD_EPD2D_PTE_SCA_DPG" };
  assert.equal(parseEiaStatePrices(response(diesel), "diesel", now).length, 1);
});

test("EIA rejects regions, cities, wrong units or products, impossible and stale observation dates", () => {
  for (const change of [
    { duoarea: "R20" }, { duoarea: "NUS" }, { duoarea: "YCH" }, { duoarea: "SIL" },
    { product: "EPM0" }, { process: "PWA" }, { units: "cents/GAL" }, { series: "EMM_EPMRU_PTE_SCA_DPG" },
    { period: "2026-11-02" }, { period: "2026-11-17" }, { period: "2026-02-31" }, { value: "" }, { value: "NaN" }, { value: "500" },
  ]) assert.deepEqual(parseEiaStatePrices(response({ ...row, ...change }), "regular", now), [], JSON.stringify(change));
  assert.deepEqual(parseEiaStatePrices({ response: { frequency: "monthly", data: [row] } }, "regular", now), []);
  assert.deepEqual(parseEiaStatePrices({ error: "invalid key", response: { frequency: "weekly", data: [row] } }, "regular", now), []);
});

test("newest EIA state observation wins and AAA only fills missing requested states", () => {
  const primary = parseEiaStatePrices(response(row, { ...row, period: "2026-11-10", value: "4.2" }), "regular", now);
  assert.equal(primary.length, 1);
  assert.equal(primary[0].average, 4.2);
  const fallback = [
    { ...primary[0], average: 5, source: { title: "AAA", url: "https://gasprices.aaa.com/state-gas-price-averages/" } },
    { ...primary[0], state: "IL", average: 3.5 }, { ...primary[0], state: "NY", average: 3.8 },
  ];
  const merged = mergeStateReports(primary, fallback, ["CA", "IL"]);
  assert.deepEqual(merged.map(report => [report.state, report.average]), [["CA", 4.2], ["IL", 3.5]]);
  assert.deepEqual(mergeStateReports([], fallback, []), []);
});
