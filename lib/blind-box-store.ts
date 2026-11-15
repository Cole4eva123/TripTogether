import { randomInt, randomUUID } from "node:crypto";
import { demoOptions } from "./blind-box-catalog.ts";
import { drawBlindBox, eligibleOptions, parseBlindBoxOption, parseBlindBoxSettings } from "./blind-box.ts";
import type { BlindBoxOption, BlindBoxResult, BlindBoxSettings, BlindBoxView } from "./blind-box-types.ts";
import type { Member, PlanInput, Trip, User } from "./types.ts";
import { parsePlanInput } from "./validate.ts";

type Round = { id: string; settings: BlindBoxSettings; options: BlindBoxOption[]; result: BlindBoxResult | null; saved: boolean };
const globalStore = globalThis as { __blindBoxes?: Map<string, Round> };
const rounds = globalStore.__blindBoxes ??= new Map<string, Round>();
type Context = { trip: Trip; me: User; members: Member[] };

export class BlindBoxError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
function reject(status: number, message: string): never { throw new BlindBoxError(status, message); }
function organizer(ctx: Context) {
  if (ctx.trip.ownerId !== ctx.me.id) reject(403, "Only the organizer can start, reveal or reset a blind box.");
}
const activeOptions = (round: Round, ctx: Context) => round.options.filter((o) => ctx.members.some((m) => m.id === o.submittedBy));

export function blindBoxFor(ctx: Context): BlindBoxView | null {
  const round = rounds.get(ctx.trip.id);
  if (!round) return null;
  const options = activeOptions(round, ctx);
  const eligible = eligibleOptions(round.settings, [...demoOptions, ...options]);
  return {
    id: round.id, settings: round.settings, status: round.result ? "revealed" : "collecting",
    ownOptions: options.filter((o) => o.submittedBy === ctx.me.id),
    submissions: ctx.members.map((m) => ({ memberId: m.id, count: options.filter((o) => o.submittedBy === m.id).length })),
    eligibleCount: eligible.length, demoCount: eligible.filter((o) => o.submittedBy === null).length,
    revealedOptions: round.result ? options : null, result: round.result, saved: round.saved,
  };
}

export function startBlindBox(ctx: Context, body: Record<string, unknown>) {
  organizer(ctx);
  const previous = rounds.get(ctx.trip.id);
  if (previous && (!previous.result || previous.id !== body.previousRoundId)) reject(409, "A blind box is already open. Refresh before starting another.");
  if (!previous && body.previousRoundId) reject(409, "The blind box changed. Refresh and try again.");
  const settings = parseBlindBoxSettings(body, ctx.trip);
  if (typeof settings === "string") reject(400, settings);
  rounds.set(ctx.trip.id, { id: randomUUID(), settings, options: [], result: null, saved: false });
}

function currentRound(ctx: Context, roundId: unknown) {
  const round = rounds.get(ctx.trip.id);
  if (!round || round.id !== roundId) reject(409, "The blind box changed. Refresh and try again.");
  return round;
}

export const deleteBlindBox = (tripId: string) => { rounds.delete(tripId); };

export function resetBlindBox(ctx: Context, roundId: unknown) {
  organizer(ctx);
  currentRound(ctx, roundId);
  deleteBlindBox(ctx.trip.id);
}

/** Synchronous mutations keep reveal and save idempotent, even with simultaneous requests. */
export function changeBlindBox(ctx: Context, body: Record<string, unknown>, save: (plans: PlanInput[]) => void) {
  const round = currentRound(ctx, body.roundId);
  if (body.action === "reveal") {
    organizer(ctx);
    if (round.result) return;
    if (round.settings.date < ctx.trip.startDate || round.settings.date > ctx.trip.endDate) reject(400, "The trip dates changed. Reset the box and pick a day within the trip.");
    const result = drawBlindBox(round.settings, [...demoOptions, ...activeOptions(round, ctx)], randomInt);
    if (!result) reject(400, "No options fit this box. Add a matching hidden option, or reset the box with different limits.");
    round.result = result;
    return;
  }
  if (body.action === "save") {
    if (!round.result) reject(409, "Reveal the blind box before adding it to the itinerary.");
    if (round.saved) return;
    const plans = round.result.stops.map((stop) => parsePlanInput({
      date: round.settings.date, time: stop.time, title: stop.title, place: stop.place,
      note: `Blind box: $${stop.cost.toFixed(2)} per person; ${stop.durationMinutes} min. ${stop.note}`,
    }, ctx.trip));
    const error = plans.find((plan) => typeof plan === "string");
    if (typeof error === "string") reject(400, error);
    save(plans as PlanInput[]);
    round.saved = true;
    return;
  }
  if (round.result) reject(409, "This blind box is already revealed. Start another box to submit new ideas.");
  if (body.action === "submit") {
    if (round.options.filter((o) => o.submittedBy === ctx.me.id).length >= 10) reject(400, "Keep to 10 hidden options per person in each box.");
    const raw = body.option;
    const input = parseBlindBoxOption(raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {});
    if (typeof input === "string") reject(400, input);
    const option = { ...input, id: randomUUID(), destination: round.settings.destination, submittedBy: ctx.me.id, addedBy: ctx.me.name };
    if (!eligibleOptions(round.settings, [option]).length) reject(400, "Match the box's preferences, budget and available time before submitting.");
    round.options.push(option);
    return;
  }
  if (body.action === "remove") {
    const index = round.options.findIndex((o) => o.id === body.optionId && o.submittedBy === ctx.me.id);
    if (index < 0) reject(404, "This hidden option doesn't exist, or it isn't yours.");
    round.options.splice(index, 1);
    return;
  }
  reject(400, "Choose a valid blind box action.");
}
