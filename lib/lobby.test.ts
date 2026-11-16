import assert from "node:assert/strict";
import { test } from "node:test";
import { lobbyForTrip, matchesQuery } from "./lobby.ts";
import type { LobbyPostView } from "./types.ts";

function post(id: string, patch: Partial<LobbyPostView> = {}): LobbyPostView {
  return {
    id, tripId: id,
    origin: "Chicago", destination: "Denver", startDate: "2099-06-01", endDate: "2099-06-05",
    memberCount: 1, members: [{ id, name: id }], note: "", publishedAt: "2099-01-01T00:00:00Z",
    mine: false, organizedByMe: false, score: 0, reasons: [], datesClash: false, ended: false, basis: null, label: "",
    myRequest: null,
    ...patch,
  };
}

test("the reader's own posts are never listed as other groups", () => {
  const result = lobbyForTrip([post("own", { mine: true }), post("other")], "");
  assert.deepEqual(result.mine.map((item) => item.id), ["own"]);
  assert.deepEqual(result.others.map((item) => item.id), ["other"]);
});

test("groups that clash on dates are ordered last", () => {
  const clash = post("clash", { score: 90, datesClash: true });
  const together = post("together", { score: 40 });
  assert.deepEqual(lobbyForTrip([clash, together], "").others.map((item) => item.id), ["together", "clash"]);
});

test("groups are ordered by how close they are, then by the day they start", () => {
  const near = post("near", { score: 80, startDate: "2099-07-01" });
  const far = post("far", { score: 20 });
  const same = post("same", { score: 80, startDate: "2099-06-01" });
  assert.deepEqual(lobbyForTrip([near, far, same], "").others.map((item) => item.id), ["same", "near", "far"]);
});

test("searching keeps low scoring groups visible and excludes expired trips", () => {
  const result = lobbyForTrip([
    post("old", { endDate: "2000-01-02", startDate: "2000-01-01" }),
    post("found", { note: "Hiking the Rockies" }), post("unrelated", { destination: "Boston" }),
  ], "rockies");
  assert.deepEqual(result.others.map((item) => item.id), ["found"]);
  assert.ok(result.others[0].score < 40);
});

test("a trip that has been is still listed, but at the end", () => {
  const result = lobbyForTrip([post("old", { ended: true, score: 100 }), post("current", { score: 10 })], "");
  assert.deepEqual(result.others.map((item) => item.id), ["current", "old"]);
});

test("an expired trip is still listed, but at the end", () => {
  const result = lobbyForTrip([post("old", { mine: true, ended: true }), post("other")], "");
  assert.deepEqual(result.others.map((item) => item.id), ["other"]);
});

test("the card keeps the comparison the server made", () => {
  const basis = {
    tripId: "own", destination: "Chicago",
    startDate: "2099-06-01", endDate: "2099-06-05",
    overlapStart: "2099-06-01", overlapEnd: "2099-06-05", overlapDays: 5,
  };
  const other = post("other", { score: 75, basis, reasons: ["Same destination: Chicago", "5 days in common"] });
  const result = lobbyForTrip([other], "");
  assert.equal(result.others[0].basis, basis);
  assert.equal(result.others[0].basis?.overlapDays, 5);
  assert.deepEqual(result.others[0].reasons, ["Same destination: Chicago", "5 days in common"]);
});

test("a search finds the place, whatever language it is written in", () => {
  const beijing = post("beijing", { destination: "Beijing" });
  assert.equal(matchesQuery(beijing, "北京"), true);
  assert.equal(matchesQuery(beijing, "beijing"), true);
  assert.equal(matchesQuery(beijing, "China"), true, "the country answers as well");
  assert.equal(matchesQuery(beijing, "Tokyo"), false);
});

test("a search finds a place a short drive away", () => {
  const cambridge = post("cambridge", { destination: "Cambridge, Massachusetts" });
  assert.equal(matchesQuery(cambridge, "Boston"), true);
});

test("every word of the search has to be answered", () => {
  const group = post("search", { destination: "Denver", origin: "Chicago", note: "Hiking the Rockies" });
  assert.equal(matchesQuery(group, "DENVER hiking"), true);
  assert.equal(matchesQuery(group, "Chicago Rockies"), true);
  assert.equal(matchesQuery(group, "Denver Boston"), false);
});

