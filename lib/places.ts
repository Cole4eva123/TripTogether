// The gazetteer: the real places, with their names and their coordinates.
//
// This is what the matcher uses to decide whether two trips go to the same place. It used to be a
// hand-written table of US states, Canadian provinces and nicknames, which only knew about English places:
// "北京" and "Beijing" were two different cities, and a trip to Kyoto never matched "Kyoto, Japan".
//
// The data is GeoNames (CC BY 4.0), built by `scripts/build-gazetteer.mjs` into `lib/places.json.gz`. It is
// read once, when the module is first used, and never again.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** A place as the matcher reads it. */
export type Place = {
  id: number;
  name: string;
  country: string; // the two-letter code, "US"
  countryName: string; // "United States"
  region: string | null; // "Illinois", or null when the place gave none
  regionCode: string | null; // "US.IL", or null
  lat: number;
  lon: number;
  kind: string; // "PPLA" for a regional capital, "PPL" for a city
  population: number; // how many people live there
  weight: number; // how strongly this place claims a bare name: population, with a bonus for a capital
  names: string[]; // every name people write for it, in any language
};

type Payload = {
  source: string;
  license: string;
  strings: string[];
  // name, country, countryName, region, regionCode, lat, lon, kind, names
  rows: (string | number | string[] | null)[][];
};

let places: Place[] | null = null;

/** The gazetteer, read from the checked-in file the first time it is needed. */
export function allPlaces(): Place[] {
  if (places) return places;
  const path = resolve(dirname(fileURLToPath(import.meta.url)), "places.json.gz");
  const payload = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as Payload;
  const strings = payload.strings;
  places = payload.rows.map((row, index) => {
    const [name, country, countryName, region, regionCode, lat, lon, kind, population, weight, names] = row as [
      number, number, number, number, number, number, number, number, number, number, number[],
    ];
    return {
      // The row index is enough to tell two places apart, and it costs nothing to carry.
      id: index + 1,
      name: strings[name],
      country: strings[country],
      countryName: strings[countryName],
      region: region < 0 ? null : strings[region],
      regionCode: regionCode < 0 ? null : strings[regionCode],
      lat,
      lon,
      kind: strings[kind],
      population,
      weight,
      names: names.map((index) => strings[index]),
    };
  });
  return places;
}

/**
 * The names of every place, lower-cased, mapped to the places that answer to them.
 *
 * A name can belong to more than one place: "Springfield" is in Illinois, Missouri, Ohio and Pennsylvania,
 * and "London" is in England and Ontario. The matcher decides between them with the region and the country
 * the reader wrote.
 */
let byName: Map<string, Place[]> | null = null;

/** The places that answer to a name, in lower case. */
export function placesNamed(name: string): Place[] {
  if (!byName) {
    byName = new Map();
    for (const place of allPlaces()) {
      for (const alias of place.names) {
        const key = alias.toLocaleLowerCase();
        let list = byName.get(key);
        if (!list) byName.set(key, (list = []));
        if (!list.includes(place)) list.push(place);
      }
    }
  }
  return byName.get(name.toLocaleLowerCase()) ?? [];
}
