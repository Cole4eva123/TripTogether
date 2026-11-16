import { after } from "node:test";
import { closeDatabase } from "./postgres.ts";
after(closeDatabase);
// The lobby, the way people actually use it: several people, several trips, and the requests between them.
// Everything runs on the store in lib/match-db.ts, so the test needs no server.
//
// The scenario is the one a first-time user lands in: Maya publishes her group's trip, Sam asks to join it,
// Maya says yes, Sam is in the trip and in its chat group, and then Sam asks to join a second trip too.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addTripMessage, createJoinRequest, listRequestsFor, lobbyFor, messagesForTrip, publishPost, resetStore, respondToRequest, unpublishPost, withdrawRequest, } from "./match-db.ts";
import { createTrip, createUser, deleteTrip, joinTrip, leaveTrip, resetStore as resetTripStore, tripMembers, tripsFor, } from "../tests/fixtures/shared-backend.ts";
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
test("a person asks to join a trip, is let in, and talks in the trip's chat group", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    const mayaTrip = (await tripOf(maya.id, "Chicago"));
    const samTrip = (await tripOf(sam.id, "Chicago"));
    (await publishPost(maya.id, mayaTrip.id, "Three of us, hotel booked."));
    (await publishPost(sam.id, samTrip.id, "Two of us, room for more."));
    // Sam asks to join Maya's trip.
    const mayaPost = (await lobbyFor(sam.id)).others[0]!;
    const request = (await createJoinRequest(sam.id, mayaPost.id, "Want to join you?"));
    assert.ok(request, "the request is made");
    assert.equal(request!.status, "pending");
    // Maya sees it on her own card, with the requester's words.
    const mayaRequests = (await listRequestsFor(maya.id));
    assert.equal(mayaRequests.length, 1);
    assert.equal(mayaRequests[0].role, "owner");
    assert.equal(mayaRequests[0].request.applicantName, "Sam");
    assert.equal(mayaRequests[0].request.message, "Want to join you?");
    // Sam sees his own request, on his own card.
    const samRequests = (await listRequestsFor(sam.id));
    assert.equal(samRequests.length, 1);
    assert.equal(samRequests[0].role, "applicant");
    // Only Maya may answer.
    assert.equal((await respondToRequest(request!.id, sam.id, "accept")), null);
    assert.ok((await respondToRequest(request!.id, maya.id, "accept")));
    // Sam is now in the trip, and in its chat group.
    assert.deepEqual((await tripMembers(mayaTrip.id)).map((m) => m.name).sort(), ["Maya", "Sam"]);
    // The trip shows up under "My trips" for Sam, as well as Maya's own.
    assert.deepEqual((await tripsFor(sam.id)).map((t) => t.id).sort(), [mayaTrip.id, samTrip.id].sort());
    (await addTripMessage(mayaTrip.id, sam.id, "Sounds good, we meet at 8?"));
    (await addTripMessage(mayaTrip.id, maya.id, "Works for us. See you there."));
    const read = (await messagesForTrip(mayaTrip.id));
    assert.equal(read.length, 2);
    assert.equal(read[0].body, "Sounds good, we meet at 8?");
    assert.equal(read[1].body, "Works for us. See you there.");
});
test("a request about a second trip of the same group lands on that trip's card", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    const chicago = (await tripOf(maya.id, "Chicago"));
    const denver = (await tripOf(maya.id, "Denver", "2026-12-20", "2026-12-27"));
    const samTrip = (await tripOf(sam.id, "Denver", "2026-12-21", "2026-12-28"));
    (await publishPost(maya.id, chicago.id, "Chicago with us."));
    (await publishPost(maya.id, denver.id, "Driving to the Rockies."));
    (await publishPost(sam.id, samTrip.id, "Same road west."));
    // Sam asks about Maya's Denver trip.
    const denverPost = (await lobbyFor(sam.id)).others.find((p) => p.destination === "Denver")!;
    const request = (await createJoinRequest(sam.id, denverPost.id, "Heading west the same week."));
    assert.ok(request);
    // It lands on Maya's Denver card, and nowhere else.
    const requests = (await listRequestsFor(maya.id));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].post.destination, "Denver");
    assert.equal(requests[0].request.tripId, denver.id);
});
test("a member of the trip sees the requests about it and can join the talk", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const mate = (await person("Mate"));
    const sam = (await person("Sam"));
    const mayaTrip = (await tripOf(maya.id, "Chicago"));
    (await joinTrip(mayaTrip.inviteCode, mate.id));
    (await publishPost(maya.id, mayaTrip.id, "Our group."));
    (await publishPost(sam.id, (await tripOf(sam.id, "Chicago")).id, "Room for more."));
    const mayaPost = (await lobbyFor(sam.id)).others[0]!;
    const request = (await createJoinRequest(sam.id, mayaPost.id, "Let us in?"))!;
    (await respondToRequest(request.id, maya.id, "accept"));
    // The mate is in Maya's trip, so the request is theirs to read and the chat is theirs to be in.
    const requests = (await listRequestsFor(mate.id));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].request.id, request.id);
    assert.equal(requests[0].role, "owner", "the mate is in the trip, so the request is theirs to read");
    (await addTripMessage(mayaTrip.id, mate.id, "I drove last time, happy to split the drive."));
    assert.equal((await messagesForTrip(mayaTrip.id)).length, 1);
});
test("a request can be taken back, and asking again is allowed afterwards", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    const mayaTrip = (await tripOf(maya.id, "Chicago"));
    (await publishPost(maya.id, mayaTrip.id, ""));
    (await publishPost(sam.id, (await tripOf(sam.id, "Chicago")).id, ""));
    const mayaPost = (await lobbyFor(sam.id)).others[0]!;
    const first = (await createJoinRequest(sam.id, mayaPost.id, "first"))!;
    // Sam takes it back.
    const taken = (await withdrawRequest(first.id, sam.id));
    assert.ok(taken);
    assert.equal(taken!.status, "declined");
    assert.equal(taken!.closedBy, "asked");
    // Sam sees that he took it back, not that he was turned down.
    const samRequests = (await listRequestsFor(sam.id));
    assert.equal(samRequests.length, 1);
    assert.equal(samRequests[0].request.closedBy, "asked");
    // And he may ask again, because nothing is open between them any more.
    const second = (await createJoinRequest(sam.id, mayaPost.id, "again"));
    assert.ok(second, "a fresh request is allowed after a withdrawal");
    assert.notEqual(second!.id, first.id);
});
test("a request that was turned down can be made again", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    (await publishPost(maya.id, (await tripOf(maya.id, "Chicago")).id, ""));
    (await publishPost(sam.id, (await tripOf(sam.id, "Chicago")).id, ""));
    const mayaPost = (await lobbyFor(sam.id)).others[0]!;
    const first = (await createJoinRequest(sam.id, mayaPost.id, "first"))!;
    (await respondToRequest(first.id, maya.id, "decline"));
    // Maya turned it down, so Sam may ask again.
    const second = (await createJoinRequest(sam.id, mayaPost.id, "again"));
    assert.ok(second);
});
test("one person doesn't get two requests for the same trip", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    (await publishPost(maya.id, (await tripOf(maya.id, "Chicago")).id, ""));
    (await publishPost(sam.id, (await tripOf(sam.id, "Chicago")).id, ""));
    const mayaPost = (await lobbyFor(sam.id)).others[0]!;
    assert.ok((await createJoinRequest(sam.id, mayaPost.id, "first")));
    // The same request again is refused.
    assert.equal((await createJoinRequest(sam.id, mayaPost.id, "again")), null);
    assert.equal((await listMatchesForCount(maya.id)), 1);
    assert.equal((await listMatchesForCount(sam.id)), 1);
});
/** How many requests a person is party to. */
async function listMatchesForCount(userId: string): Promise<number> {
    return (await listRequestsFor(userId)).length;
}
test("a person can't ask to join a trip they're already in", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const mate = (await person("Mate"));
    const mayaTrip = (await tripOf(maya.id, "Chicago"));
    (await joinTrip(mayaTrip.inviteCode, mate.id));
    (await publishPost(maya.id, mayaTrip.id, ""));
    const ownPost = (await lobbyFor(mate.id)).mine.find((p) => p.mine)!;
    assert.equal((await createJoinRequest(mate.id, ownPost.id, "joining my own trip")), null);
});
test("a trip that is over can't be joined", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    const mayaTrip = (await tripOf(maya.id, "Chicago", "2026-01-05", "2026-01-10"));
    (await publishPost(maya.id, mayaTrip.id, ""));
    (await publishPost(sam.id, (await tripOf(sam.id, "Chicago")).id, ""));
    const mayaPost = (await lobbyFor(sam.id)).others.find((p) => p.destination === "Chicago")!;
    assert.equal(mayaPost.ended, true, "the card says the trip is over");
    assert.equal((await createJoinRequest(sam.id, mayaPost.id, "too late")), null);
});
test("a stranger sees none of it", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    const stranger = (await person("Noa"));
    (await publishPost(maya.id, (await tripOf(maya.id, "Chicago")).id, ""));
    (await publishPost(sam.id, (await tripOf(sam.id, "Chicago")).id, ""));
    const mayaPost = (await lobbyFor(sam.id)).others[0]!;
    (await createJoinRequest(sam.id, mayaPost.id, "want to join"));
    assert.equal((await listRequestsFor(stranger.id)).length, 0, "the requests aren't the stranger's to read");
});
test("a request survives the trip leaving the lobby", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    const mayaTrip = (await tripOf(maya.id, "Chicago"));
    const samTrip = (await tripOf(sam.id, "Chicago"));
    (await publishPost(maya.id, mayaTrip.id, ""));
    (await publishPost(sam.id, samTrip.id, ""));
    const mayaPost = (await lobbyFor(sam.id)).others[0]!;
    (await createJoinRequest(sam.id, mayaPost.id, "want to join"));
    // Sam takes his own trip down the lobby. The request is about Maya's trip, so it stands.
    assert.ok((await unpublishPost(sam.id, samTrip.id)));
    // Maya still has the request, and it still says who asked.
    const requests = (await listRequestsFor(maya.id));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].request.applicantName, "Sam");
    assert.equal(requests[0].request.status, "pending", "the trip it was asked about is still in the lobby");
});
test("a request is closed when the trip it was asked about leaves the lobby", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    const mayaTrip = (await tripOf(maya.id, "Chicago"));
    (await publishPost(maya.id, mayaTrip.id, ""));
    (await publishPost(sam.id, (await tripOf(sam.id, "Chicago")).id, ""));
    const mayaPost = (await lobbyFor(sam.id)).others[0]!;
    (await createJoinRequest(sam.id, mayaPost.id, "want to join"));
    // Maya takes her trip down the lobby. There is nothing left to join, so the request is closed.
    assert.ok((await unpublishPost(maya.id, mayaTrip.id)));
    const requests = (await listRequestsFor(sam.id));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].request.status, "declined");
    assert.equal(requests[0].request.closedBy, "gone", "the trip went away rather than being answered");
});
test("an agreed conversation survives the trip leaving the lobby", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    const mayaTrip = (await tripOf(maya.id, "Chicago"));
    (await publishPost(maya.id, mayaTrip.id, ""));
    (await publishPost(sam.id, (await tripOf(sam.id, "Chicago")).id, ""));
    const mayaPost = (await lobbyFor(sam.id)).others[0]!;
    const request = (await createJoinRequest(sam.id, mayaPost.id, "want to join"))!;
    (await respondToRequest(request.id, maya.id, "accept"));
    // Maya takes her trip down after they have agreed. The chat is still open.
    assert.ok((await unpublishPost(maya.id, mayaTrip.id)));
    const requests = (await listRequestsFor(maya.id));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].request.status, "accepted");
    assert.equal(requests[0].gone, true, "the trip it lived on is gone");
});
test("the person who asked is the only one who can take the request back", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    (await publishPost(maya.id, (await tripOf(maya.id, "Chicago")).id, ""));
    (await publishPost(sam.id, (await tripOf(sam.id, "Chicago")).id, ""));
    const mayaPost = (await lobbyFor(sam.id)).others[0]!;
    const request = (await createJoinRequest(sam.id, mayaPost.id, "let us in"))!;
    // The owner of the trip that was asked about cannot take the applicant's request back.
    assert.equal((await withdrawRequest(request.id, maya.id)), null);
    const taken = (await withdrawRequest(request.id, sam.id));
    assert.ok(taken, "the applicant can take their own request back");
    assert.equal(taken!.closedBy, "asked");
});
test("a conversation survives the trip being deleted, for both sides", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    const mayaTrip = (await tripOf(maya.id, "Chicago"));
    const samTrip = (await tripOf(sam.id, "Chicago"));
    (await publishPost(maya.id, mayaTrip.id, ""));
    (await publishPost(sam.id, samTrip.id, ""));
    const mayaPost = (await lobbyFor(sam.id)).others[0]!;
    const request = (await createJoinRequest(sam.id, mayaPost.id, "want to join"))!;
    (await respondToRequest(request.id, maya.id, "accept"));
    (await addTripMessage(mayaTrip.id, sam.id, "Still up for it?"));
    // Sam deletes his trip outright.
    (await deleteTrip(samTrip.id));
    // Sam keeps the trip he was let into, and its conversation.
    assert.equal((await messagesForTrip(mayaTrip.id)).length, 1);
    assert.equal((await messagesForTrip(mayaTrip.id))[0].body, "Still up for it?");
    // Maya keeps hers too.
    assert.equal((await listRequestsFor(maya.id)).length, 1);
    assert.equal((await listRequestsFor(maya.id))[0].request.status, "accepted");
});
test("one person can be in several trips at once", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    const ada = (await person("Ada"));
    const mayaTrip = (await tripOf(maya.id, "Chicago"));
    const adaTrip = (await tripOf(ada.id, "Denver"));
    (await publishPost(maya.id, mayaTrip.id, ""));
    (await publishPost(ada.id, adaTrip.id, ""));
    // Sam asks to join both, and is let into both.
    const mayaPost = (await lobbyFor(sam.id)).others.find((p) => p.destination === "Chicago")!;
    const adaPost = (await lobbyFor(sam.id)).others.find((p) => p.destination === "Denver")!;
    const first = (await createJoinRequest(sam.id, mayaPost.id, "me too"))!;
    const second = (await createJoinRequest(sam.id, adaPost.id, "me too"))!;
    (await respondToRequest(first.id, maya.id, "accept"));
    (await respondToRequest(second.id, ada.id, "accept"));
    // He is in both trips, and in both chat groups.
    assert.deepEqual((await tripMembers(mayaTrip.id)).map((m) => m.name).sort(), ["Maya", "Sam"]);
    assert.deepEqual((await tripMembers(adaTrip.id)).map((m) => m.name).sort(), ["Ada", "Sam"]);
    (await addTripMessage(mayaTrip.id, sam.id, "in the first one"));
    (await addTripMessage(adaTrip.id, sam.id, "in the second one"));
    assert.equal((await messagesForTrip(mayaTrip.id)).length, 1);
    assert.equal((await messagesForTrip(adaTrip.id)).length, 1);
});
test("every member of a trip is an owner of it, so any of them can let somebody in", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const mate = (await person("Mate"));
    const sam = (await person("Sam"));
    const mayaTrip = (await tripOf(maya.id, "Chicago"));
    (await joinTrip(mayaTrip.inviteCode, mate.id));
    (await publishPost(maya.id, mayaTrip.id, ""));
    (await publishPost(sam.id, (await tripOf(sam.id, "Chicago")).id, ""));
    const mayaPost = (await lobbyFor(sam.id)).others.find((p) => p.destination === "Chicago")!;
    const request = (await createJoinRequest(sam.id, mayaPost.id, "let me in"))!;
    // The member of the group is one of its owners, and may answer for it.
    assert.ok((await respondToRequest(request.id, mate.id, "accept")), "a member of the trip answers");
    assert.ok((await tripMembers(mayaTrip.id)).some((m) => m.id === sam.id), "and the applicant is let in");
});
test("the person who made the trip can answer even when somebody else published it", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const mate = (await person("Mate"));
    const sam = (await person("Sam"));
    const mayaTrip = (await tripOf(maya.id, "Chicago"));
    (await joinTrip(mayaTrip.inviteCode, mate.id));
    (await publishPost(mate.id, mayaTrip.id, ""));
    (await publishPost(sam.id, (await tripOf(sam.id, "Chicago")).id, ""));
    const mayaPost = (await lobbyFor(sam.id)).others.find((p) => p.destination === "Chicago")!;
    const request = (await createJoinRequest(sam.id, mayaPost.id, "let me in"))!;
    // The person who made the trip is in it, so they are one of its owners too.
    assert.ok((await respondToRequest(request.id, maya.id, "accept")), "the trip's maker can answer");
});
test("somebody outside the trip can't answer a request about it", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    const stranger = (await person("Stranger"));
    (await publishPost(maya.id, (await tripOf(maya.id, "Chicago")).id, ""));
    (await publishPost(sam.id, (await tripOf(sam.id, "Chicago")).id, ""));
    const mayaPost = (await lobbyFor(sam.id)).others.find((p) => p.destination === "Chicago")!;
    const request = (await createJoinRequest(sam.id, mayaPost.id, "let me in"))!;
    assert.equal((await respondToRequest(request.id, stranger.id, "accept")), null, "a stranger can't");
    assert.equal((await respondToRequest(request.id, sam.id, "accept")), null, "nor can the applicant");
});
test("an applicant who was let in and then left is no longer in the trip", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    const mayaTrip = (await tripOf(maya.id, "Chicago"));
    (await publishPost(maya.id, mayaTrip.id, ""));
    (await publishPost(sam.id, (await tripOf(sam.id, "Chicago")).id, ""));
    const mayaPost = (await lobbyFor(sam.id)).others.find((p) => p.destination === "Chicago")!;
    const request = (await createJoinRequest(sam.id, mayaPost.id, "let me in"))!;
    (await respondToRequest(request.id, maya.id, "accept"));
    assert.ok((await tripMembers(mayaTrip.id)).some((m) => m.id === sam.id), "he is in the trip");
    // He changes his mind and leaves.
    (await leaveTrip(mayaTrip.id, sam.id));
    // The request that let him in closes, so it doesn't go on saying he is a member.
    const closed = (await listRequestsFor(maya.id))[0]!.request;
    assert.equal(closed.status, "declined", "the request is closed");
    assert.equal(closed.closedBy, "left", "and it says he left");
    assert.ok(!(await tripMembers(mayaTrip.id)).some((m) => m.id === sam.id), "and he isn't in the trip");
});
test("the score on a request is the same as the score on the card", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const sam = (await person("Sam"));
    (await publishPost(maya.id, (await tripOf(maya.id, "Chicago")).id, ""));
    // Sam has a trip of his own, but he hasn't published it.
    (await tripOf(sam.id, "Chicago"));
    (await publishPost(maya.id, (await tripOf(maya.id, "Denver")).id, ""));
    const mayaPost = (await lobbyFor(sam.id)).others.find((p) => p.destination === "Chicago")!;
    const request = (await createJoinRequest(sam.id, mayaPost.id, "let me in"))!;
    // The card compares the trip against all of Sam's trips, not only the ones he published.
    const card = (await lobbyFor(sam.id)).others.find((p) => p.destination === "Chicago")!;
    assert.equal(request.score, card.score, "the request and the card agree");
    assert.ok(card.score > 0, "and it counts the trip he didn't publish");
});
test("a member who joins after the trip was published can still answer its requests", async () => {
    (await reset());
    const maya = (await person("Maya"));
    const late = (await person("Late"));
    const sam = (await person("Sam"));
    const mayaTrip = (await tripOf(maya.id, "Chicago"));
    (await publishPost(maya.id, mayaTrip.id, ""));
    (await publishPost(sam.id, (await tripOf(sam.id, "Chicago")).id, ""));
    const mayaPost = (await lobbyFor(sam.id)).others.find((p) => p.destination === "Chicago")!;
    const request = (await createJoinRequest(sam.id, mayaPost.id, "let me in"))!;
    // They join the group after it was already in the lobby.
    (await joinTrip(mayaTrip.inviteCode, late.id));
    assert.ok((await respondToRequest(request.id, late.id, "accept")), "they are in the group, so they may answer");
});