test("empty and whitespace searches include every group", () => {
  assert.equal(matchesQuery(post("search"), ""), true);
  assert.equal(matchesQuery(post("search"), "  \n  "), true);
});

// --- The filters: the dates, and the order ---

test("the date range narrows the lobby down", () => {
  const june = post("june", { startDate: "2099-06-01", endDate: "2099-06-05" });
  const july = post("july", { startDate: "2099-07-01", endDate: "2099-07-05" });
  const all = [june, july];

  // Only the trips that are travelled in the window the reader asked for.
  assert.deepEqual(lobbyForTrip(all, "", { from: "2099-06-01", to: "2099-06-30" }).others.map((i) => i.id), ["june"]);
  assert.deepEqual(lobbyForTrip(all, "", { from: "2099-07-01" }).others.map((i) => i.id), ["july"]);
  assert.deepEqual(lobbyForTrip(all, "", { to: "2099-06-30" }).others.map((i) => i.id), ["june"]);
  assert.equal(lobbyForTrip(all, "", { from: "2099-05-01", to: "2099-08-01" }).others.length, 2);
});

test("a trip that overlaps the window counts, even if it starts before it", () => {
  const long = post("long", { startDate: "2099-05-20", endDate: "2099-06-10" });
  const result = lobbyForTrip([long], "", { from: "2099-06-01", to: "2099-06-05" });
  assert.equal(result.others.length, 1, "the trip is being travelled during the window");
});

test("the lobby can be ordered by the day it leaves", () => {
  const later = post("later", { score: 10, startDate: "2099-09-01" });
  const sooner = post("sooner", { score: 90, startDate: "2099-06-01" });
  const bySoonest = lobbyForTrip([later, sooner], "", { sort: "soonest" }).others.map((i) => i.id);
  assert.deepEqual(bySoonest, ["sooner", "later"], "the order asked for wins over the score");
});

test("the lobby can be ordered by the day it comes back", () => {
  const long = post("long", { score: 90, startDate: "2099-06-01", endDate: "2099-09-01" });
  const short = post("short", { score: 10, startDate: "2099-06-01", endDate: "2099-06-05" });
  const byEnd = lobbyForTrip([long, short], "", { sort: "soonest-end" }).others.map((i) => i.id);
  assert.deepEqual(byEnd, ["short", "long"]);
});

test("the search and the date range are used together", () => {
  const denver = post("denver", { destination: "Denver", startDate: "2099-06-01", endDate: "2099-06-05" });
  const boston = post("boston", { destination: "Boston", startDate: "2099-06-01", endDate: "2099-06-05" });
  const denverJuly = post("denverJuly", { destination: "Denver", startDate: "2099-07-01", endDate: "2099-07-05" });
  const all = [denver, boston, denverJuly];
  const result = lobbyForTrip(all, "denver", { from: "2099-06-01", to: "2099-06-30" });
  assert.deepEqual(result.others.map((i) => i.id), ["denver"]);
});


test("every sorting mode is deterministic, respects its primary key and puts ended trips last",()=>{
 const a=post("a",{score:90,startDate:"2099-06-10",endDate:"2099-06-30"});
 const b=post("b",{score:10,startDate:"2099-06-20",endDate:"2099-06-21"});
 const c=post("c",{score:100,datesClash:true,startDate:"2099-06-01",endDate:"2099-06-05"});
 const old=post("old",{ended:true,score:100,startDate:"2000-01-01",endDate:"2000-01-02"});
 const expected={closest:["a","b","c","old"],soonest:["c","a","b","old"],"soonest-end":["c","b","a","old"]};
 for(const sort of ["closest","soonest","soonest-end"] as const){
  for(const input of [[a,b,c,old],[old,c,b,a],[b,old,a,c]]) assert.deepEqual(lobbyForTrip(input,"",{sort}).others.map(p=>p.id),expected[sort]);
 }
 const equal=[post("z"),post("a")];for(const sort of ["closest","soonest","soonest-end"] as const)assert.deepEqual(lobbyForTrip(equal,"",{sort}).others.map(p=>p.id),["a","z"]);
});

test("the reader's own trips stay, whatever the search and the dates", () => {
  const result = lobbyForTrip([post("own", { mine: true }), post("other")], "boston", { from: "2100-01-01" });
  assert.deepEqual(result.mine.map((item) => item.id), ["own"]);
  assert.deepEqual(result.others, []);
});
