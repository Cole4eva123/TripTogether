// Travel lottery box's data: each trip's current round and the ideas sealed into it, in PostgreSQL like the rest
// (tables in lib/db/schema.ts). The rules themselves are the pure functions in lib/lottery-box.ts.
import { randomInt } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { demoOptions } from "./lottery-box-catalog.ts";
import { drawLotteryBox, eligibleOptions, parseLotteryBoxOption, parseLotteryBoxSettings } from "./lottery-box.ts";
import type { LotteryBoxOption, LotteryBoxView } from "./lottery-box-types.ts";
import { db, isUniqueViolation, ready } from "./db/client.ts";
import { lotteryBoxOptions, lotteryBoxRounds, planItems, users } from "./db/schema.ts";
import type { Member, PlanInput, Trip, User } from "./types.ts";
import { parsePlanInput } from "./validate.ts";

type Round = typeof lotteryBoxRounds.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Context = { trip: Trip; me: User; members: Member[] };

export class LotteryBoxError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
function reject(status: number, message: string): never {
  throw new LotteryBoxError(status, message);
}
function organizer(ctx: Context): void {
  if (ctx.trip.ownerId !== ctx.me.id) reject(403, "Only the organizer can start, reveal or reset a lottery box.");
}

/** The round's ideas from people still in the trip. Ideas from someone who left stay out of the draw. */
async function activeOptions(q: Tx | typeof db, round: Round, ctx: Context): Promise<LotteryBoxOption[]> {
  const rows = await q
    .select({ id: lotteryBoxOptions.id, idea: lotteryBoxOptions.idea, submittedBy: lotteryBoxOptions.submittedById, addedBy: users.name })
    .from(lotteryBoxOptions)
    .innerJoin(users, eq(users.id, lotteryBoxOptions.submittedById))
    .where(eq(lotteryBoxOptions.roundId, round.id))
    .orderBy(asc(lotteryBoxOptions.createdAt));
  return rows
    .filter((o) => ctx.members.some((m) => m.id === o.submittedBy))
    .map((o) => ({ ...o.idea, id: o.id, destination: round.settings.destination, submittedBy: o.submittedBy, addedBy: o.addedBy }));
}

export async function lotteryBoxFor(ctx: Context): Promise<LotteryBoxView | null> {
  await ready();
  const [round] = await db.select().from(lotteryBoxRounds).where(eq(lotteryBoxRounds.tripId, ctx.trip.id));
  if (!round) return null;
  const options = await activeOptions(db, round, ctx);
  const eligible = eligibleOptions(round.settings, [...demoOptions, ...options]);
  return {
    id: round.id, settings: round.settings, status: round.result ? "revealed" : "collecting",
    ownOptions: options.filter((o) => o.submittedBy === ctx.me.id),
    submissions: ctx.members.map((m) => ({ memberId: m.id, count: options.filter((o) => o.submittedBy === m.id).length })),
    eligibleCount: eligible.length, demoCount: eligible.filter((o) => o.submittedBy === null).length,
    revealedOptions: round.result ? options : null, result: round.result, saved: round.saved,
  };
}

/** Runs `change` with the trip's round row locked, so writes to one round happen one at a time. */
async function withRound<T>(ctx: Context, change: (tx: Tx, round: Round | undefined) => Promise<T>): Promise<T> {
  await ready();
  return db.transaction(async (tx) => {
    const [round] = await tx.select().from(lotteryBoxRounds).where(eq(lotteryBoxRounds.tripId, ctx.trip.id)).for("update");
    return change(tx, round);
  });
}

function current(round: Round | undefined, roundId: unknown): Round {
  if (!round || round.id !== roundId) reject(409, "The lottery box changed. Refresh and try again.");
  return round;
}

export async function startLotteryBox(ctx: Context, body: Record<string, unknown>): Promise<void> {
  organizer(ctx);
  const settings = parseLotteryBoxSettings(body, ctx.trip);
  if (typeof settings === "string") reject(400, settings);
  try {
    await withRound(ctx, async (tx, previous) => {
      if (previous && (!previous.result || previous.id !== body.previousRoundId)) reject(409, "A lottery box is already open. Refresh before starting another.");
      if (!previous && body.previousRoundId) reject(409, "The lottery box changed. Refresh and try again.");
      if (previous) await tx.delete(lotteryBoxRounds).where(eq(lotteryBoxRounds.id, previous.id)); // its ideas go with it
      await tx.insert(lotteryBoxRounds).values({ tripId: ctx.trip.id, settings });
    });
  } catch (e) {
    // Two first rounds started at once: there was no row to lock, so the unique trip_id stops the second.
    if (isUniqueViolation(e)) reject(409, "A lottery box is already open. Refresh before starting another.");
    throw e;
  }
}

