// Travel Bingo's rules, as pure functions: drawing a card, swapping a square, finding finished lines, matching a
// trip's destination to a region, and checking what people send in. Tested in lib/bingo.test.ts.
import { normalizePlace } from "./matching.ts";

/** Card sizes on offer. The proposal's default is 3×3. */
export const BINGO_SIZES = [3, 4, 5] as const;
export const DEFAULT_SIZE = 3;

/** A random number in [0, 1), like Math.random. Passed in so the tests can fix it. */
export type Rand = () => number;

/** `count` distinct items from `pool`, in random order, or null when the pool is too small. */
export function drawCard<T>(pool: readonly T[], count: number, rand: Rand = Math.random): T[] | null {
  if (pool.length < count) return null;
  const a = [...pool];
  // The first `count` steps of a Fisher–Yates shuffle.
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rand() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, count);
}

/** A random item from `pool` that isn't already on the card, or null when there's none left. */
export function pickReplacement<T>(pool: readonly T[], onCard: readonly T[], rand: Rand = Math.random): T | null {
  const left = pool.filter((t) => !onCard.includes(t));
  return left.length ? left[Math.floor(rand() * left.length)] : null;
}

/** Every row, column and the two diagonals of a size×size card, as positions (row by row from 0). */
export function bingoLines(size: number): number[][] {
  const range = Array.from({ length: size }, (_, i) => i);
  return [
    ...range.map((r) => range.map((c) => r * size + c)),
    ...range.map((c) => range.map((r) => r * size + c)),
    range.map((i) => i * size + i),
    range.map((i) => i * size + (size - 1 - i)),
  ];
}

/** The lines whose every square is done. `done` is indexed by position. */
export const finishedLines = (done: readonly boolean[], size: number) =>
  bingoLines(size).filter((line) => line.every((p) => done[p]));

/** True when a place names the region: "Chicago, IL", "chicago" and "Downtown Chicago" all name Chicago. */
export function inRegion(place: string, region: string): boolean {
  const p = normalizePlace(place);
  const r = normalizePlace(region);
  if (!p || !r) return false;
  return p === r || ` ${p} `.includes(` ${r} `);
}

/** The region a trip's destination falls in, preferring the most specific (longest) name. */
export function regionFor(destination: string, regions: readonly string[]): string | null {
  const hits = regions.filter((r) => inRegion(destination, r));
  return hits.sort((a, b) => b.length - a.length)[0] ?? null;
}

/**
 * The region as the library already spells it, when it has it under another spelling ("chicago, il" →
 * "Chicago"), so one place doesn't split into several libraries. Otherwise the input, tidied.
 */
export function canonicalRegion(input: string, known: readonly string[]): string {
  const n = normalizePlace(input);
  return known.find((k) => normalizePlace(k) === n) ?? input.trim().replace(/\s+/g, " ");
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export type TaskInput = { region: string; title: string; description: string };

/** Checks a task someone sends in. Returns the cleaned input, or the message to show. */
export function parseTaskInput(body: Record<string, unknown>): TaskInput | string {
  const region = text(body.region);
  const title = text(body.title);
  const description = text(body.description);
  if (!region) return "Say which city or area this task is in.";
  if (region.length > 60) return "Keep the area under 60 characters.";
  if (!title) return "Say what the task is.";
  if (title.length > 120) return "Keep the task under 120 characters. Put the details in the description.";
  if (description.length > 500) return "Keep the description under 500 characters.";
  return { region, title, description };
}

export type CardInput = { region: string; size: number };

/** Checks a request for a new card. Returns the cleaned input, or the message to show. */
export function parseCardInput(body: Record<string, unknown>): CardInput | string {
  const region = text(body.region);
  const size = body.size === undefined || body.size === null ? DEFAULT_SIZE : body.size;
  if (!region) return "Pick a region for the card.";
  if (!BINGO_SIZES.includes(size as (typeof BINGO_SIZES)[number])) return "Pick a 3×3, 4×4 or 5×5 card.";
  return { region, size: size as number };
}
