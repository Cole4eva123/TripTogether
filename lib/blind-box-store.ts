// Travel blind box's data: each trip's current round and the ideas sealed into it, in PostgreSQL like the rest
// (tables in lib/db/schema.ts). The rules themselves are the pure functions in lib/blind-box.ts.
import { randomInt } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { demoOptions } from "./blind-box-catalog.ts";
import { drawBlindBox, eligibleOptions, parseBlindBoxOption, parseBlindBoxSettings } from "./blind-box.ts";
import type { BlindBoxOption, BlindBoxView } from "./blind-box-types.ts";
import { db, isUniqueViolation, ready } from "./db/client.ts";
import { blindBoxOptions, blindBoxRounds, planItems, users } from "./db/schema.ts";
import type { Member, PlanInput, Trip, User } from "./types.ts";
import { parsePlanInput } from "./validate.ts";

type Round = typeof blindBoxRounds.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Context = { trip: Trip; me: User; members: Member[] };

export class BlindBoxError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
function reject(status: number, message: string): never {
  throw new BlindBoxError(status, message);
}
function organizer(ctx: Context): void {
  if (ctx.trip.ownerId !== ctx.me.id) reject(403, "Only the organizer can start, reveal or reset a blind box.");
}

/** The round's ideas from people still in the trip. Ideas from someone who left stay out of the draw. */
async function activeOptions(q: Tx | typeof db, round: Round, ctx: Context): Promise<BlindBoxOption[]> {
  const rows = await q
    .select({ id: blindBoxOptions.id, idea: blindBoxOptions.idea, submittedBy: blindBoxOptions.submittedById, addedBy: users.name })
    .from(blindBoxOptions)
    .innerJoin(users, eq(users.id, blindBoxOptions.submittedById))
    .where(eq(blindBoxOptions.roundId, round.id))
    .orderBy(asc(blindBoxOptions.createdAt));
  return rows
    .filter((o) => ctx.members.some((m) => m.id === o.submittedBy))
    .map((o) => ({ ...o.idea, id: o.id, destination: round.settings.destination, submittedBy: o.submittedBy, addedBy: o.addedBy }));
}

export async function blindBoxFor(ctx: Context): Promise<BlindBoxView | null> {
  await ready();
  const [round] = await db.select().from(blindBoxRounds).where(eq(blindBoxRounds.tripId, ctx.trip.id));
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
    const [round] = await tx.select().from(blindBoxRounds).where(eq(blindBoxRounds.tripId, ctx.trip.id)).for("update");
    return change(tx, round);
  });
}

function current(round: Round | undefined, roundId: unknown): Round {
  if (!round || round.id !== roundId) reject(409, "The blind box changed. Refresh and try again.");
  return round;
}

export async function startBlindBox(ctx: Context, body: Record<string, unknown>): Promise<void> {
  organizer(ctx);
  const settings = parseBlindBoxSettings(body, ctx.trip);
  if (typeof settings === "string") reject(400, settings);
  try {
    await withRound(ctx, async (tx, previous) => {
      if (previous && (!previous.result || previous.id !== body.previousRoundId)) reject(409, "A blind box is already open. Refresh before starting another.");
      if (!previous && body.previousRoundId) reject(409, "The blind box changed. Refresh and try again.");
      if (previous) await tx.delete(blindBoxRounds).where(eq(blindBoxRounds.id, previous.id)); // its ideas go with it
      await tx.insert(blindBoxRounds).values({ tripId: ctx.trip.id, settings });
    });
  } catch (e) {
    // Two first rounds started at once: there was no row to lock, so the unique trip_id stops the second.
    if (isUniqueViolation(e)) reject(409, "A blind box is already open. Refresh before starting another.");
    throw e;
  }
}

export async function resetBlindBox(ctx: Context, roundId: unknown): Promise<void> {
  organizer(ctx);
  await withRound(ctx, async (tx, round) => {
    await tx.delete(blindBoxRounds).where(eq(blindBoxRounds.id, current(round, roundId).id));
  });
}

type Change = (tx: Tx, round: Round, ctx: Context, body: Record<string, unknown>) => Promise<void>;

function collecting(round: Round): void {
  if (round.result) reject(409, "This blind box is already revealed. Start another box to submit new ideas.");
}

/** What each PATCH action does, run with the trip's round row locked. Reveal and save are idempotent. */
const changes: Record<string, Change> = {
  async reveal(tx, round, ctx) {
    organizer(ctx);
    if (round.result) return;
    const { date } = round.settings;
    if (date < ctx.trip.startDate || date > ctx.trip.endDate) reject(400, "The trip dates changed. Reset the box and pick a day within the trip.");
    const result = drawBlindBox(round.settings, [...demoOptions, ...(await activeOptions(tx, round, ctx))], randomInt);
    if (!result) reject(400, "No options fit this box. Add a matching hidden option, or reset the box with different limits.");
    await tx.update(blindBoxRounds).set({ result }).where(eq(blindBoxRounds.id, round.id));
  },
  async save(tx, round, ctx) {
    if (!round.result) reject(409, "Reveal the blind box before adding it to the itinerary.");
    if (round.saved) return;
    const plans = round.result.stops.map((stop) => parsePlanInput({
      date: round.settings.date, time: stop.time, title: stop.title, place: stop.place,
      note: `Blind box: $${stop.cost.toFixed(2)} per person; ${stop.durationMinutes} min. ${stop.note}`,
    }, ctx.trip));
    const error = plans.find((plan) => typeof plan === "string");
    if (typeof error === "string") reject(400, error);
    // In the same transaction as `saved`, so the stops land once or not at all.
    await tx.insert(planItems).values((plans as PlanInput[]).map((plan) => ({ ...plan, tripId: ctx.trip.id, addedById: ctx.me.id })));
    await tx.update(blindBoxRounds).set({ saved: true }).where(eq(blindBoxRounds.id, round.id));
  },
  async submit(tx, round, ctx, body) {
    collecting(round);
    const mine = (await activeOptions(tx, round, ctx)).filter((o) => o.submittedBy === ctx.me.id);
    if (mine.length >= 10) reject(400, "Keep to 10 hidden options per person in each box.");
    const raw = body.option;
    const idea = parseBlindBoxOption(raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {});
    if (typeof idea === "string") reject(400, idea);
    const option = { ...idea, id: "", destination: round.settings.destination, submittedBy: ctx.me.id, addedBy: ctx.me.name };
    if (!eligibleOptions(round.settings, [option]).length) reject(400, "Match the box's preferences, budget and available time before submitting.");
    await tx.insert(blindBoxOptions).values({ roundId: round.id, submittedById: ctx.me.id, idea });
  },
  async remove(tx, round, ctx, body) {
    collecting(round);
    const mine = (await activeOptions(tx, round, ctx)).find((o) => o.id === body.optionId && o.submittedBy === ctx.me.id);
    if (!mine) reject(404, "This hidden option doesn't exist, or it isn't yours.");
    await tx.delete(blindBoxOptions).where(eq(blindBoxOptions.id, mine.id));
  },
};

/** Applies a PATCH body's action (a key of `changes`; anything else is refused) to the trip's current round. */
export async function changeBlindBox(ctx: Context, body: Record<string, unknown>): Promise<void> {
  const change = typeof body.action === "string" && Object.hasOwn(changes, body.action) ? changes[body.action] : null;
  if (!change) reject(400, "Choose a valid blind box action.");
  await withRound(ctx, (tx, round) => change(tx, current(round, body.roundId), ctx, body));
}
