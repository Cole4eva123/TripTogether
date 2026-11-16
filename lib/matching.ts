// How close two trips are, and why. Pure functions, so the scoring is testable on its own.
//
// The matcher compares real places, not strings. It looks the destination up in the gazetteer
// (`lib/places.ts`), so "北京" and "Beijing" are one city and "Kyoto" and "Kyoto, Japan" are one city, and
// two trips to the same place can be compared by how far apart they really are.
import { sharedWindow, tripLength } from "./dates.ts";
import { allPlaces, placesNamed, type Place } from "./places.ts";
import type { TripProfile } from "./types.ts";

export type MatchScore = {
  score: number; // 0 to 100
  reasons: string[]; // why it matched, in plain words
  overlapDays: number; // days the two trips share
  distanceKm: number | null; // how far apart the two destinations really are
};

/** The weights each part of the score is worth, summing to 100. */
const DESTINATION_POINTS = 50;
const DATES_POINTS = 30;
const ORIGIN_POINTS = 10;
const GROUP_SIZE_POINTS = 10;

/** The score at which a trip is worth reaching out about. */
export const STRONG_MATCH = 60;
/** The score at which a trip is worth showing at all. */
export const POSSIBLE_MATCH = 40;
/**
 * The score a trip is held under when it doesn't go where the reader is going. Two trips to different places
 * can't be done together, however well their dates and their size line up, so they never reach the band
 * that says "worth looking at".
 */
export const MAX_UNRELATED = POSSIBLE_MATCH - 10;
/**
 * The score a trip is held under when it goes to a different place in the same region. "San Francisco" and
 * "San Diego" are both in California, but they are 737 km apart: the groups would not be going to the same
 * place, so this stays under the line that says "worth looking at" as well.
 */
export const MAX_REGION = POSSIBLE_MATCH - 5;

/** How far apart two places are before they count as somewhere else entirely. */
const NEARBY_KM = 60;
/** How far apart two places are before they are only the same region. */
const SAME_REGION_KM = 250;
/** The radius of the Earth, in kilometres. */
const EARTH_KM = 6371;

/** The distance between two places on the surface of the Earth, in kilometres. */
export function distanceKm(a: Place, b: Place): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * A place name broken into the parts a reader wrote.
 *
 * People write "Chicago", "Chicago, IL", "Chicago, Illinois" and "Chicago, United States". The first part
 * is the place; the rest say which one they mean, because "Springfield" is in four states and "London" is
 * in two countries.
 */
export type ParsedPlace = {
  /** The name of the place itself, without the region or country under it. */
  name: string;
  /** The region or country the reader wrote under it, if any. */
  qualifier: string | null;
};

/**
 * Splits a place name into the place and the qualifier under it.
 *
 * The separator is a comma: that is how people write "Chicago, IL". A place name that has a comma in it
 * for another reason ("Washington, D.C.") still works, because only the trailing part is treated as a
 * qualifier.
 */
export function parsePlaceName(input: string): ParsedPlace {
  const trimmed = input.trim();
  // The comma is what separates the place from the qualifier, so it has to survive until the split.
  const parts = trimmed.split(",").map((part) => clean(part)).filter(Boolean);
  if (parts.length <= 1) return { name: clean(trimmed), qualifier: null };
  return { name: parts[0], qualifier: parts.slice(1).join(", ") || null };
}

/**
 * A place, written the way a person would write it: the name, then the region under it when the region is
 * a different name, then the country.
 *
 * "Chicago, Illinois"; "New York City, New York"; "Beijing, China"; "Kyoto, Japan".
 */
export function describePlace(place: Place): string {
  const parts = [place.name];
  if (place.region && place.region !== place.name) {
    parts.push(place.region);
    // The region names a state, so the country is only added when the region is the country.
    if (place.region === place.countryName) parts.push(place.countryName);
  } else {
    parts.push(place.countryName);
  }
  return parts.join(", ");
}

let byLabel: Map<string, Place> | null = null;
/** Every place under its full name. Two places with one full name are one place to the reader: the bigger is kept. */
function placesByLabel(): Map<string, Place> {
  if (byLabel) return byLabel;
  byLabel = new Map();
  for (const place of allPlaces()) {
    const label = describePlace(place), known = byLabel.get(label);
    if (!known || place.weight > known.weight) byLabel.set(label, place);
  }
  return byLabel;
}

