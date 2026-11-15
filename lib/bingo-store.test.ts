// Travel Bingo's store against a real PostgreSQL: an in-memory PGlite with the app's migrations applied.
import assert from "node:assert/strict";
import { before, test } from "node:test";

process.env.DATABASE_URL = "memory://";
const { db, ready } = await import("./db/client.ts");
const { users } = await import("./db/schema.ts");
const store = await import("./store.ts");
const bingo = await import("./bingo-store.ts");
const { STARTER_TASKS } = await import("./bingo-catalog.ts");

const MAYA = "user-maya";
const SAM = "user-sam";
const ADMIN = "user-admin";
let tripId = "";

before(async () => {
  await ready();
  await db.insert(users).values([
    { id: MAYA, name: "Maya Chen", email: "maya@example.com" },
    { id: SAM, name: "Sam Okafor", email: "sam@example.com" },
    { id: ADMIN, name: "Ada Admin", email: "admin@example.com" },
  ]);
  const t = await store.createTrip(MAYA, {
    origin: "Champaign, IL",
    destination: "Chicago, IL",
    startDate: "2026-11-27",
    endDate: "2026-11-30",
  });
  await store.joinTrip(t.inviteCode, SAM);
  tripId = t.id;
});

const rejects = (p: Promise<unknown>, status: number) =>
  assert.rejects(p, (e: unknown) => e instanceof bingo.BingoError && e.status === status);

test("the starter library is there on first use, once", async () => {
  const regions = await bingo.regions();
  assert.deepEqual(
    regions.map((r) => r.region),
    Object.keys(STARTER_TASKS).sort(),
  );
  assert.equal(regions.find((r) => r.region === "Chicago")?.taskCount, STARTER_TASKS.Chicago.length);
  assert.equal((await bingo.tasksIn("Chicago")).length, STARTER_TASKS.Chicago.length);
});

test("a trip starts with no card, and a drawn 3×3 card has 9 different Chicago tasks", async () => {
  assert.equal(await bingo.cardFor(tripId), null);
  const card = await bingo.createCard(tripId, MAYA, "Chicago", 3);
  assert.equal(card.size, 3);
  assert.equal(card.region, "Chicago");
  assert.equal(card.createdBy, "Maya Chen");
  assert.deepEqual(
    card.cells.map((c) => c.position),
    [0, 1, 2, 3, 4, 5, 6, 7, 8],
  );
  assert.equal(new Set(card.cells.map((c) => c.task.id)).size, 9);
  const chicago = new Set((await bingo.tasksIn("Chicago")).map((t) => t.id));
  assert.ok(card.cells.every((c) => chicago.has(c.task.id)));
  assert.equal(card.completed, 0);
  assert.deepEqual(card.lines, []);
});

test("a region too small for the card is refused with the numbers", async () => {
  await rejects(bingo.createCard(tripId, MAYA, "Chicago", 5), 400);
  await rejects(bingo.createCard(tripId, MAYA, "Atlantis", 3), 400);
  assert.equal((await bingo.cardFor(tripId))?.size, 3, "the old card is kept");
});

test("any member checks squares off, and a full row is a Bingo", async () => {
  let card = (await bingo.cardFor(tripId))!;
  const row = card.cells.slice(0, 3);
  card = await bingo.markCell(tripId, row[0].id, SAM, true);
  card = await bingo.markCell(tripId, row[1].id, MAYA, true);
  assert.deepEqual(card.lines, []);
  card = await bingo.markCell(tripId, row[2].id, SAM, true);
  assert.equal(card.completed, 3);
  assert.deepEqual(card.lines, [[0, 1, 2]]);
  assert.equal(card.cells[0].completedBy, "Sam Okafor");
  assert.ok(card.cells[0].completedAt);

  card = await bingo.markCell(tripId, row[1].id, SAM, false);
  assert.equal(card.cells[1].completedBy, null);
  assert.deepEqual(card.lines, []);
});

