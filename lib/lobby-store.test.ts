// The shared lobby's store against the PostgreSQL test database, emptied and migrated for this file (lib/db/test-db.ts).
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { eq } from "drizzle-orm";

const { freshDatabase } = await import("./db/test-db.ts");
const { lobbyPosts, lobbyRequests, tripMessages, trips, users } = await import("./db/schema.ts");
const store = await import("./store.ts");
const lobby = await import("./lobby-store.ts");
let db: Awaited<ReturnType<typeof freshDatabase>>;

const MAYA = "user-maya"; // organizes the Chicago trip
const ANA = "user-ana"; // a member of it
const SAM = "user-sam"; // organizes his own trip, and asks to join Maya's
const LEE = "user-lee";
let chicago = { id: "", inviteCode: "" };
let samTrip = { id: "" };

const trip = (owner: string, destination: string) =>
  store.createTrip(owner, { origin: "Champaign, IL", destination, startDate: "2027-03-01", endDate: "2027-03-05" });

before(async () => {
  db = await freshDatabase();
  await db.insert(users).values([
    { id: MAYA, name: "Maya Chen", email: "maya@example.com" },
    { id: ANA, name: "Ana Ruiz", email: "ana@example.com" },
    { id: SAM, name: "Sam Okafor", email: "sam@example.com" },
    { id: LEE, name: "Lee Park", email: "lee@example.com" },
  ]);
  chicago = await trip(MAYA, "Chicago");
  await store.joinTrip(chicago.inviteCode, ANA);
  samTrip = await trip(SAM, "Chicago");
});

const rejects = (p: Promise<unknown>, status: number) =>
  assert.rejects(p, (e: unknown) => e instanceof lobby.LobbyError && e.status === status);

test("only the organizer shares a trip, once", async () => {
  await rejects(lobby.publishPost(ANA, chicago.id, ""), 403);
  await rejects(lobby.publishPost(SAM, chicago.id, ""), 404);
  await rejects(lobby.publishPost(SAM, "not-an-id", ""), 404);
  const post = await lobby.publishPost(MAYA, chicago.id, "Hotel booked.");
  assert.equal(post.destination, "Chicago");
  assert.equal(post.memberCount, 2);
  await rejects(lobby.publishPost(MAYA, chicago.id, ""), 409);
});

test("the lobby shows the trip as it is now, naming only your own group", async () => {
  await store.updateTrip(chicago.id, { origin: "Urbana, IL", destination: "Chicago", startDate: "2027-03-02", endDate: "2027-03-05" });
  const theirs = (await lobby.lobbyFor(SAM)).others.find((p) => p.tripId === chicago.id)!;
  assert.equal(theirs.origin, "Urbana, IL", "a changed plan shows at once");
  assert.equal(theirs.startDate, "2027-03-02");
  assert.deepEqual(theirs.members.map((m) => m.name), ["", ""], "another group's names stay out");
  assert.ok(theirs.score > 0 && theirs.basis?.tripId === samTrip.id, "compared with Sam's own trip");
  const own = (await lobby.lobbyFor(ANA)).mine[0];
  assert.deepEqual(own.members.map((m) => m.name), ["Maya Chen", "Ana Ruiz"]);
  assert.equal(own.organizedByMe, false);
  assert.equal((await lobby.lobbyFor(MAYA)).mine[0].organizedByMe, true);
});

test("members see a request with the applicant's name; only the organizer answers it", async () => {
  const postId = (await lobby.lobbyFor(SAM)).others[0].id;
  await rejects(lobby.createJoinRequest(ANA, postId, ""), 409); // already in it
  const request = await lobby.createJoinRequest(SAM, postId, "Room for one more?");
  assert.equal(request.status, "pending");
  await rejects(lobby.createJoinRequest(SAM, postId, ""), 409); // one open request at a time

  const seen = (await lobby.lobbyFor(ANA)).requests.find((i) => i.request.id === request.id)!;
  assert.equal(seen.request.applicantName, "Sam Okafor");
  assert.equal(seen.request.message, "Room for one more?");
  assert.equal(seen.mayAnswer, false);
  assert.equal((await lobby.lobbyFor(MAYA)).pendingRequestCount, 1);
  assert.equal((await lobby.lobbyFor(ANA)).pendingRequestCount, 0);

  await rejects(lobby.respondToRequest(request.id, ANA, "accept"), 403);
  await rejects(lobby.respondToRequest(request.id, SAM, "accept"), 403);
  await rejects(lobby.respondToRequest(request.id, LEE, "accept"), 404);
  const accepted = await lobby.respondToRequest(request.id, MAYA, "accept");
  assert.equal(accepted.status, "accepted");
  assert.ok((await store.tripsFor(SAM)).some((t) => t.id === chicago.id), "Sam is in the trip");
  await rejects(lobby.respondToRequest(request.id, MAYA, "decline"), 409);

  // Leaving afterwards doesn't rewrite what happened.
  await store.leaveTrip(chicago.id, SAM);
  assert.equal((await lobby.requestFor(request.id, SAM)).status, "accepted");
});

