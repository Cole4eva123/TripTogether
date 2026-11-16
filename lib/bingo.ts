// Travel Bingo's rules, as pure functions: finding finished lines, matching a trip's destination to a region, and
// checking what people send in, tasks and challenges. Tested in lib/bingo.test.ts.

// Place names, read as plain text so this module stays small enough for the browser (the lobby's gazetteer in
// lib/places.ts is server-only and far bigger than Bingo needs): "Chicago, IL" names the Chicago library.

/** The nickname people write for a place, mapped to what people type in the destination field. */
const ALIASES: Record<string, string> = {
  nyc: "new york",
  sf: "san francisco",
  "la": "los angeles",
  dc: "washington dc",
  vegas: "las vegas",
  "the big apple": "new york",
  "the bay area": "san francisco",
};

/** The two-letter US state codes. DC stays on, so "Washington DC" never reads as the state. */
const STATE_CODES = new Set(
  "al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy".split(" "),
);

/** The full names of the US states, so "Chicago, Illinois" reads the same as "Chicago, IL". */
const STATE_NAMES = new Set([
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware",
  "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky",
  "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
  "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico", "new york",
  "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island",
  "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont", "virginia", "washington",
  "west virginia", "wisconsin", "wyoming",
]);

/**
 * A place as Bingo reads it: lower case, without punctuation or a trailing state code, with the
 * well-known nicknames folded in. "Chicago, IL" and "chicago" are the same place.
 */
function normalizePlace(s: string): string {
  let out = s.toLowerCase().trim();
  out = out.replace(/['’]/g, ""); // "Xi'an" is one word, not "Xi" and "an"
  out = out.replace(/[.,/#!?;:"()\[\]]+/g, " "); // other punctuation becomes a space
  out = out.replace(/\s+/g, " ").trim();
  // A trailing state code or name: "Chicago, IL", "Chicago IL", "Chicago, Illinois".
  const parts = out.split(" ");
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (STATE_CODES.has(last) || STATE_NAMES.has(last)) parts.pop();
  }
  out = parts.join(" ").trim();
  return ALIASES[out] ?? out;
}

/** Card sizes on offer. The proposal's default is 3×3. */
export const BINGO_SIZES = [3, 4, 5] as const;
export const DEFAULT_SIZE = 3;

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

/** A line as a person would say it: "Row 1", "Column 3", "The diagonal from the top left". */
export function lineName(line: readonly number[], size: number): string {
  const [a, b] = line;
  if (b - a === 1) return `Row ${Math.floor(a / size) + 1}`;
  if (b - a === size) return `Column ${a + 1}`;
  return a === 0 ? "The diagonal from the top left" : "The diagonal from the top right";
}

/** The lines in `after` that weren't in `before`: the ones a change has just finished. */
export const newLines = (before: readonly number[][], after: readonly number[][]) => {
  const had = new Set(before.map((l) => l.join(",")));
  return after.filter((l) => !had.has(l.join(",")));
};

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
  if (!region) return "Say which city this task is in.";
  if (region.length > 60) return "Keep the area under 60 characters.";
  if (!title) return "Say what the task is.";
  if (title.length > 120) return "Keep the task under 120 characters. Put the details in the description.";
  if (description.length > 500) return "Keep the description under 500 characters.";
  return { region, title, description };
}

export type ChallengeInput = { region: string; title: string; description: string; size: number; taskIds: string[] };

/**
 * Checks a challenge an admin publishes: a region, a title, a size, and one task per square in position order,
 * none twice. Whether the tasks are in the region's library is the store's to check. Returns the cleaned input, or
 * the message to show.
 */
export function parseChallengeInput(body: Record<string, unknown>): ChallengeInput | string {
  const region = text(body.region);
  const title = text(body.title);
  const description = text(body.description);
  const { size, taskIds } = body;
  if (!region) return "Pick the city this challenge is in.";
  if (!title) return "Give the challenge a title.";
  if (title.length > 80) return "Keep the title under 80 characters.";
  if (description.length > 300) return "Keep the description under 300 characters.";
  if (!BINGO_SIZES.includes(size as (typeof BINGO_SIZES)[number])) return "Pick a 3×3, 4×4 or 5×5 card.";
  const squares = (size as number) ** 2;
  if (!Array.isArray(taskIds) || taskIds.length !== squares || taskIds.some((t) => typeof t !== "string")) {
    return `Fill all ${squares} squares with a task.`;
  }
  if (new Set(taskIds).size !== squares) return "Use each task once.";
  return { region, title, description, size: size as number, taskIds };
}
