import { after } from "node:test";
import { closeDatabase } from "./postgres.ts";
after(closeDatabase);
import assert from "node:assert/strict";
import { test } from "node:test";
import { addTripMessage, createJoinRequest, listRequestsFor, lobbyFor, messagesForTrip, publishPost, resetStore, respondToRequest, unpublishPost, withdrawRequest, } from "./match-db.ts";
import { createTrip, createUser, deleteTrip, joinTrip, resetStore as resetTripStore, tripMembers, } from "../tests/fixtures/shared-backend.ts";
let counter = 0;
/**
 * The stores live on globalThis, so a test run shares them. Each test starts from an empty lobby and an
 * empty set of trips, or one test's posts would show up in the next one's lobby.
 */
async function reset() {
    (await resetStore());
    (await resetTripStore());
}
/** A user with a trip of their own, so the lobby has something to publish. */
async function setup(name: string, destination = "New York") {
    const user = (await createUser(name, `${name.toLowerCase()}${counter++}@example.com`, "roadtrip1"))!;
    const trip = (await createTrip(user.id, {
        origin: "Chicago",
        destination,
        startDate: "2026-12-01",
        endDate: "2026-12-08",
    }));
    return { user, trip };
}
test("publishing a trip puts it in the lobby, marked as mine", async () => {
    (await reset());
    const a = (await setup("Maya"));
    const post = (await publishPost(a.user.id, a.trip.id, "hello"));
    assert.ok(post);
    const { mine } = (await lobbyFor(a.user.id));
    assert.equal(mine.length, 1);
    assert.equal(mine[0].mine, true);
    assert.equal(mine[0].publishedByMe, true);
});
test("publishing the same trip twice is refused", async () => {
    (await reset());
    const a = (await setup("Maya"));
    assert.ok((await publishPost(a.user.id, a.trip.id, "hello")));
    assert.equal((await publishPost(a.user.id, a.trip.id, "again")), null);
});
test("publishing a trip that isn't yours is refused", async () => {
    (await reset());
    const a = (await setup("Maya"));
    const b = (await setup("Sam"));
    assert.equal((await publishPost(a.user.id, b.trip.id, "not mine")), null);
});
// --- A trip is the group, and it has one chat group of its own ---
test("a member of the trip sees it as their own", async () => {
    (await reset());
    const a = (await setup("Maya"));
    const mate = (await createUser("Mate", `mate${counter++}@example.com`, "roadtrip1"))!;
    (await joinTrip(a.trip.inviteCode, mate.id));
    (await publishPost(a.user.id, a.trip.id, "our group"));
    const { mine } = (await lobbyFor(mate.id));
    assert.equal(mine.length, 1);
    assert.equal(mine[0].mine, true, "the group is the trip, so this is the member's own post");
    assert.equal(mine[0].publishedByMe, false, "but the member didn't publish it");
});
test("every member of the trip is an owner of it, so any of them answers the requests", async () => {
    (await reset());
    const a = (await setup("Maya", "Mayaville"));
    const mate = (await createUser("Mate", `mate${counter++}@example.com`, "roadtrip1"))!;
    (await joinTrip(a.trip.inviteCode, mate.id));
    const b = (await setup("Sam", "Samville"));
    (await publishPost(a.user.id, a.trip.id, "our group"));
    (await publishPost(b.user.id, b.trip.id, "our group"));
    const postA = (await lobbyFor(b.user.id)).others.find((p) => p.destination === "Mayaville")!;
    const request = (await createJoinRequest(b.user.id, postA.id, "want to join"))!;
    // The member can read the request, because they're in the trip it was aimed at.
    const requests = (await listRequestsFor(mate.id));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].request.id, request.id);
    assert.equal(requests[0].role, "owner");
    // A trip is a group: everybody in it owns it, so the member answers for the trip just as the person who
    // made it does. They travel together, so they decide together who travels with them.
    assert.ok((await respondToRequest(request.id, mate.id, "accept")), "a member of the trip can answer");
    assert.ok((await tripMembers(a.trip.id)).some((m) => m.id === b.user.id), "and the applicant is let in");
});
test("the person who made the trip can answer even when somebody else published it", async () => {
    (await reset());
    const a = (await setup("Maya", "Mayaville"));
    const mate = (await createUser("Mate", `mate${counter++}@example.com`, "roadtrip1"))!;
    (await joinTrip(a.trip.inviteCode, mate.id));
    const b = (await setup("Sam", "Samville"));
    // The member publishes it, not the person who made the trip.
    (await publishPost(mate.id, a.trip.id, "our group"));
    (await publishPost(b.user.id, b.trip.id, "our group"));
    const postA = (await lobbyFor(b.user.id)).others.find((p) => p.destination === "Mayaville")!;
    const request = (await createJoinRequest(b.user.id, postA.id, "want to join"))!;
    // The person who made the trip is in it, so they are one of its owners and may answer.
    assert.ok((await respondToRequest(request.id, a.user.id, "accept")), "the trip's maker can answer");
});
test("the person who asked can't answer their own request", async () => {
    (await reset());
    const a = (await setup("Maya", "Mayaville"));
    const b = (await setup("Sam", "Samville"));
    (await publishPost(a.user.id, a.trip.id, ""));
    (await publishPost(b.user.id, b.trip.id, ""));
    const postA = (await lobbyFor(b.user.id)).others.find((p) => p.destination === "Mayaville")!;
    const request = (await createJoinRequest(b.user.id, postA.id, "want to join"))!;
    // The applicant is not in the trip yet, so they are not one of its owners.
    assert.equal((await respondToRequest(request.id, b.user.id, "accept")), null);
    // But they can take the request back, because it is theirs.
    assert.ok((await withdrawRequest(request.id, b.user.id)));
});
test("somebody outside the trip can't answer a request about it", async () => {
    (await reset());
    const a = (await setup("Maya", "Mayaville"));
    const b = (await setup("Sam", "Samville"));
    (await publishPost(a.user.id, a.trip.id, ""));
    (await publishPost(b.user.id, b.trip.id, ""));
    const postA = (await lobbyFor(b.user.id)).others.find((p) => p.destination === "Mayaville")!;
    const request = (await createJoinRequest(b.user.id, postA.id, "want to join"))!;
    assert.equal((await respondToRequest(request.id, b.user.id, "accept")), null, "the applicant can't");
    const stranger = (await createUser("Noa", `noa${counter++}@example.com`, "roadtrip1"))!;
    assert.equal((await respondToRequest(request.id, stranger.id, "accept")), null, "a stranger can't");
});
test("a member of the trip is in its chat group", async () => {
    (await reset());
    const a = (await setup("Maya", "Mayaville"));
    const mate = (await createUser("Mate", `mate${counter++}@example.com`, "roadtrip1"))!;
    (await joinTrip(a.trip.inviteCode, mate.id));
    // Every member of the trip can write in its chat group.
    const message = (await addTripMessage(a.trip.id, mate.id, "I can drive the first stretch."));
    assert.equal(message.senderName, "Mate");
    assert.equal((await messagesForTrip(a.trip.id)).length, 1);
});
test("someone who isn't in the trip can't write in its chat group", async () => {
    (await reset());
    const a = (await setup("Maya"));
    const stranger = (await createUser("Noa", `noa${counter++}@example.com`, "roadtrip1"))!;
    await assert.rejects(async () => (await addTripMessage(a.trip.id, stranger.id, "let me in")));
});
test("a member of the trip can't ask to join their own trip", async () => {
    (await reset());
    const a = (await setup("Maya"));
    const mate = (await createUser("Mate", `mate${counter++}@example.com`, "roadtrip1"))!;
    (await joinTrip(a.trip.inviteCode, mate.id));
    (await publishPost(a.user.id, a.trip.id, ""));
    const ownPost = (await lobbyFor(mate.id)).mine[0];
    assert.equal((await createJoinRequest(mate.id, ownPost.id, "joining my own trip")), null);
});
test("a stranger sees neither the requests of a trip nor its conversation", async () => {
    (await reset());
    const a = (await setup("Maya"));
    const b = (await setup("Sam"));
    const stranger = (await createUser("Noa", `noa${counter++}@example.com`, "roadtrip1"))!;
    (await publishPost(a.user.id, a.trip.id, ""));
    (await publishPost(b.user.id, b.trip.id, ""));
    const postB = (await lobbyFor(a.user.id)).others[0]!;
    (await createJoinRequest(b.user.id, postB.id, "want to join"));
    assert.equal((await listRequestsFor(stranger.id)).length, 0);
});
// --- The requests live on the lobby, once each ---
test("a request reaches the owner of the trip, on the card of that trip", async () => {
    (await reset());
    const a = (await setup("Maya", "Mayaville"));
    const b = (await setup("Sam", "Samville"));
    (await publishPost(a.user.id, a.trip.id, ""));
    (await publishPost(b.user.id, b.trip.id, ""));
    const postFromB = (await lobbyFor(a.user.id)).others[0]!;
    const ask = (await createJoinRequest(a.user.id, postFromB.id, "want to join"));
    assert.ok(ask);
    // The owner of the trip that was asked about sees it on their own card.
    const bRequests = (await listRequestsFor(b.user.id));
    assert.equal(bRequests.length, 1);
    assert.equal(bRequests[0].role, "owner");
    assert.equal(bRequests[0].request.id, ask.id);
    assert.equal(bRequests[0].request.message, "want to join");
    assert.equal(bRequests[0].request.applicantName, "Maya");
    assert.equal(bRequests[0].post.destination, "Samville");
});
test("the applicant sees their own request, as an applicant", async () => {
    (await reset());
    const a = (await setup("Maya", "Mayaville"));
    const b = (await setup("Sam", "Samville"));
    (await publishPost(a.user.id, a.trip.id, ""));
    (await publishPost(b.user.id, b.trip.id, ""));
    const postB = (await lobbyFor(a.user.id)).others[0]!;
    (await createJoinRequest(a.user.id, postB.id, "hello"));
    const requests = (await listRequestsFor(a.user.id));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].role, "applicant");
    assert.equal(requests[0].post.destination, "Samville");
});
test("a request shows up once, not on both sides' cards", async () => {
    (await reset());
    const a = (await setup("Maya"));
    const b = (await setup("Sam"));
    (await publishPost(a.user.id, a.trip.id, ""));
    (await publishPost(b.user.id, b.trip.id, ""));
    const postB = (await lobbyFor(a.user.id)).others[0]!;
    const ask = (await createJoinRequest(a.user.id, postB.id, "hello"))!;
    const forA = (await listRequestsFor(a.user.id));
    const forB = (await listRequestsFor(b.user.id));
    assert.equal(forA.length, 1);
    assert.equal(forB.length, 1);
    assert.equal(forA[0].role, "applicant");
    assert.equal(forB[0].role, "owner");
    assert.equal(forA[0].request.id, ask.id);
    assert.equal(forB[0].request.id, ask.id);
});
test("one person doesn't get two requests for the same trip", async () => {
    (await reset());
    const a = (await setup("Maya"));
    const b = (await setup("Sam"));
    (await publishPost(a.user.id, a.trip.id, ""));
    (await publishPost(b.user.id, b.trip.id, ""));
    const postB = (await lobbyFor(a.user.id)).others[0]!;
    assert.ok((await createJoinRequest(a.user.id, postB.id, "first")));
    assert.equal((await createJoinRequest(a.user.id, postB.id, "again")), null);
    assert.equal((await listRequestsFor(a.user.id)).length, 1);
});
test("a request that was turned down doesn't block a fresh one", async () => {
    (await reset());
    const a = (await setup("Maya"));
    const b = (await setup("Sam"));
    (await publishPost(a.user.id, a.trip.id, ""));
    (await publishPost(b.user.id, b.trip.id, ""));
    const postB = (await lobbyFor(a.user.id)).others[0]!;
    const first = (await createJoinRequest(a.user.id, postB.id, "first"))!;
    assert.ok((await respondToRequest(first.id, b.user.id, "decline")));
    // Sam turned it down, so Maya may ask again.
    const second = (await createJoinRequest(a.user.id, postB.id, "again"));
    assert.ok(second);
    assert.notEqual(second!.id, first.id);
});
test("the answer to a request is recorded, and both sides see it", async () => {
    (await reset());
    const a = (await setup("Maya"));
    const b = (await setup("Sam"));
    (await publishPost(a.user.id, a.trip.id, ""));
    (await publishPost(b.user.id, b.trip.id, ""));
    const postB = (await lobbyFor(a.user.id)).others[0]!;
    const request = (await createJoinRequest(a.user.id, postB.id, "hello"))!;
    assert.ok((await respondToRequest(request.id, b.user.id, "accept")));
    // Only the owner of the trip may answer.
    assert.equal((await respondToRequest(request.id, a.user.id, "accept")), null);
    assert.equal((await listRequestsFor(a.user.id))[0].request.status, "accepted");
    assert.equal((await listRequestsFor(b.user.id))[0].request.status, "accepted");
});
test("accepting a request puts the applicant in the trip", async () => {
    (await reset());
    const a = (await setup("Maya"));
    const b = (await setup("Sam"));
    (await publishPost(a.user.id, a.trip.id, ""));
    (await publishPost(b.user.id, b.trip.id, ""));
    const postA = (await lobbyFor(b.user.id)).others[0]!;
    const request = (await createJoinRequest(b.user.id, postA.id, "let me in"))!;
    assert.deepEqual((await tripMembers(a.trip.id)).map((m) => m.name), ["Maya"]);
    (await respondToRequest(request.id, a.user.id, "accept"));
    // Now Sam is in the trip, and so in its chat group.
    assert.deepEqual((await tripMembers(a.trip.id)).map((m) => m.name).sort(), ["Maya", "Sam"]);
    assert.ok((await addTripMessage(a.trip.id, b.user.id, "Thanks for having me.")));
});
test("declining a request does not put the applicant in the trip", async () => {
    (await reset());
    const a = (await setup("Maya"));
    const b = (await setup("Sam"));
    (await publishPost(a.user.id, a.trip.id, ""));
    (await publishPost(b.user.id, b.trip.id, ""));
    const postA = (await lobbyFor(b.user.id)).others[0]!;
    const request = (await createJoinRequest(b.user.id, postA.id, "let me in"))!;
    (await respondToRequest(request.id, a.user.id, "decline"));
    assert.deepEqual((await tripMembers(a.trip.id)).map((m) => m.name), ["Maya"]);
    await assert.rejects(async () => (await addTripMessage(a.trip.id, b.user.id, "hello?")));
});
test("a request still reads when the trip leaves the lobby", async () => {
    (await reset());
    const a = (await setup("Maya"));
    const b = (await setup("Sam"));
    (await publishPost(a.user.id, a.trip.id, ""));
    (await publishPost(b.user.id, b.trip.id, ""));
    const postB = (await lobbyFor(a.user.id)).others[0]!;
    (await createJoinRequest(a.user.id, postB.id, "hello"));
    // Sam takes their trip down the lobby while the request is still open.
    assert.ok((await unpublishPost(b.user.id, b.trip.id)));
    // The request is still there, and it still says who asked: the other side hasn't lost the thread.
    const requests = (await listRequestsFor(a.user.id));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].request.applicantName, "Maya");
    assert.equal(requests[0].gone, true, "the trip came down the lobby");
});
test("a request is turned down when the trip it points at is deleted", async () => {
    (await reset());
    const a = (await setup("Maya"));
    const b = (await setup("Sam"));
    (await publishPost(a.user.id, a.trip.id, ""));
    (await publishPost(b.user.id, b.trip.id, ""));
    const postB = (await lobbyFor(a.user.id)).others[0]!;
    (await createJoinRequest(a.user.id, postB.id, "hello"));
    (await deleteTrip(b.trip.id));
    const requests = (await listRequestsFor(a.user.id));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].request.status, "declined");
    // The trip went away rather than being answered, so it doesn't read as a refusal.
    assert.equal(requests[0].request.closedBy, "gone");
});
test("a request can be taken back by the person who made it", async () => {
    (await reset());
    const a = (await setup("Maya"));
    const b = (await setup("Sam"));
    (await publishPost(a.user.id, a.trip.id, ""));
    (await publishPost(b.user.id, b.trip.id, ""));
    const postB = (await lobbyFor(a.user.id)).others[0]!;
    const request = (await createJoinRequest(a.user.id, postB.id, "hello"))!;
    // Only the person who asked may take it back.
    assert.equal((await withdrawRequest(request.id, b.user.id)), null);
    const taken = (await withdrawRequest(request.id, a.user.id));
    assert.ok(taken);
    assert.equal(taken!.status, "declined");
    assert.equal(taken!.closedBy, "asked");
});
test("a message is attributed to the person who wrote it, not to the trip", async () => {
    (await reset());
    const a = (await setup("Maya"));
    const b = (await setup("Sam"));
    (await publishPost(a.user.id, a.trip.id, ""));
    (await publishPost(b.user.id, b.trip.id, ""));
    // Ben joins Maya's trip, so he is in its chat group too.
    const ben = (await createUser("Ben", `ben${counter++}@example.com`, "roadtrip1"))!;
    (await joinTrip(a.trip.inviteCode, ben.id));
    const message = (await addTripMessage(a.trip.id, ben.id, "I can drive the first stretch."));
    assert.equal(message.senderName, "Ben");
    assert.equal((await messagesForTrip(a.trip.id))[0].senderName, "Ben");
});
test("one person can join several trips", async () => {
    (await reset());
    const maya = (await setup("Maya", "Mayaville"));
    const sam = (await setup("Sam", "Samville"));
    const ada = (await setup("Ada", "Adaville"));
    (await publishPost(maya.user.id, maya.trip.id, ""));
    (await publishPost(sam.user.id, sam.trip.id, ""));
    (await publishPost(ada.user.id, ada.trip.id, ""));
    // Sam asks to join two different trips, and both are accepted.
    const postMaya = (await lobbyFor(sam.user.id)).others.find((p) => p.destination === "Mayaville")!;
    const postAda = (await lobbyFor(sam.user.id)).others.find((p) => p.destination === "Adaville")!;
    const first = (await createJoinRequest(sam.user.id, postMaya.id, "me too"))!;
    const second = (await createJoinRequest(sam.user.id, postAda.id, "me too"))!;
    (await respondToRequest(first.id, maya.user.id, "accept"));
    (await respondToRequest(second.id, ada.user.id, "accept"));
    // Sam is in both trips, and in both chat groups.
    assert.deepEqual((await tripMembers(maya.trip.id)).map((m) => m.name).sort(), ["Maya", "Sam"]);
    assert.deepEqual((await tripMembers(ada.trip.id)).map((m) => m.name).sort(), ["Ada", "Sam"]);
    (await addTripMessage(maya.trip.id, sam.user.id, "in the first one"));
    (await addTripMessage(ada.trip.id, sam.user.id, "in the second one"));
    assert.equal((await messagesForTrip(maya.trip.id)).length, 1);
    assert.equal((await messagesForTrip(ada.trip.id)).length, 1);
});
test("the chat group of a trip goes when the trip goes", async () => {
    (await reset());
    const a = (await setup("Maya"));
    (await addTripMessage(a.trip.id, a.user.id, "See you there."));
    (await deleteTrip(a.trip.id));
    assert.equal((await messagesForTrip(a.trip.id)).length, 0, "the conversation went with the trip");
});