test("accepting someone who joined meanwhile with the invite code just keeps them in", async () => {
  const postId = (await lobby.lobbyFor(LEE)).others.find((p) => p.tripId === chicago.id)!.id;
  const request = await lobby.createJoinRequest(LEE, postId, "");
  await store.joinTrip(chicago.inviteCode, LEE);
  assert.equal((await lobby.respondToRequest(request.id, MAYA, "accept")).status, "accepted");
  await store.leaveTrip(chicago.id, LEE);
});

test("a request can't be let into a trip that is over", async () => {
  const postId = (await lobby.lobbyFor(LEE)).others.find((p) => p.tripId === chicago.id)!.id;
  const request = await lobby.createJoinRequest(LEE, postId, "");
  await db.update(trips).set({ startDate: "2020-01-01", endDate: "2020-01-02" }).where(eq(trips.id, chicago.id));
  await rejects(lobby.respondToRequest(request.id, MAYA, "accept"), 409);
  await rejects(lobby.createJoinRequest(SAM, postId, ""), 409);
  await db.update(trips).set({ startDate: "2027-03-01", endDate: "2027-03-05" }).where(eq(trips.id, chicago.id));
  await lobby.withdrawRequest(request.id, LEE);
});

test("the applicant withdraws; an answer and a withdrawal at once leave one outcome", async () => {
  const postId = (await lobby.lobbyFor(LEE)).others.find((p) => p.tripId === chicago.id)!.id;
  const first = await lobby.createJoinRequest(LEE, postId, "");
  await rejects(lobby.withdrawRequest(first.id, MAYA), 403);
  assert.equal((await lobby.withdrawRequest(first.id, LEE)).closedBy, "asked");

  const second = await lobby.createJoinRequest(LEE, postId, "");
  let answer: Promise<unknown> = Promise.resolve();
  // While the request is locked, Maya's answer starts and waits; meanwhile Lee takes the request back.
  await db.transaction(async (tx) => {
    await tx.select().from(lobbyRequests).where(eq(lobbyRequests.id, second.id)).for("update");
    answer = lobby.respondToRequest(second.id, MAYA, "decline");
    answer.catch(() => {}); // awaited below
    await new Promise((resolve) => setTimeout(resolve, 300));
    await tx.update(lobbyRequests).set({ status: "declined", closedBy: "asked" }).where(eq(lobbyRequests.id, second.id));
  });
  await rejects(answer, 409);
  assert.equal((await lobby.requestFor(second.id, LEE)).closedBy, "asked", "the withdrawal stands");
});

test("taking a trip down closes the requests still waiting; only the organizer can", async () => {
  const postId = (await lobby.lobbyFor(LEE)).others.find((p) => p.tripId === chicago.id)!.id;
  const request = await lobby.createJoinRequest(LEE, postId, "");
  await rejects(lobby.unpublishPost(ANA, chicago.id), 403);
  await lobby.unpublishPost(MAYA, chicago.id);
  assert.equal((await lobby.requestFor(request.id, LEE)).closedBy, "gone");
  assert.equal((await lobby.lobbyFor(LEE)).requests.find((i) => i.request.id === request.id)?.gone, true);
  await rejects(lobby.unpublishPost(MAYA, chicago.id), 404);
});

test("the chat keeps who said what, in order, and goes with the trip", async () => {
  await lobby.addTripMessage(chicago.id, MAYA, "Train at 8?");
  await lobby.addTripMessage(chicago.id, ANA, "Works for me.");
  const chat = await lobby.messagesForTrip(chicago.id);
  assert.deepEqual(chat.map((m) => [m.senderName, m.body]), [["Maya Chen", "Train at 8?"], ["Ana Ruiz", "Works for me."]]);

  await lobby.publishPost(MAYA, chicago.id, "");
  await store.deleteTrip(chicago.id);
  for (const table of [lobbyPosts, lobbyRequests, tripMessages]) {
    assert.equal((await db.select().from(table).where(eq(table.tripId, chicago.id))).length, 0);
  }
});