export async function resetLotteryBox(ctx: Context, roundId: unknown): Promise<void> {
  organizer(ctx);
  await withRound(ctx, async (tx, round) => {
    await tx.delete(lotteryBoxRounds).where(eq(lotteryBoxRounds.id, current(round, roundId).id));
  });
}

type Change = (tx: Tx, round: Round, ctx: Context, body: Record<string, unknown>) => Promise<void>;

function collecting(round: Round): void {
  if (round.result) reject(409, "This lottery box is already revealed. Start another box to submit new ideas.");
}

/** What each PATCH action does, run with the trip's round row locked. Reveal and save are idempotent. */
const changes: Record<string, Change> = {
  async reveal(tx, round, ctx) {
    organizer(ctx);
    if (round.result) return;
    const { date } = round.settings;
    if (date < ctx.trip.startDate || date > ctx.trip.endDate) reject(400, "The trip dates changed. Reset the box and pick a day within the trip.");
    const result = drawLotteryBox(round.settings, [...demoOptions, ...(await activeOptions(tx, round, ctx))], randomInt);
    if (!result) reject(400, "No options fit this box. Add a matching hidden option, or reset the box with different limits.");
    await tx.update(lotteryBoxRounds).set({ result }).where(eq(lotteryBoxRounds.id, round.id));
  },
  async save(tx, round, ctx) {
    if (!round.result) reject(409, "Reveal the lottery box before adding it to the itinerary.");
    if (round.saved) return;
    const plans = round.result.stops.map((stop) => parsePlanInput({
      date: round.settings.date, time: stop.time, title: stop.title, place: stop.place,
      note: `Lottery box: $${stop.cost.toFixed(2)} per person; ${stop.durationMinutes} min. ${stop.note}`,
    }, ctx.trip));
    const error = plans.find((plan) => typeof plan === "string");
    if (typeof error === "string") reject(400, error);
    // In the same transaction as `saved`, so the stops land once or not at all.
    await tx.insert(planItems).values((plans as PlanInput[]).map((plan) => ({ ...plan, tripId: ctx.trip.id, addedById: ctx.me.id })));
    await tx.update(lotteryBoxRounds).set({ saved: true }).where(eq(lotteryBoxRounds.id, round.id));
  },
  async submit(tx, round, ctx, body) {
    collecting(round);
    const mine = (await activeOptions(tx, round, ctx)).filter((o) => o.submittedBy === ctx.me.id);
    if (mine.length >= 10) reject(400, "Keep to 10 hidden options per person in each box.");
    const raw = body.option;
    const idea = parseLotteryBoxOption(raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {});
    if (typeof idea === "string") reject(400, idea);
    const option = { ...idea, id: "", destination: round.settings.destination, submittedBy: ctx.me.id, addedBy: ctx.me.name };
    if (!eligibleOptions(round.settings, [option]).length) reject(400, "Match the box's preferences, budget and available time before submitting.");
    await tx.insert(lotteryBoxOptions).values({ roundId: round.id, submittedById: ctx.me.id, idea });
  },
  async remove(tx, round, ctx, body) {
    collecting(round);
    const mine = (await activeOptions(tx, round, ctx)).find((o) => o.id === body.optionId && o.submittedBy === ctx.me.id);
    if (!mine) reject(404, "This hidden option doesn't exist, or it isn't yours.");
    await tx.delete(lotteryBoxOptions).where(eq(lotteryBoxOptions.id, mine.id));
  },
};

/** Applies a PATCH body's action (a key of `changes`; anything else is refused) to the trip's current round. */
export async function changeLotteryBox(ctx: Context, body: Record<string, unknown>): Promise<void> {
  const change = typeof body.action === "string" && Object.hasOwn(changes, body.action) ? changes[body.action] : null;
  if (!change) reject(400, "Choose a valid lottery box action.");
  await withRound(ctx, (tx, round) => change(tx, current(round, body.roundId), ctx, body));
}
