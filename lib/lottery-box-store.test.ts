// The lottery box store against the PostgreSQL test database, emptied and migrated for this file (lib/db/test-db.ts).
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { eq } from "drizzle-orm";
import type { LotteryBoxSettings } from "./lottery-box-types.ts";

const { freshDatabase } = await import("./db/test-db.ts");
const { lotteryBoxRounds, users } = await import("./db/schema.ts");
let db: Awaited<ReturnType<typeof freshDatabase>>;
const store = await import("./store.ts");
const { lotteryBoxFor, LotteryBoxError, changeLotteryBox, resetLotteryBox, startLotteryBox } = await import("./lottery-box-store.ts");

const OWNER = "user-owner";
const MEMBER = "user-member";
const people: Record<string, { id: string; name: string; email: string }> = {
  [OWNER]: { id: OWNER, name: "Organizer", email: "owner@example.test" },
  [MEMBER]: { id: MEMBER, name: "Member", email: "member@example.test" },
};
const settings: LotteryBoxSettings = { destination: "Test city", date: "2026-11-28", startTime: "09:00", budget: 50, availableMinutes: 180, maxStops: 3, preferences: ["Food", "Outdoors"] };
const input = { title: "Secret picnic", place: "Test park", category: "Outdoors" as const, cost: 10, durationMinutes: 45, note: "Bring snacks" };
const isStatus = (status: number) => (error: unknown) => error instanceof LotteryBoxError && error.status === status;

before(async () => {
  db = await freshDatabase();
  await db.insert(users).values(Object.values(people));
});

/** A fresh trip with both people in it, and a way to act as either of them. */
async function newTrip() {
  const trip = await store.createTrip(OWNER, { origin: "Urbana", destination: "Test city", startDate: "2026-11-27", endDate: "2026-11-30" });
  await store.joinTrip(trip.inviteCode, MEMBER);
  return async (me = OWNER) => {
    const found = (await store.tripFor(trip.id, me))!;
    return { ...found, me: people[me] };
  };
}

test("shared round keeps others' ideas secret, protects ownership and stale rounds, reveals and saves once", async () => {
  const as = await newTrip();
  await assert.rejects(startLotteryBox(await as(MEMBER), settings), isStatus(403));
  await startLotteryBox(await as(), settings);
  const roundId = (await lotteryBoxFor(await as()))!.id;
  const action = async (body: Record<string, unknown>, me = OWNER) => changeLotteryBox(await as(me), { roundId, ...body });
  await assert.rejects(startLotteryBox(await as(), settings), isStatus(409));
  await assert.rejects(action({ roundId: "stale", action: "submit", option: input }, MEMBER), isStatus(409));
  await action({ action: "submit", option: { ...input, submittedBy: OWNER } }, MEMBER);
  const ownerView = (await lotteryBoxFor(await as()))!;
  assert.equal(ownerView.ownOptions.length, 0);
  assert.equal(ownerView.revealedOptions, null);
  assert.equal(ownerView.result, null);
  assert.ok(!JSON.stringify(ownerView).includes("Secret picnic"));
  assert.equal(ownerView.submissions.find((s) => s.memberId === MEMBER)!.count, 1);
  const own = (await lotteryBoxFor(await as(MEMBER)))!.ownOptions[0];
  assert.equal(own.submittedBy, MEMBER);
  await assert.rejects(action({ action: "remove", optionId: own.id }), isStatus(404));
  await assert.rejects(action({ action: "reveal" }, MEMBER), isStatus(403));
  await assert.rejects(resetLotteryBox(await as(MEMBER), roundId), isStatus(403));
  await assert.rejects(action({ action: "save" }), isStatus(409));
  await action({ action: "reveal" });
  const revealed = JSON.stringify((await lotteryBoxFor(await as()))!.result);
  await action({ action: "reveal" });
  assert.equal(JSON.stringify((await lotteryBoxFor(await as()))!.result), revealed);
  assert.equal((await lotteryBoxFor(await as()))!.revealedOptions![0].title, input.title);
  await assert.rejects(action({ action: "submit", option: input }, MEMBER), isStatus(409));
  // Two saves at once still add the stops once: the round row is locked while a save runs.
  const [memberCtx, ownerCtx] = [await as(MEMBER), await as()];
  await Promise.all([changeLotteryBox(memberCtx, { roundId, action: "save" }), changeLotteryBox(ownerCtx, { roundId, action: "save" })]);
  const { items } = await as();
  const stops = (await lotteryBoxFor(await as()))!.result!.stops;
  assert.equal(items.length, stops.length);
  assert.equal(items[0].date, settings.date);
  assert.equal(items[0].time, settings.startTime);
  assert.equal((await lotteryBoxFor(await as()))!.saved, true);
  await startLotteryBox(await as(), { ...settings, previousRoundId: roundId });
  await assert.rejects(action({ action: "reveal" }), isStatus(409));
  assert.equal((await as()).items.length, stops.length, "a new round keeps the saved plans");
});

