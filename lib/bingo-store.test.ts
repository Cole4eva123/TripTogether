// Travel Bingo's store against the PostgreSQL test database, emptied and migrated for this file (lib/db/test-db.ts).
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { eq } from "drizzle-orm";

const { freshDatabase } = await import("./db/test-db.ts");
const { isUniqueViolation } = await import("./db/client.ts");
const { bingoCells, bingoTasks, users } = await import("./db/schema.ts");
const store = await import("./store.ts");
const bingo = await import("./bingo-store.ts");
const { STARTER_TASKS } = await import("./bingo-catalog.ts");
let db: Awaited<ReturnType<typeof freshDatabase>>;

const MAYA = "user-maya";
const SAM = "user-sam";
const ADMIN = "user-admin";
let tripId = "";

before(async () => {
  db = await freshDatabase();
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

/** The starter challenge of a region. */
const starter = async (region: string) => (await bingo.challenges(region)).find((c) => c.createdBy === null)!;

test("each starter region has a starter challenge of its first nine tasks, once", async () => {
  const all = await bingo.challenges();
  assert.deepEqual(all.map((c) => c.region).sort(), Object.keys(STARTER_TASKS).sort());
  const chicago = await starter("Chicago");
  assert.equal(chicago.size, 3);
  assert.deepEqual(chicago.tasks.map((t) => t.title), STARTER_TASKS.Chicago.slice(0, 9).map(([title]) => title));
});

test("a trip starts with no card, and taking a challenge copies its squares in order", async () => {
  assert.equal(await bingo.cardFor(tripId), null);
  const challenge = await starter("Chicago");
  const card = await bingo.chooseChallenge(tripId, SAM, challenge.id, false); // any member picks the first
  assert.deepEqual(card.challenge, { id: challenge.id, title: challenge.title });
  assert.equal(card.region, "Chicago");
  assert.equal(card.createdBy, "Sam Okafor");
  assert.deepEqual(card.cells.map((c) => c.task.id), challenge.tasks.map((t) => t.id));
  assert.deepEqual(card.cells.map((c) => c.position), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(card.completed, 0);
  await rejects(bingo.chooseChallenge(tripId, MAYA, "not-an-id", true), 404);
});

const sam = { id: SAM, admin: false };
const maya = { id: MAYA, admin: false };
const admin = { id: MAYA, admin: true };

test("any member checks squares off, and a full row is a Bingo", async () => {
  let card = (await bingo.cardFor(tripId))!;
  const row = card.cells.slice(0, 3);
  card = await bingo.markCell(tripId, row[0].id, sam, true);
  card = await bingo.markCell(tripId, row[1].id, maya, true);
  assert.deepEqual(card.lines, []);
  card = await bingo.markCell(tripId, row[2].id, sam, true);
  assert.equal(card.completed, 3);
  assert.deepEqual(card.lines, [[0, 1, 2]]);
  assert.equal(card.cells[0].completedBy, "Sam Okafor");
  assert.ok(card.cells[0].completedAt);

  assert.equal(card.cells[0].completedById, SAM);
});

test("only the member who checked a square off, or an admin, can undo it", async () => {
  let card = (await bingo.cardFor(tripId))!;
  const [samsSquare, mayasSquare, samsOther] = card.cells;
  // Maya, not an admin, can't take back Sam's square, nor take it over by checking it again.
  await rejects(bingo.markCell(tripId, samsSquare.id, maya, false), 403);
  card = await bingo.markCell(tripId, samsSquare.id, maya, true);
  assert.equal(card.cells[0].completedById, SAM, "checking a done square again keeps who did it");

  // Each undoes their own.
  card = await bingo.markCell(tripId, mayasSquare.id, maya, false);
  assert.equal(card.cells[1].completedBy, null);
  assert.deepEqual(card.lines, []);
  // An admin undoes anyone's.
  card = await bingo.markCell(tripId, samsOther.id, admin, false);
  assert.equal(card.cells[2].completedBy, null);
  // Undoing a square that isn't done is harmless.
  card = await bingo.markCell(tripId, mayasSquare.id, sam, false);
  assert.equal(card.completed, 1);
});

test("an undo never wipes a check someone else made after it looked", async () => {
  const square = (await bingo.cardFor(tripId))!.cells[5];
  await bingo.markCell(tripId, square.id, sam, true);
  let undo: Promise<unknown> = Promise.resolve();
  // While the square is locked, Sam's undo reads it as his and then waits; meanwhile his check gives way to Maya's.
  await db.transaction(async (tx) => {
    await tx.select().from(bingoCells).where(eq(bingoCells.id, square.id)).for("update");
    undo = bingo.markCell(tripId, square.id, sam, false);
    undo.catch(() => {}); // awaited below
    await new Promise((resolve) => setTimeout(resolve, 300));
    await tx.update(bingoCells).set({ completedById: MAYA, completedAt: new Date() }).where(eq(bingoCells.id, square.id));
  });
  await rejects(undo, 409);
  assert.equal((await bingo.cardFor(tripId))!.cells[5].completedById, MAYA);
  await bingo.markCell(tripId, square.id, maya, false);
});

test("a square from another trip's card can't be touched", async () => {
  const other = await store.createTrip(SAM, {
    origin: "Urbana, IL",
    destination: "Nashville",
    startDate: "2027-01-08",
    endDate: "2027-01-11",
  });
  const theirs = await bingo.chooseChallenge(other.id, SAM, (await starter("Nashville")).id, false);
  await rejects(bingo.markCell(tripId, theirs.cells[0].id, maya, true), 404);
  await rejects(bingo.markCell(tripId, "not-an-id", maya, true), 404);
  // Deleting the trip takes its card with it.
  await store.deleteTrip(other.id);
  assert.equal(await bingo.cardFor(other.id), null);
});

test("only the organizer or an admin can switch challenges, which starts the card over", async () => {
  const before = (await bingo.cardFor(tripId))!;
  assert.ok(before.completed > 0);
  const other = await bingo.publishChallenge(ADMIN, {
    region: "chicago, il",
    title: "Loop day",
    description: "",
    size: 3,
    taskIds: (await bingo.tasksIn("Chicago")).slice(3, 12).map((t) => t.id),
  });
  assert.equal(other.region, "Chicago", "joins the library's spelling");
  await rejects(bingo.chooseChallenge(tripId, SAM, other.id, false), 403);
  assert.equal((await bingo.cardFor(tripId))!.id, before.id, "the card is kept");
  const after = await bingo.chooseChallenge(tripId, MAYA, other.id, true);
  assert.equal(after.challenge.title, "Loop day");
  assert.equal(after.completed, 0);
  assert.equal(after.cells[0].task.id, other.tasks[0].id);
});

test("a challenge takes only approved tasks of its own region, and withdrawing one keeps the cards playing it", async () => {
  const chicago = (await bingo.tasksIn("Chicago")).slice(0, 9).map((t) => t.id);
  const nashville = (await bingo.tasksIn("Nashville"))[0].id;
  const input = { region: "Chicago", title: "Mixed up", description: "", size: 3, taskIds: [...chicago.slice(1), nashville] };
  await rejects(bingo.publishChallenge(ADMIN, input), 400);
  const live = await bingo.publishChallenge(ADMIN, { ...input, taskIds: chicago });
  assert.equal(live.createdBy, "Ada Admin");
  const playing = (await bingo.cardFor(tripId))!;
  await bingo.withdrawChallenge(playing.challenge.id);
  assert.ok(!(await bingo.challenges("Chicago")).some((c) => c.id === playing.challenge.id), "off offer");
  assert.equal((await bingo.cardFor(tripId))!.id, playing.id, "the trip keeps playing it");
  await rejects(bingo.chooseChallenge(tripId, MAYA, playing.challenge.id, true), 404);
  await rejects(bingo.withdrawChallenge(playing.challenge.id), 404);
});

test("two first picks at once leave one card", async () => {
  const t = await store.createTrip(MAYA, { origin: "Urbana", destination: "Chicago", startDate: "2027-02-01", endDate: "2027-02-02" });
  const id = (await starter("Chicago")).id;
  const results = await Promise.allSettled([bingo.chooseChallenge(t.id, MAYA, id, false), bingo.chooseChallenge(t.id, MAYA, id, false)]);
  const failed = results.filter((r) => r.status === "rejected");
  assert.equal(failed.length, 1, "the second is refused");
  for (const r of failed) assert.ok(r.reason instanceof bingo.BingoError && [403, 409].includes(r.reason.status));
  assert.ok(await bingo.cardFor(t.id));
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

test("the database refuses a second live copy of a region's task, whatever its case", async () => {
  // submitTask checks first; this index covers two people sending the same task in at the same moment.
  await db.insert(bingoTasks).values({ region: "Chicago", title: "Ride the Brown Line loop" });
  await assert.rejects(db.insert(bingoTasks).values({ region: "Chicago", title: "ride the brown line LOOP" }), isUniqueViolation);
  await db.insert(bingoTasks).values({ region: "Chicago", title: "Ride the brown line loop", status: "rejected" }); // turned-down copies don't count
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

test("taking a task out of the library withdraws the challenges that use it", async () => {
  const chicago = await starter("Chicago");
  await bingo.removeTask(chicago.tasks[4].id, ADMIN);
  assert.ok(!(await bingo.challenges("Chicago")).some((c) => c.id === chicago.id));
  assert.ok(await starter("Nashville"), "challenges without it stay on offer");
});
