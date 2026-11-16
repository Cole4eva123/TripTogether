import { after } from "node:test";
import { closeDatabase } from "./postgres.ts";
after(closeDatabase);
// The parts of the lobby that read the real state of the world rather than a copy of it: who is in a trip
// now, which of the reader's own trips a post was compared against, trips that are already over, and the
// requests waiting on the trips the reader is in.
//
// Everything runs on the store in lib/match-db.ts, so the test needs no server.
import assert from "node:assert/strict";
import { test } from "node:test";
import { today } from "./dates.ts";
import { createJoinRequest, listRequestsFor, lobbyFor, publishPost, refreshPost, resetStore, respondToRequest, unpublishPost, } from "./match-db.ts";
import { createTrip, createUser, joinTrip, resetStore as resetTripStore, updateTrip } from "../tests/fixtures/shared-backend.ts";
let counter = 0;
/** The stores live on globalThis, so each test starts from an empty lobby. */
async function reset() {
    (await resetStore());
    (await resetTripStore());
}
/** A person with a trip of their own. */
async function person(name: string) {
    return (await createUser(name, `${name.toLowerCase()}${counter++}@example.com`, "roadtrip1"))!;
}
/** A trip for a person, with the given dates. */
async function tripOf(userId: string, destination: string, start = "2026-12-01", end = "2026-12-05") {
    return (await createTrip(userId, { origin: "Chicago", destination, startDate: start, endDate: end }));
}
test("the scores follow the live group size after publication", async () => {
    (await reset());
    const a = (await person("LiveSizeA"));
    const b = (await person("LiveSizeB"));
    const mate = (await person("LiveSizeMate"));
    const first = (await tripOf(a.id, "Chicago"));
    const second = (await tripOf(b.id, "Chicago"));
    (await publishPost(a.id, first.id, ""))!;
    const to = (await publishPost(b.id, second.id, ""))!;
    assert.equal((await lobbyFor(a.id)).others[0]!.score, 100);
    (await joinTrip(first.inviteCode, mate.id));
    const score = (await lobbyFor(a.id)).others[0]!.score;
    assert.equal(score, 97);
    // The request records the same score the card shows.
    assert.equal((await createJoinRequest(a.id, to.id, ""))!.score, score);
});
test("expired trips cannot be asked about", async () => {
    (await reset());
    const a = (await person("ExpiredSourceA"));
    const b = (await person("ExpiredSourceB"));
    // This long date range bypasses input validation to isolate store-level checks.
    const expired = (await tripOf(b.id, "Chicago", "2000-01-01", "2000-01-03"));
    const upcoming = (await tripOf(b.id, "Chicago", "2000-01-01", "2099-01-03"));
    (await publishPost(a.id, (await tripOf(a.id, "Chicago")).id, ""))!;
    const over = (await publishPost(b.id, expired.id, ""))!;
    (await publishPost(b.id, upcoming.id, ""))!;
    assert.equal((await createJoinRequest(a.id, over.id, "")), null, "the trip is over, so it can't be joined");
});
test("taking down a post keeps the live members visible on the request", async () => {
    (await reset());
    const a = (await person("UnpublishedA"));
    const b = (await person("UnpublishedB"));
    const first = (await tripOf(a.id, "Chicago"));
    const second = (await tripOf(b.id, "Chicago"));
    (await publishPost(a.id, first.id, ""))!;
    const to = (await publishPost(b.id, second.id, ""))!;
    const request = (await createJoinRequest(a.id, to.id, ""))!;
    (await respondToRequest(request.id, b.id, "accept"));
    (await unpublishPost(b.id, second.id));
    const side = (await listRequestsFor(a.id))[0];
    assert.equal(side.gone, true);
    // Sam was let in before the post came down, so he is still in the trip and still in its chat group.
    assert.deepEqual(side.members.map((member) => member.id).sort(), [a.id, b.id].sort());
});
test("the card shows who is in the trip now, not how many were there when it was published", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const mate = (await person("Mate"));
    const sam = (await person("Sam"));
    const mayaTrip = (await tripOf(maya.id, "Chicago"));
    const samTrip = (await tripOf(sam.id, "Chicago"));
    (await publishPost(maya.id, mayaTrip.id, "our group"));
    (await publishPost(sam.id, samTrip.id, "room for more"));
    // Sam sees Maya's trip with one traveler: Maya.
    const beforeJoin = (await lobbyFor(sam.id)).others.find((p) => p.destination === "Chicago")!;
    assert.equal(beforeJoin.members.length, 1);
    assert.equal(beforeJoin.members[0].name, "Maya");
    // The mate joins Maya's trip afterwards. The card has to show them, because the group is bigger now.
    (await joinTrip(mayaTrip.inviteCode, mate.id));
    const afterJoin = (await lobbyFor(sam.id)).others.find((p) => p.destination === "Chicago")!;
    assert.equal(afterJoin.members.length, 2);
    assert.deepEqual(afterJoin.members.map((m) => m.name).sort(), ["Mate", "Maya"]);
});
test("the card says which of the reader's own trips it was compared against", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    // Maya has two trips in the lobby; Sam's one matches the Chicago trip and not the Denver one.
    const chicago = (await tripOf(maya.id, "Chicago", "2026-12-01", "2026-12-05"));
    const denver = (await tripOf(maya.id, "Denver", "2027-03-01", "2027-03-05"));
    const samTrip = (await tripOf(sam.id, "Chicago", "2026-12-02", "2026-12-06"));
    (await publishPost(maya.id, chicago.id, "to the city"));
    (await publishPost(maya.id, denver.id, "to the mountains"));
    (await publishPost(sam.id, samTrip.id, "same city"));
    const post = (await lobbyFor(maya.id)).others[0]!;
    assert.ok(post.basis, "the card says what it was compared against");
    assert.equal(post.basis!.tripId, chicago.id);
    assert.equal(post.basis!.destination, "Chicago");
    assert.equal(post.basis!.overlapDays, 4);
    assert.equal(post.basis!.overlapStart, "2026-12-02");
    assert.equal(post.basis!.overlapEnd, "2026-12-05");
});
test("every trip the reader is in is in the lobby, and the filters narrow them down too", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    const mayaChicago = (await tripOf(maya.id, "Chicago", "2026-12-01", "2026-12-05"));
    const mayaDenver = (await tripOf(maya.id, "Denver", "2027-03-01", "2027-03-05"));
    (await publishPost(maya.id, mayaChicago.id, ""));
    (await publishPost(maya.id, mayaDenver.id, ""));
    // Both of Maya's trips are hers, not somebody else's.
    const mine = (await lobbyFor(maya.id)).mine;
    assert.equal(mine.length, 2, "both of Maya's trips are in the lobby");
    assert.deepEqual(mine.map((p) => p.destination).sort(), ["Chicago", "Denver"]);
    // The filters narrow the reader's own trips down as well: they are part of the lobby.
    const searched = (await lobbyFor(maya.id, "", "Denver")).mine;
    assert.deepEqual(searched.map((p) => p.destination), ["Denver"], "the search finds Maya's own trip");
    const dated = (await lobbyFor(maya.id, "", "", { from: "2026-11-01", to: "2026-12-31" })).mine;
    assert.deepEqual(dated.map((p) => p.destination), ["Chicago"], "the date window finds Maya's own trip");
    // And everybody else's trips are still there for Sam.
    const samSees = (await lobbyFor(sam.id)).others;
    assert.equal(samSees.length, 2, "Sam sees both of Maya's trips");
});
test("a trip the reader joined is compared against, even though they did not publish it", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    const ada = (await person("Ada"));
    const mayaChicago = (await tripOf(maya.id, "Chicago", "2026-12-01", "2026-12-05"));
    const adaDenver = (await tripOf(ada.id, "Denver", "2027-03-01", "2027-03-05"));
    (await publishPost(maya.id, mayaChicago.id, ""));
    (await publishPost(ada.id, adaDenver.id, ""));
    // Sam asks to join Maya's trip and is let in.
    const post = (await lobbyFor(sam.id)).others.find((p) => p.destination === "Chicago")!;
    const request = (await createJoinRequest(sam.id, post.id, ""))!;
    (await respondToRequest(request.id, maya.id, "accept"));
    // Maya's trip is now one of Sam's trips, and it is what the comparison is made against — even though Sam
    // never published it.
    const others = (await lobbyFor(sam.id)).others;
    const denver = others.find((p) => p.destination === "Denver")!;
    assert.equal(denver.basis!.tripId, mayaChicago.id, "the joined trip is what the comparison uses");
});
test("the reader can pick which of their own trips the comparison is made against", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    const mayaChicago = (await tripOf(maya.id, "Chicago", "2026-12-01", "2026-12-05"));
    const mayaDenver = (await tripOf(maya.id, "Denver", "2027-03-01", "2027-03-05"));
    // Sam has two trips of their own, so the reader has something to pick between.
    const samChicago = (await tripOf(sam.id, "Chicago", "2026-12-01", "2026-12-05"));
    const samDenver = (await tripOf(sam.id, "Denver", "2027-03-01", "2027-03-05"));
    (await publishPost(maya.id, mayaChicago.id, ""));
    (await publishPost(maya.id, mayaDenver.id, ""));
    (await publishPost(sam.id, samChicago.id, ""));
    (await publishPost(sam.id, samDenver.id, ""));
    // The pick is a trip id, so it can be a trip the reader joined as well as one they published.
    const samPosts = (await lobbyFor(sam.id)).mine;
    assert.equal(samPosts.length, 2, "Sam has two trips in the lobby");
    // Without a pick, each of Maya's trips is compared against the best of Sam's own trips.
    const mayaPosts = (await lobbyFor(sam.id)).others;
    const againstChicago = mayaPosts.find((p) => p.destination === "Chicago")!;
    const againstDenver = mayaPosts.find((p) => p.destination === "Denver")!;
    assert.equal(againstChicago.basis!.tripId, samChicago.id, "Chicago matches Sam's Chicago trip");
    assert.equal(againstDenver.basis!.tripId, samDenver.id, "Denver matches Sam's Denver trip");
    // Now Sam says they mean the Chicago trip, and the Denver card follows that pick.
    const picked = (await lobbyFor(sam.id, samChicago.id, "")).others.find((p) => p.destination === "Denver")!;
    assert.equal(picked.basis!.tripId, samChicago.id, "the trip Sam named is the one used");
    assert.equal(picked.basis!.overlapDays, 0, "and the dates don't overlap it");
    // A trip that isn't Sam's own is ignored, and the best of their own trips is used instead.
    const ignored = (await lobbyFor(sam.id, mayaChicago.id, "")).others.find((p) => p.destination === "Chicago")!;
    assert.equal(ignored.basis!.tripId, samChicago.id);
});
test("a trip that is already over is marked as over and can't be asked about", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    const over = (await tripOf(maya.id, "Chicago", "2026-01-01", "2026-01-05"));
    const samTrip = (await tripOf(sam.id, "Chicago", "2026-01-02", "2026-01-06"));
    (await publishPost(maya.id, over.id, "last year"));
    (await publishPost(sam.id, samTrip.id, "same time last year"));
    const post = (await lobbyFor(sam.id)).others[0]!;
    assert.equal(post.ended, true, "the card says the trip is over");
    // And no request can be made about it: the trip has already gone.
    assert.equal((await createJoinRequest(sam.id, post.id, "too late")), null);
});
test("a trip that ends today is not over yet", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    const onGoing = (await tripOf(maya.id, "Chicago", today(), today()));
    const samTrip = (await tripOf(sam.id, "Chicago", today(), today()));
    (await publishPost(maya.id, onGoing.id, ""));
    (await publishPost(sam.id, samTrip.id, ""));
    const post = (await lobbyFor(sam.id)).others[0]!;
    assert.equal(post.ended, false, "the last day of a trip is still the trip");
});
test("a request is about the trip it was made against, and lands on that trip's card", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    const mayaChicago = (await tripOf(maya.id, "Chicago", "2026-12-01", "2026-12-05"));
    const mayaDenver = (await tripOf(maya.id, "Denver", "2026-12-02", "2026-12-06"));
    (await publishPost(maya.id, mayaChicago.id, ""));
    (await publishPost(maya.id, mayaDenver.id, ""));
    (await publishPost(sam.id, (await tripOf(sam.id, "Chicago", "2026-12-01", "2026-12-05")).id, ""));
    // Sam asks to join Maya's Denver trip.
    const mayaPost = (await lobbyFor(sam.id)).others.find((p) => p.destination === "Denver")!;
    const request = (await createJoinRequest(sam.id, mayaPost.id, "about Denver"))!;
    assert.equal(request.tripId, mayaDenver.id);
    // And it lands on that trip's card for Maya.
    const forMaya = (await listRequestsFor(maya.id));
    assert.equal(forMaya.length, 1);
    assert.equal(forMaya[0].post.destination, "Denver");
    assert.equal(forMaya[0].request.tripId, mayaDenver.id);
});
test("the applicant's own request is shown on the card of the trip they asked about", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    const mayaTrip = (await tripOf(maya.id, "Chicago"));
    (await publishPost(maya.id, mayaTrip.id, ""));
    (await publishPost(sam.id, (await tripOf(sam.id, "Samville", "2026-12-01", "2026-12-05")).id, ""));
    const mayaPost = (await lobbyFor(sam.id)).others.find((p) => p.destination === "Chicago")!;
    (await createJoinRequest(sam.id, mayaPost.id, "let me in"));
    // Sam's own card carries the request, so he can see that he is waiting for an answer.
    const card = (await lobbyFor(sam.id)).others.find((p) => p.destination === "Chicago")!;
    assert.equal(card.myRequest?.status, "pending");
});
test("a post can be refreshed from the trip it speaks for", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const trip = (await tripOf(maya.id, "Chicago", "2026-12-01", "2026-12-05"));
    (await publishPost(maya.id, trip.id, "our plan"));
    // The group changes the dates on the trip.
    (await updateTrip(trip.id, {
        origin: "Chicago",
        destination: "Chicago",
        startDate: "2027-01-01",
        endDate: "2027-01-05",
    }));
    // Before the refresh, the post still holds the plan it was published with.
    assert.equal((await lobbyFor(maya.id)).mine[0].startDate, "2026-12-01");
    // After it, the post speaks for the trip as it is now, and the note is still the publisher's own words.
    const refreshed = (await refreshPost(maya.id, trip.id));
    assert.ok(refreshed);
    assert.equal(refreshed!.startDate, "2027-01-01");
    assert.equal(refreshed!.note, "our plan");
});
test("a post is only refreshed by the one who published it", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const mate = (await person("Mate"));
    const trip = (await tripOf(maya.id, "Chicago"));
    (await joinTrip(trip.inviteCode, mate.id));
    (await publishPost(maya.id, trip.id, "our plan"));
    // The mate is in the group, but didn't publish it.
    assert.equal((await refreshPost(mate.id, trip.id)), null);
    // Maya did, so it works.
    assert.ok((await refreshPost(maya.id, trip.id)));
});
test("the people of the trip are on the request", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const mate = (await person("Mate"));
    const sam = (await person("Sam"));
    const mayaTrip = (await tripOf(maya.id, "Chicago"));
    const samTrip = (await tripOf(sam.id, "Chicago"));
    (await joinTrip(mayaTrip.inviteCode, mate.id));
    (await publishPost(maya.id, mayaTrip.id, ""));
    (await publishPost(sam.id, samTrip.id, ""));
    const mayaPost = (await lobbyFor(sam.id)).others[0]!;
    const request = (await createJoinRequest(sam.id, mayaPost.id, "want to join"))!;
    (await respondToRequest(request.id, maya.id, "accept"));
    // Sam sees who is in the trip he was let into.
    const forSam = (await listRequestsFor(sam.id));
    assert.equal(forSam.length, 1);
    assert.equal(forSam[0].members.length, 3);
    assert.deepEqual(forSam[0].members.map((m) => m.name).sort(), ["Mate", "Maya", "Sam"]);
});
test("a request remembers the trip it was about when the trip leaves the lobby", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    const mayaTrip = (await tripOf(maya.id, "Chicago"));
    const samTrip = (await tripOf(sam.id, "Chicago"));
    (await publishPost(maya.id, mayaTrip.id, "our plan"));
    (await publishPost(sam.id, samTrip.id, ""));
    const mayaPost = (await lobbyFor(sam.id)).others[0]!;
    (await createJoinRequest(sam.id, mayaPost.id, "want to join"));
    // Maya takes her trip down the lobby.
    assert.ok((await unpublishPost(maya.id, mayaTrip.id)));
    // Sam still sees which trip it was about, so the request doesn't go blank.
    const forSam = (await listRequestsFor(sam.id));
    assert.equal(forSam.length, 1);
    assert.equal(forSam[0].gone, true);
});
test("the days in common are right across a month boundary", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    const mayaTrip = (await tripOf(maya.id, "Chicago", "2026-11-27", "2026-12-01"));
    const samTrip = (await tripOf(sam.id, "Chicago", "2026-11-30", "2026-12-04"));
    (await publishPost(maya.id, mayaTrip.id, ""));
    (await publishPost(sam.id, samTrip.id, ""));
    const post = (await lobbyFor(sam.id)).others[0]!;
    assert.ok(post.basis);
    assert.equal(post.basis!.overlapDays, 2);
    assert.equal(post.basis!.overlapStart, "2026-11-30");
    assert.equal(post.basis!.overlapEnd, "2026-12-01");
});

 test("filtered publications remain known to the publishing form", async () => {
 await reset();
 const user=(await createUser("Filtered Publisher","filtered-publisher@example.com","roadtrip1"))!;
 const trip=await createTrip(user.id,{origin:"Boston",destination:"Chicago",startDate:"2027-06-01",endDate:"2027-06-05"});
 await publishPost(user.id,trip.id,"Already shared");
 const filtered=await lobbyFor(user.id,undefined,"no-such-destination");
 assert.equal(filtered.mine.length,0);
 assert.ok(filtered.publishedTripIds?.includes(trip.id));
 });

 test("pending reminders count only answerable requests and ignore lobby search filters", async()=>{
 await reset();
 const owner=(await createUser("OwnerNotify","notify-owner@example.com","roadtrip1"))!;
 const member=(await createUser("MemberNotify","notify-member@example.com","roadtrip1"))!;
 const applicant=(await createUser("ApplicantNotify","notify-applicant@example.com","roadtrip1"))!;
 const trip=await createTrip(owner.id,{origin:"Boston",destination:"Chicago",startDate:"2027-06-01",endDate:"2027-06-05"});
 await joinTrip(trip.inviteCode,member.id);const post=(await publishPost(owner.id,trip.id,"Notify"))!;
 const request=(await createJoinRequest(applicant.id,post.id,"Join"))!;
 assert.equal((await lobbyFor(owner.id,undefined,"not-visible")).pendingRequestCount,1);
 assert.equal((await lobbyFor(member.id)).pendingRequestCount,1);
 assert.equal((await lobbyFor(applicant.id)).pendingRequestCount,0);
 await respondToRequest(request.id,member.id,"accept");
 assert.equal((await lobbyFor(owner.id)).pendingRequestCount,0);
 assert.equal((await lobbyFor(applicant.id)).pendingRequestCount,0);
 });