test("no-match reveal stays sealed, options must fit, departed members are excluded and own options can be withdrawn", async () => {
  const as = await newTrip();
  await startLotteryBox(await as(), settings);
  const roundId = (await lotteryBoxFor(await as()))!.id;
  const change = async (body: Record<string, unknown>, me = OWNER) => changeLotteryBox(await as(me), { roundId, ...body });
  await assert.rejects(change({ action: "reveal" }), isStatus(400));
  assert.equal((await lotteryBoxFor(await as()))!.status, "collecting");
  await assert.rejects(change({ action: "submit", option: { ...input, cost: 100 } }), isStatus(400));
  await change({ action: "submit", option: input }, MEMBER);
  const withoutMember = { ...(await as()), members: (await as()).members.filter((m) => m.id !== MEMBER) };
  await assert.rejects(changeLotteryBox(withoutMember, { roundId, action: "reveal" }), isStatus(400));
  const optionId = (await lotteryBoxFor(await as(MEMBER)))!.ownOptions[0].id;
  await assert.rejects(change({ action: "remove", optionId: "not-an-id" }, MEMBER), isStatus(404));
  await change({ action: "remove", optionId }, MEMBER);
  assert.equal((await lotteryBoxFor(await as()))!.eligibleCount, 0);
  await resetLotteryBox(await as(), roundId);
  assert.equal(await lotteryBoxFor(await as()), null);
});

test("date changes block stale reveal or save without partially saving plans", async () => {
  const as = await newTrip();
  await startLotteryBox(await as(), settings);
  const roundId = (await lotteryBoxFor(await as()))!.id;
  const changed = async () => { const c = await as(); return { ...c, trip: { ...c.trip, endDate: "2026-11-27" } }; };
  await changeLotteryBox(await as(), { roundId, action: "submit", option: input });
  await assert.rejects(changeLotteryBox(await changed(), { roundId, action: "reveal" }), isStatus(400));
  await changeLotteryBox(await as(), { roundId, action: "reveal" });
  await assert.rejects(changeLotteryBox(await changed(), { roundId, action: "save" }), isStatus(400));
  assert.equal((await lotteryBoxFor(await as()))!.saved, false);
  assert.equal((await as()).items.length, 0);
});

test("two first rounds started at once leave one, and deleting the trip deletes its box", async () => {
  const as = await newTrip();
  const ctx = await as();
  const results = await Promise.allSettled([startLotteryBox(ctx, settings), startLotteryBox(ctx, settings)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(results.some((r) => r.status === "rejected" && isStatus(409)(r.reason)));
  await store.deleteTrip(ctx.trip.id);
  assert.equal(await lotteryBoxFor(ctx), null);
});

test("a write waits while another one holds the round", async () => {
  const as = await newTrip();
  await startLotteryBox(await as(), settings);
  const roundId = (await lotteryBoxFor(await as()))!.id;
  const ctx = await as(MEMBER);
  await changeLotteryBox(ctx, { roundId, action: "submit", option: input });
  const optionId = (await lotteryBoxFor(ctx))!.ownOptions[0].id;
  let settled = false;
  // Removing an idea touches only its own row, so only the round lock in withRound can make it wait.
  await db.transaction(async (tx) => {
    await tx.select().from(lotteryBoxRounds).where(eq(lotteryBoxRounds.id, roundId)).for("update");
    void changeLotteryBox(ctx, { roundId, action: "remove", optionId }).finally(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(settled, false, "the remove is still waiting for the lock");
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(settled, true, "it ran once the lock was released");
  assert.equal((await lotteryBoxFor(ctx))!.ownOptions.length, 0);
});