/**
 * The place a name refers to.
 *
 * A name can mean several places ("Springfield" is in Illinois, Missouri, Ohio and Pennsylvania), so the
 * region and the country the reader wrote pick the right one. The result is null when the name is not a
 * place the gazetteer knows: a nickname, a landmark, or somewhere too small to be in it.
 */
export function resolvePlace(input: string): Place | null {
  // A full name is the place it was written out from. Reading it back as a name and a qualifier can land on
  // another place ("Kronstadt, St. Petersburg" is also what Braşov is called) or on none ("Sa'dah, Yemen").
  const labelled = placesByLabel().get(input.trim());
  if (labelled) return labelled;
  const { name, qualifier } = parsePlaceName(input);
  if (!name) return null;
  const candidates = placesNamed(name);
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  // Several places answer to the name. The qualifier the reader wrote under it picks the right one.
  if (qualifier) {
    const wanted = qualifier.toLocaleLowerCase();
    const matched = candidates.find((place) => {
      const region = (place.region ?? "").toLocaleLowerCase();
      const code = (place.regionCode ?? "").toLocaleLowerCase();
      const country = place.country.toLocaleLowerCase();
      const countryName = place.countryName.toLocaleLowerCase();
      return (
        region === wanted ||
        code === wanted ||
        code === `${country}.${wanted}` ||
        country === wanted ||
        countryName === wanted ||
        region.startsWith(wanted) ||
        countryName.startsWith(wanted)
      );
    });
    if (matched) return matched;
  }
  // Without a qualifier, take the place that claims the name most strongly: the biggest one, with a bonus
  // for a capital. "New York" is New York City, not Manhattan, which is a borough of it. "San Francisco" is
  // the city in California. "London" is London, England, not London, Ontario.
  return candidates.reduce((a, b) => (b.weight > a.weight ? b : a));
}

/** How two place names line up with each other. */
export type PlaceRelation = "same" | "near" | "region" | "different";

/**
 * How two place names line up with each other.
 *
 * - "same": the same place. "Chicago" and "Chicago, IL"; "Beijing" and "北京".
 * - "near": two different places in the same area, close enough to travel together. "Chicago" and
 *   "Chicago Heights"; "Kyoto" and "Osaka".
 * - "region": two places in the same state or country, but too far apart to share a trip.
 * - "different": nothing in common.
 */
export function placeRelation(a: string, b: string): PlaceRelation {
  const first = resolvePlace(a);
  const second = resolvePlace(b);
  if (!first || !second) return textRelation(a, b);
  if (first.id === second.id) return "same";
  const km = distanceKm(first, second);
  if (km <= NEARBY_KM) return "near";
  if (first.regionCode && first.regionCode === second.regionCode) return "region";
  if (first.country === second.country && km <= SAME_REGION_KM) return "region";
  return "different";
}

/**
 * How two place names line up when the gazetteer doesn't know them.
 *
 * Without a gazetteer there is only the text to go on: two names that are the same word are the same place,
 * and one name inside the other is the same area.
 */
function textRelation(a: string, b: string): PlaceRelation {
  const left = clean(a);
  const right = clean(b);
  if (!left || !right) return "different";
  if (left === right) return "same";
  const leftWords = left.split(" ").filter(Boolean);
  const rightWords = right.split(" ").filter(Boolean);
  if (!leftWords.length || !rightWords.length) return "different";
  const [short, long] = leftWords.length <= rightWords.length ? [leftWords, rightWords] : [rightWords, leftWords];
  if (short.every((word) => long.includes(word))) return "near";
  return "different";
}

