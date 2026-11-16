import assert from "node:assert/strict";
import { test } from "node:test";
import {
  distanceKm,
  matchLabel,
  overlapDays,
  parsePlaceName,
  POSSIBLE_MATCH,
  resolvePlace,
  samePlace,
  similarity,
} from "./matching.ts";
import type { LobbyPost } from "./types.ts";

const post = (over: Partial<LobbyPost> = {}): LobbyPost => ({
  id: over.id ?? "p1",
  tripId: over.tripId ?? "t1",
  origin: over.origin ?? "Champaign, IL",
  destination: over.destination ?? "Chicago",
  startDate: over.startDate ?? "2026-11-27",
  endDate: over.endDate ?? "2026-11-30",
  memberCount: over.memberCount ?? 2,
  note: over.note ?? "",
  publishedAt: over.publishedAt ?? "2026-11-01T00:00:00.000Z",
});

test("a place name is split into the place and the region under it", () => {
  assert.deepEqual(parsePlaceName("Chicago, IL"), { name: "chicago", qualifier: "il" });
  assert.deepEqual(parsePlaceName("  CHICAGO  "), { name: "chicago", qualifier: null });
  assert.deepEqual(parsePlaceName("Paris, France"), { name: "paris", qualifier: "france" });
  assert.deepEqual(parsePlaceName("St. Louis, MO"), { name: "st louis", qualifier: "mo" });
});

test("a place is looked up in the gazetteer, not in a hand-written table", () => {
  const chicago = resolvePlace("Chicago");
  assert.ok(chicago, "Chicago is in the gazetteer");
  assert.equal(chicago!.country, "US");
  assert.equal(chicago!.region, "Illinois");
  assert.equal(resolvePlace("Chicago, IL")!.id, chicago!.id, "the state code points at the same city");
  assert.equal(resolvePlace("Chicago, Illinois")!.id, chicago!.id, "and so does the state name");
});

test("places outside North America are found too", () => {
  // The hand-written table only knew about US states and Canadian provinces.
  const beijing = resolvePlace("北京");
  assert.ok(beijing, "a Chinese place is in the gazetteer");
  assert.equal(beijing!.country, "CN");
  assert.equal(resolvePlace("Beijing")!.id, beijing!.id, "the Chinese name and the English one are one place");
  assert.equal(resolvePlace("Kyoto")!.country, "JP");
  assert.equal(resolvePlace("Paris, France")!.country, "FR");
});

test("the same place is the same place, whatever language it is written in", () => {
  assert.equal(samePlace("北京", "Beijing"), true);
  assert.equal(samePlace("北京市", "北京"), true);
  assert.equal(samePlace("Tokyo", "Tokyo, Japan"), true);
  assert.equal(samePlace("Rome", "Rome, Italy"), true);
});

test("the same city name in two states is two different places", () => {
  assert.equal(samePlace("Springfield, IL", "Springfield, MA"), false);
  assert.equal(samePlace("Portland, OR", "Portland, ME"), false);
  assert.equal(samePlace("Paris, France", "Paris, Texas"), false);
  const a = post({ destination: "Springfield, IL" });
  const b = post({ id: "p2", tripId: "t2", destination: "Springfield, MA" });
  assert.ok(similarity(a, b).score < POSSIBLE_MATCH);
});

test("a bare name means the region it is famous for", () => {
  // "Springfield" on its own means Springfield, Illinois.
  assert.equal(samePlace("Springfield", "Springfield, IL"), true);
  assert.equal(samePlace("Springfield", "Springfield, Illinois"), true);
  // But not the one in Massachusetts.
  assert.equal(samePlace("Springfield", "Springfield, MA"), false);
  // "London" means London, England, not London, Ontario.
  assert.equal(samePlace("London", "London, England"), true);
  assert.equal(samePlace("London", "London, Ontario"), false);
});

test("places that only share a word are two different places", () => {
  assert.equal(samePlace("San Francisco", "San Diego"), false);
  assert.equal(samePlace("Chicago", "Nashville"), false);
  const a = post({ destination: "San Francisco" });
  const b = post({ id: "p2", tripId: "t2", destination: "San Diego" });
  assert.ok(similarity(a, b).score < POSSIBLE_MATCH);
});

test("two nearby places are close enough to travel together", () => {
  // Chicago and Evanston are two towns, but they are 20 km apart, so the groups can meet up.
  const chicago = resolvePlace("Chicago")!;
  const evanston = resolvePlace("Evanston")!;
  assert.ok(distanceKm(chicago, evanston) < 60, "they are close to each other");
  const a = post({ destination: "Chicago" });
  const b = post({ id: "p2", tripId: "t2", destination: "Evanston" });
  const { score, reasons } = similarity(a, b);
  assert.ok(score >= POSSIBLE_MATCH, `a nearby place is worth looking at, got ${score}`);
  assert.ok(reasons.some((reason) => reason.includes("km apart")), `the card says how far it is: ${reasons}`);
});

