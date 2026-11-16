// Searching the gazetteer for the places a reader might be going.
//
// The matcher reads the gazetteer on the server, so the search does too. The browser asks for the places
// that answer to a few letters, and the server sends back a short list with the names people write for
// them, so the reader can pick the right one instead of typing it out.
import { resolvePlace } from "./matching.ts";
import { allPlaces, placesNamed, type Place } from "./places.ts";

/** A place as the search returns it: the name to use, and enough to tell two alike places apart. */
export type PlaceSuggestion = {
  /** The name of the place. */
  name: string;
  /** The country, for the reader to recognise. */
  country: string;
  /** The region or state the place is in, when it has one. */
  region: string | null;
  /** How strongly this place claims the name the reader typed: population, with a bonus for a capital. */
  weight: number;
};

/** How many places one search returns. Enough to choose from, few enough to read. */
const LIMIT = 8;

/**
 * The places that answer to a few letters of what the reader typed.
 *
 * The name is matched against every name of every place, in every language, so "北京", "Beijing" and
 * "PEK" all find the same city. The list is ordered by how strongly the place claims the name, so the
 * one the reader means is first.
 *
 * A country or a region answers as well, because somebody planning a trip to Japan is looking for the
 * cities in Japan, and "California" is a perfectly ordinary thing to type. The places of that country or
 * region come first, biggest first.
 */
export function searchPlaces(query: string, limit = LIMIT): PlaceSuggestion[] {
  const text = query.trim().toLocaleLowerCase();
  if (!text) return [];
  const byWeight = (a: Place, b: Place) => b.weight - a.weight || a.name.localeCompare(b.name);

  // A name that answers exactly is the place the reader means, so it comes first and alone.
  //
  // A name can belong to more than one place: "BOS" is an alias of Bexhill-on-Sea as well as of Boston,
  // and the reader means Boston. The biggest one wins, which is the one people mean by a bare name.
  const exact = placesNamed(text);
  if (exact.length) return unique(exact.sort(byWeight)).slice(0, limit).map(describe);

  // A country or a region: the places in it are what the reader is looking for.
  const byCountry = allPlaces().filter(
    (place) => place.country.toLocaleLowerCase() === text || place.countryName.toLocaleLowerCase() === text,
  );
  const byRegion = allPlaces().filter(
    (place) => place.region?.toLocaleLowerCase() === text || place.regionCode?.toLocaleLowerCase().endsWith(`.${text}`),
  );
  if (byCountry.length || byRegion.length) {
    return unique([...byCountry, ...byRegion].sort(byWeight)).slice(0, limit).map(describe);
  }

  const close: Place[] = [];
  const loose: Place[] = [];
  for (const place of allPlaces()) {
    // How well the place's own name answers what was typed. The name that matches best is the one the
    // reader means, and how many people live there only settles it between two places that match equally
    // well — "san fran" is San Francisco, even though Quito's alternate name is "San Francisco de Quito".
    let rank = 0;
    for (const alias of place.names) {
      const name = alias.toLocaleLowerCase();
      // A name that begins with what was typed, and is not much longer than it, is a close answer.
      if (name.startsWith(text) && name.length <= text.length + 12) { rank = Math.max(rank, 2); continue; }
      if (name.startsWith(text)) { rank = Math.max(rank, 1); continue; }
      if (name.includes(text)) rank = Math.max(rank, 0);
    }
    if (rank >= 2) close.push(place);
    else if (rank >= 0) loose.push(place);
  }
  // The best match comes first; between two places that match the same, the bigger one wins.
  // A place is only listed once, however many of its names matched.
  return unique([...close.sort(byWeight), ...loose.sort(byWeight)]).slice(0, limit).map(describe);
}

/**
 * The places with no duplicates.
 *
 * A place can be found twice: "北京" and "Beijing" are both names of Beijing, so a search for either can
 * turn up the same city through two different names. The reader should see it once.
 *
 * Two places that share a name, a country and a region are the same place as far as the reader is
 * concerned — GeoNames files Beijing twice, once as the city and once as the seat of the province that
 * has the same name — so those are shown once as well.
 */
function unique(places: Place[]): Place[] {
  const seen = new Set<number>();
  const seenPlaces = new Set<string>();
  return places.filter((place) => {
    if (seen.has(place.id)) return false;
    seen.add(place.id);
    const key = `${place.name}|${place.country}|${place.region ?? ""}`;
    if (seenPlaces.has(key)) return false;
    seenPlaces.add(key);
    return true;
  });
}

/**
 * How a place is written out for the reader to pick.
 *
 * The region goes under the name when the name alone would be ambiguous — "Springfield" is in four
 * states — and the country goes with it when the region doesn't say which country it is.
 */
function describe(place: Place): PlaceSuggestion {
  return {
    name: place.name,
    country: place.countryName,
    region: place.region,
    weight: place.weight,
  };
}

/**
 * The full name of a place, with the region and the country under it. This is what the trip's destination
 * and origin are set to, so the matcher compares two places rather than two spellings.
 */
export function qualifiedPlaceName(input: string): string | null {
  const place = resolvePlace(input);
  if (!place) return null;
  return describePlace(place);
}

/**
 * A place, written the way a person would write it: the name, then the region under it when the region is
 * a different name, then the country.
 *
 * "Chicago, Illinois"; "New York City, New York"; "Beijing, China"; "Kyoto, Japan".
 */
function describePlace(place: Place): string {
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

/**
 * True when a place answers to one of the search words.
 *
 * The search is a real one: "北京" finds "Beijing", "NYC" finds "New York City", and "san fran" finds
 * "San Francisco" — because the place is looked up in the gazetteer rather than compared as text.
 *
 * One word at a time, so a query of several words ("new york sushi") finds a trip to New York whose note
 * mentions sushi.
 */
export function placeMatchesQuery(placeName: string, query: string): boolean {
  const text = query.trim().toLocaleLowerCase();
  if (!text) return true;
  // The whole query is one place: "new york", "san francisco", "北京".
  if (matchesPlace(placeName, text)) return true;
  // Otherwise every word has to be answered by the place on its own.
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > 1 && words.every((word) => matchesPlace(placeName, word));
}

/** True when the place answers to the word on its own. */
function matchesPlace(placeName: string, word: string): boolean {
  const place = resolvePlace(placeName);
  if (!place) {
    // A place the gazetteer doesn't know is searched as the text it was written as.
    return placeName.toLocaleLowerCase().includes(word);
  }
  // The place's own names, in every language, answer to the word.
  if ([place.name, ...place.names].some((name) => name.toLocaleLowerCase().includes(word))) return true;
  // The country answers too: searching "Japan" finds a trip to Tokyo.
  if (place.country.toLocaleLowerCase() === word) return true;
  if (place.countryName.toLocaleLowerCase().includes(word)) return true;
  // The region answers as well: searching "California" finds a trip to San Diego.
  if (place.region?.toLocaleLowerCase().includes(word)) return true;
  if (place.regionCode?.toLocaleLowerCase().endsWith(`.${word}`)) return true;

  // A nearby place answers too: searching "Boston" finds "Cambridge", because the reader may well mean
  // the area rather than the one city.
  const candidates = placesNamed(word);
  if (!candidates.length) return false;
  return candidates.some((candidate) => distanceBetween(place, candidate) <= 120);
}

/** The distance between two places, in kilometres. */
function distanceBetween(a: Place, b: Place): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat));
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