test("a square can be swapped for a random task or a chosen one, and starts over", async () => {
  let card = (await bingo.cardFor(tripId))!;
  const square = card.cells[0]; // checked off above
  card = await bingo.replaceCell(tripId, square.id, null);
  const swapped = card.cells[0];
  assert.notEqual(swapped.task.id, square.task.id);
  assert.equal(swapped.completedBy, null);
  assert.equal(new Set(card.cells.map((c) => c.task.id)).size, 9, "never a task already on the card");

  const spare = (await bingo.tasksIn("Chicago")).find((t) => !card.cells.some((c) => c.task.id === t.id))!;
  card = await bingo.replaceCell(tripId, square.id, spare.id);
  assert.equal(card.cells[0].task.id, spare.id);
  await rejects(bingo.replaceCell(tripId, square.id, card.cells[1].task.id), 409);
  const nashville = (await bingo.tasksIn("Nashville"))[0];
  await rejects(bingo.replaceCell(tripId, square.id, nashville.id), 400);
});

test("a square from another trip's card can't be touched", async () => {
  const other = await store.createTrip(SAM, {
    origin: "Urbana, IL",
    destination: "Nashville",
    startDate: "2027-01-08",
    endDate: "2027-01-11",
  });
  const theirs = await bingo.createCard(other.id, SAM, "Nashville", 3);
  await rejects(bingo.markCell(tripId, theirs.cells[0].id, MAYA, true), 404);
  await rejects(bingo.markCell(tripId, "not-an-id", MAYA, true), 404);
  // Deleting the trip takes its card with it.
  await store.deleteTrip(other.id);
  assert.equal(await bingo.cardFor(other.id), null);
});

test("drawing again replaces the card", async () => {
  const before = (await bingo.cardFor(tripId))!;
  const after = await bingo.createCard(tripId, SAM, "Chicago", 3);
  assert.notEqual(after.id, before.id);
  assert.equal(after.completed, 0);
  assert.equal(after.createdBy, "Sam Okafor");
});

test("a task sent in waits for review, then joins the library when approved", async () => {
  const task = await bingo.submitTask(SAM, { region: "chicago, il", title: "Swim at North Avenue Beach", description: "" });
  assert.equal(task.region, "Chicago", "joins the existing region");
  assert.equal(task.status, "pending");
  assert.equal(task.submittedBy, "Sam Okafor");
  assert.ok(!(await bingo.tasksIn("Chicago")).some((t) => t.id === task.id), "not in the library yet");
  await rejects(bingo.submitTask(MAYA, { region: "Chicago", title: "swim at north avenue beach", description: "" }), 409);
  await rejects(bingo.submitTask(MAYA, { region: "Chicago", title: "Eat a deep-dish pizza", description: "" }), 409);

  assert.deepEqual((await bingo.pendingTasks()).map((t) => t.id), [task.id]);
  const approved = await bingo.reviewTask(task.id, ADMIN, "approve", "");
  assert.equal(approved.status, "approved");
  assert.ok((await bingo.tasksIn("Chicago")).some((t) => t.id === task.id));
  await rejects(bingo.reviewTask(task.id, ADMIN, "reject", ""), 409);
  await rejects(bingo.reviewTask("not-an-id", ADMIN, "approve", ""), 404);
});

test("a turned-down task stays out, says why, and can be sent in again", async () => {
  const task = await bingo.submitTask(MAYA, { region: "Denver", title: "Climb a fourteener", description: "" });
  const rejected = await bingo.reviewTask(task.id, ADMIN, "reject", "Too far from Denver itself.");
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.reviewNote, "Too far from Denver itself.");
  assert.ok(!(await bingo.regions()).some((r) => r.region === "Denver"), "a region needs an approved task to show");
  const mine = await bingo.submissionsBy(MAYA);
  assert.equal(mine[0].id, task.id);
  const again = await bingo.submitTask(MAYA, { region: "Denver", title: "Climb a fourteener", description: "Mt. Evans" });
  assert.equal(again.status, "pending");
});