test("the distance between two places is the real one", () => {
  const chicago = resolvePlace("Chicago")!;
  const denver = resolvePlace("Denver")!;
  // Chicago to Denver is about 1475 km.
  const km = distanceKm(chicago, denver);
  assert.ok(km > 1400 && km < 1550, `expected about 1475 km, got ${km}`);
});

test("trips that share no days never match", () => {
  const a = post({ startDate: "2026-11-27", endDate: "2026-11-30" });
  const b = post({ startDate: "2027-03-14", endDate: "2027-03-20" });
  const { score, reasons, overlapDays: shared } = similarity(a, b);
  assert.equal(score, 0);
  assert.equal(shared, 0);
  assert.deepEqual(reasons, ["Your dates don't overlap"]);
});

test("counts the days two trips share, counting both ends", () => {
  const a = post({ startDate: "2026-11-27", endDate: "2026-11-30" });
  const b = post({ startDate: "2026-11-29", endDate: "2026-12-02" });
  assert.equal(overlapDays(a, b), 2);
});

test("the same destination and overlapping dates score high", () => {
  const a = post();
  const b = post({ id: "p2", tripId: "t2" });
  const { score, reasons } = similarity(a, b);
  assert.equal(score, 100);
  assert.ok(reasons.includes("Same destination: Chicago"));
  assert.ok(!reasons.some((r) => r.includes("in common")), "the days in common are shown on their own line, not as a reason");
  assert.ok(reasons.includes("Same starting point"));
  assert.ok(reasons.includes("Same number of travelers"));
});

test("a nickname matches the full name", () => {
  const a = post({ destination: "New York" });
  const b = post({ id: "p2", tripId: "t2", destination: "NYC" });
  const { score, reasons } = similarity(a, b);
  assert.ok(score >= POSSIBLE_MATCH, `the nickname finds the city, got ${score}`);
  assert.ok(reasons.some((r) => r.startsWith("Same destination")));
});

test("a different destination costs the destination points and keeps the score low", () => {
  const a = post({ destination: "Chicago" });
  const b = post({ id: "p2", tripId: "t2", destination: "Nashville" });
  const { score, reasons } = similarity(a, b);
  // 30 dates + 10 origin + 10 same group size, then held under the line that says "worth looking at".
  assert.equal(score, 30);
  assert.ok(reasons.includes("Different destination"));
});

test("trips to different places stay under the line that says 'worth looking at'", () => {
  const a = post({ destination: "Chicago", origin: "Chicago" });
  const b = post({ id: "p2", tripId: "t2", destination: "Nashville", origin: "Chicago" });
  const { score } = similarity(a, b);
  // You can't travel to two cities at once, however well the dates and the size line up.
  assert.ok(score < POSSIBLE_MATCH, `expected under ${POSSIBLE_MATCH}, got ${score}`);
});

test("group size costs a little for each traveler of difference", () => {
  const a = post({ memberCount: 2 });
  const b = post({ id: "p2", tripId: "t2", memberCount: 3 });
  const { score } = similarity(a, b);
  assert.equal(score, 97); // 50 destination + 30 dates + 10 origin + 7 size
});

test("the label follows the score bands", () => {
  assert.equal(matchLabel(100), "Great match");
  assert.equal(matchLabel(60), "Great match");
  assert.equal(matchLabel(59), "Possible match");
  assert.equal(matchLabel(40), "Possible match");
  assert.equal(matchLabel(39), "Far off");
});

test("the days in common scale the score", () => {
  const a = post({ startDate: "2026-11-27", endDate: "2026-11-30" });
  const full = post({ id: "p2", tripId: "t2" });
  const half = post({
    id: "p2",
    tripId: "t2",
    startDate: "2026-11-29",
    endDate: "2026-12-01",
  });
  const { score: fullScore } = similarity(a, full);
  const { score: halfScore } = similarity(a, half);
  assert.ok(fullScore > halfScore);
  assert.equal(fullScore, 100);
  assert.equal(halfScore, 90); // 50 destination + 15 half the dates + 15 origin + 10 size
});

test("a trip of one day still overlaps itself", () => {
  const a = post({ startDate: "2026-11-27", endDate: "2026-11-27" });
  const b = post({ id: "p2", tripId: "t2", startDate: "2026-11-27", endDate: "2026-11-27" });
  assert.equal(overlapDays(a, b), 1);
  assert.equal(similarity(a, b).score, 100);
});

test("touching at the edges counts as one shared day", () => {
  const a = post({ startDate: "2026-11-27", endDate: "2026-11-28" });
  const b = post({ id: "p2", tripId: "t2", startDate: "2026-11-28", endDate: "2026-11-29" });
  assert.equal(overlapDays(a, b), 1);
});

test("a place the gazetteer doesn't know is still compared as text", () => {
  // A campsite or a landmark is not in the gazetteer, but two groups going to the same one still match.
  assert.equal(resolvePlace("Zzyzx Quicksilver Mine"), null);
  const a = post({ destination: "Zzyzx Quicksilver Mine" });
  const b = post({ id: "p2", tripId: "t2", destination: "zzyzx quicksilver mine" });
  assert.equal(similarity(a, b).score, 100);
});
