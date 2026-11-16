// The trip store against the PostgreSQL test database, emptied and migrated for this file (lib/db/test-db.ts).
import assert from "node:assert/strict";
import { before, test } from "node:test";

const { freshDatabase } = await import("./db/test-db.ts");
const { users } = await import("./db/schema.ts");
const store = await import("./store.ts");
let db: Awaited<ReturnType<typeof freshDatabase>>;

const MAYA = "user-maya";
const SAM = "user-sam";
const trip = { origin: "Champaign, IL", destination: "Chicago", startDate: "2026-11-27", endDate: "2026-11-30" };

before(async () => {
  db = await freshDatabase();
  // Better Auth owns sign-up; here the users are put in directly.
  await db.insert(users).values([
    { id: MAYA, name: "Maya Chen", email: "maya@example.com" },
    { id: SAM, name: "Sam Okafor", email: "sam@example.com" },
  ]);
});

test("creating a trip makes the creator its organizer and only member", async () => {
  const t = await store.createTrip(MAYA, trip);
  assert.equal(t.ownerId, MAYA);
  assert.equal(t.memberCount, 1);
  assert.match(t.inviteCode, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.deepEqual(await store.tripsFor(SAM), []);
  const found = await store.tripFor(t.id, MAYA);
  assert.deepEqual(found?.members, [{ id: MAYA, name: "Maya Chen" }]);
  assert.equal(await store.tripFor(t.id, SAM), null, "not a member yet");
});

test("joining by code adds a member once, and leaving takes them off", async () => {
  const t = await store.createTrip(MAYA, trip);
  assert.equal(await store.joinTrip("NOCODE", SAM), null);
  assert.equal((await store.joinTrip(t.inviteCode, SAM))?.memberCount, 2);
  assert.equal((await store.joinTrip(t.inviteCode, SAM))?.memberCount, 2, "joining twice changes nothing");
  assert.deepEqual(
    (await store.tripFor(t.id, SAM))?.members.map((m) => m.name),
    ["Maya Chen", "Sam Okafor"],
  );
  await store.leaveTrip(t.id, SAM);
  assert.equal(await store.tripFor(t.id, SAM), null);
});

test("trips are listed by start date", async () => {
  const later = await store.createTrip(SAM, { ...trip, startDate: "2027-01-02", endDate: "2027-01-03" });
  const sooner = await store.createTrip(SAM, { ...trip, startDate: "2026-12-01", endDate: "2026-12-02" });
  const ids = (await store.tripsFor(SAM)).map((t) => t.id);
  assert.ok(ids.indexOf(sooner.id) < ids.indexOf(later.id));
});

test("plan items keep who added them, update, delete, and go with the trip", async () => {
  const t = await store.createTrip(MAYA, trip);
  await store.joinTrip(t.inviteCode, SAM);
  const plan = { date: "2026-11-28", time: null, title: "Art Institute", place: "111 S Michigan Ave", note: "" };
  const item = await store.addItem(t.id, SAM, plan);
  assert.equal(item.addedBy, "Sam Okafor");
  const changed = await store.updateItem(t.id, item.id, { ...plan, time: "10:30" });
  assert.equal(changed?.time, "10:30");
  assert.equal(await store.updateItem(t.id, "not-an-id", plan), null);
  const other = await store.createTrip(MAYA, trip);
  assert.equal(await store.updateItem(other.id, item.id, plan), null, "an item belongs to its own trip only");
  assert.equal(await store.deleteItem(t.id, item.id), true);
  assert.equal(await store.deleteItem(t.id, item.id), false);

  await store.addItem(t.id, MAYA, plan);
  await store.deleteTrip(t.id);
  assert.equal(await store.tripFor(t.id, MAYA), null);
});

test("editing a trip keeps its code and members", async () => {
  const t = await store.createTrip(MAYA, trip);
  await store.joinTrip(t.inviteCode, SAM);
  const edited = await store.updateTrip(t.id, { ...trip, destination: "Milwaukee" });
  assert.equal(edited.destination, "Milwaukee");
  assert.equal(edited.inviteCode, t.inviteCode);
  assert.equal(edited.memberCount, 2);
});

test("a malformed trip id reads as no trip instead of a database error", async () => {
  assert.equal(await store.tripFor("nope", MAYA), null);
});