/** A place name as plain words, without punctuation. */
function clean(name: string): string {
  return name
    .toLocaleLowerCase()
    .replace(/[.,/#!?;:'"()[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The name of a place in the gazetteer, as the people of that place write it. */
export function displayPlace(input: string): string | null {
  return resolvePlace(input)?.name ?? null;
}

/** True when the two places name the same place. */
export function samePlace(a: string, b: string): boolean {
  return placeRelation(a, b) === "same";
}

/** The days a trip covers, from its first day to its last, both included. */
const duration = (p: TripProfile) => tripLength(p.startDate, p.endDate);

/** How many days the two trips share. Zero when they don't touch at all. */
export function overlapDays(a: TripProfile, b: TripProfile): number {
  return sharedWindow(a, b)?.days ?? 0;
}

/** How close the two group sizes are: the same size scores best, and the gap costs a little each step. */
function sizePoints(a: number, b: number): number {
  const gap = Math.abs(a - b);
  if (gap === 0) return GROUP_SIZE_POINTS;
  if (gap === 1) return Math.round(GROUP_SIZE_POINTS * 0.7);
  if (gap === 2) return Math.round(GROUP_SIZE_POINTS * 0.4);
  if (gap === 3) return Math.round(GROUP_SIZE_POINTS * 0.2);
  return 0;
}

/** How close two places are, in points. Two trips to the same place are worth the most. */
function destinationPoints(a: string, b: string): { points: number; cap: number; reason: string; km: number | null } {
  const first = resolvePlace(a);
  const second = resolvePlace(b);
  const km = first && second ? distanceKm(first, second) : null;
  const relation = placeRelation(a, b);
  if (relation === "same") {
    return { points: DESTINATION_POINTS, cap: 100, reason: `Same destination: ${b}`, km };
  }
  if (relation === "near") {
    // Close enough to share a trip: the same city area, or two towns a short drive apart.
    const reason = km !== null ? `About ${Math.round(km)} km apart` : "Nearby destination";
    return { points: Math.round(DESTINATION_POINTS * 0.75), cap: 100, reason, km };
  }
  if (relation === "region") {
    // The same region, but too far apart to travel together.
    const reason = km !== null ? `About ${Math.round(km)} km apart` : "Same region";
    return { points: Math.round(DESTINATION_POINTS * 0.4), cap: MAX_REGION, reason, km };
  }
  return { points: 0, cap: MAX_UNRELATED, reason: "Different destination", km };
}

/**
 * How close the two trips are, out of 100, and the reasons behind it. Two trips that share no days never match:
 * the whole point is travelling at the same time. Two trips that go to different places don't match either,
 * however well their dates and their size line up: you can't travel to two cities at once. That's what the
 * cap is for.
 */
export function similarity(a: TripProfile, b: TripProfile): MatchScore {
  const reasons: string[] = [];

  const shared = overlapDays(a, b);
  if (shared === 0) {
    return { score: 0, reasons: ["Your dates don't overlap"], overlapDays: 0, distanceKm: null };
  }

  const destination = destinationPoints(a.destination, b.destination);
  reasons.push(destination.reason);

  // The dates: the more of the shorter trip the two share, the better. A four-day trip inside a ten-day one
  // is a good match, because the four days are covered completely.
  //
  // The days in common are not one of the reasons: the card shows them on their own line, with the actual
  // dates, and saying it twice is noise.
  const shortest = Math.min(duration(a), duration(b));
  const dateRatio = shortest > 0 ? Math.min(1, shared / shortest) : 0;
  const dates = Math.round(DATES_POINTS * dateRatio);

  // The origin: the same starting point helps, but matters little.
  const originRelation = placeRelation(a.origin, b.origin);
  let origin = 0;
  if (originRelation === "same") {
    origin = ORIGIN_POINTS;
    reasons.push("Same starting point");
  } else if (originRelation === "near" || originRelation === "region") {
    origin = Math.round(ORIGIN_POINTS * 0.5);
    reasons.push("Similar starting point");
  }

  const size = sizePoints(a.memberCount, b.memberCount);
  if (size >= GROUP_SIZE_POINTS) reasons.push("Same number of travelers");
  else if (size > 0) reasons.push("Similar group size");

  const raw = destination.points + dates + origin + size;
  // Different places, so the trips can't be done together: keep the score under the line that says "worth
  // looking at", whatever else happens to line up.
  const score = Math.min(raw, destination.cap);

  return { score, reasons, overlapDays: shared, distanceKm: destination.km };
}

/** What to call a score in the interface. */
export function matchLabel(score: number): string {
  if (score >= STRONG_MATCH) return "Great match";
  if (score >= POSSIBLE_MATCH) return "Possible match";
  return "Far off";
}
