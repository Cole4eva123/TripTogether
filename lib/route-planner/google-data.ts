import type { Coordinate, FuelGrade, FuelPreferences, Price, RoadRoute, RoutePoint, Source, Station } from "./types.ts";
import { distanceMiles, METERS_PER_MILE, projectOnRoute } from "./planner.ts";
import { FuelError } from "./validation.ts";
import { normalizeState } from "./regions.ts";

export const GOOGLE_ROUTING_PREFERENCE = "TRAFFIC_AWARE";
export const GOOGLE_ROUTES_FIELDS = [
  "routes.distanceMeters", "routes.duration", "routes.polyline.encodedPolyline",
  "routes.legs.distanceMeters", "routes.legs.duration", "routes.legs.polyline.encodedPolyline",
  "routes.legs.startLocation", "routes.legs.endLocation", "routes.legs.steps.distanceMeters",
  "routes.legs.steps.staticDuration", "routes.legs.steps.polyline.encodedPolyline",
].join(",");
export const GOOGLE_PLACES_FIELDS = [
  "places.id", "places.displayName", "places.formattedAddress", "places.addressComponents",
  "places.location", "places.fuelOptions", "places.googleMapsUri",
  "places.businessStatus", "places.attributions",
].join(",");
type Json = Record<string, unknown>;
const json = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const string = (value: unknown): string => typeof value === "string" ? value : "";
const amount = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const seconds = (value: unknown): number | null => typeof value === "string" && /^\d+(?:\.\d{1,9})?s$/.test(value) ? amount(Number(value.slice(0, -1))) : null;
function coordinate(value: unknown): Coordinate | null {
  const v = json(value), lat = v.latitude, lng = v.longitude;
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
function link(value: unknown): string | null {
  try { const url = new URL(string(value)); return url.protocol === "https:" && !!url.hostname ? url.href : null; } catch { return null; }
}

/**
 * Google's documented encoded-polyline format; reject truncated/overflowing provider data. The length limit is the
 * only one on size: a 30-hour route, the longest allowed, is about 150,000 points in under 400,000 characters.
 */
export function decodeGooglePolyline(encoded: string): Coordinate[] {
  if (!encoded || encoded.length > 1000000) throw new FuelError("Google Maps returned an invalid route polyline.", 502);
  const points: Coordinate[] = [];
  let index = 0, latitude = 0, longitude = 0;
  const next = () => {
    let result = 0, shift = 0, digit = 0;
    do {
      if (index >= encoded.length || shift > 30) throw new FuelError("Google Maps returned an incomplete route polyline.", 502);
      digit = encoded.charCodeAt(index++) - 63;
      if (digit < 0 || digit > 63) throw new FuelError("Google Maps returned an invalid route polyline.", 502);
      result += (digit & 31) * 2 ** shift;
      shift += 5;
    } while (digit >= 32);
    return result % 2 ? -(result + 1) / 2 : result / 2;
  };
  while (index < encoded.length) {
    latitude += next(); longitude += next();
    const point = coordinate({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
    if (!point) throw new FuelError("Google Maps returned an invalid route polyline.", 502);
    points.push(point);
  }
  return points;
}
const length = (points: Coordinate[]) => points.slice(1).reduce((sum, point, index) => sum + distanceMiles(points[index], point), 0);

export function parseGoogleRoute(payload: unknown, expectedLegs = 1): RoadRoute {
  const route = json(list(json(payload).routes)[0]), rawLegs = list(route.legs);
  const meters = amount(route.distanceMeters), duration = seconds(route.duration), encodedPolyline = string(json(route.polyline).encodedPolyline);
  if (!meters || !duration || rawLegs.length !== expectedLegs || !encodedPolyline) throw new FuelError("No complete drivable route was found between these locations.", 422);
  if (duration > 30 * 3600) throw new FuelError("Please split routes over 30 hours into separate travel days.");
  if (decodeGooglePolyline(encodedPolyline).length < 2) throw new FuelError("Google Maps returned an incomplete route polyline.", 502);
  const points: RoutePoint[] = [], legs: RoadRoute["legs"] = [];
  let milesBefore = 0, minutesBefore = 0;
  for (const value of rawLegs) {
    const leg = json(value), legMeters = amount(leg.distanceMeters), legSeconds = seconds(leg.duration);
    const start = coordinate(json(leg.startLocation).latLng), end = coordinate(json(leg.endLocation).latLng);
    if (legMeters === null || legSeconds === null || !start || !end) throw new FuelError("Google Maps returned incomplete route legs.", 502);
    const legMiles = legMeters / METERS_PER_MILE, legMinutes = legSeconds / 60;
    let steps = list(leg.steps).map(value => {
      const step = json(value);
      return { points: decodeGooglePolyline(string(json(step.polyline).encodedPolyline)), meters: amount(step.distanceMeters), seconds: seconds(step.staticDuration) };
    });
    if (!steps.length) steps = [{ points: decodeGooglePolyline(string(json(leg.polyline).encodedPolyline)), meters: legMeters, seconds: legSeconds }];
    if (steps.some(step => step.points.length < 1) || steps.length > 20000) throw new FuelError("Google Maps returned incomplete route steps.", 502);
    const lengths = steps.map(step => length(step.points));
    // Per-vertex values are estimates within each navigation step; leg totals remain
    // the actual provider totals. Google does not provide OSRM-style edge durations.
    const distanceWeights = steps.every(step => step.meters !== null) && steps.some(step => step.meters! > 0) ? steps.map(step => step.meters!) : lengths;
    const timeWeights = steps.every(step => step.seconds !== null) && steps.some(step => step.seconds! > 0) ? steps.map(step => step.seconds!) : lengths;
    const distanceTotal = distanceWeights.reduce((sum, value) => sum + value, 0), timeTotal = timeWeights.reduce((sum, value) => sum + value, 0);
    const append = (point: Coordinate, miles: number, minutes: number) => {
      const previous = points.at(-1);
      if (previous && previous.lat === point.lat && previous.lng === point.lng && previous.miles === miles && previous.minutes === minutes) return;
      points.push({ ...point, miles, minutes });
    };
    append(start, milesBefore, minutesBefore);
    let distanceBefore = 0, timeBefore = 0;
    for (let index = 0; index < steps.length; index++) {
      const step = steps[index], length = lengths[index];
      let travelled = 0;
      for (let vertex = 0; vertex < step.points.length; vertex++) {
        if (vertex) travelled += distanceMiles(step.points[vertex - 1], step.points[vertex]);
        const fraction = length ? travelled / length : vertex / Math.max(1, step.points.length - 1);
        const distanceFraction = distanceTotal ? (distanceBefore + distanceWeights[index] * fraction) / distanceTotal : (index + fraction) / steps.length;
        const timeFraction = timeTotal ? (timeBefore + timeWeights[index] * fraction) / timeTotal : (index + fraction) / steps.length;
        append(step.points[vertex], milesBefore + legMiles * distanceFraction, minutesBefore + legMinutes * timeFraction);
      }
      distanceBefore += distanceWeights[index]; timeBefore += timeWeights[index];
    }
    milesBefore += legMiles; minutesBefore += legMinutes;
    append(end, milesBefore, minutesBefore);
    legs.push({ miles: legMiles, minutes: legMinutes });
  }
  if (points.length < 2 || Math.abs(milesBefore * METERS_PER_MILE - meters) > Math.max(10, rawLegs.length * 2) || Math.abs(minutesBefore * 60 - duration) > Math.max(10, rawLegs.length * 2)) {
    throw new FuelError("Google Maps returned inconsistent route distances or times.", 502);
  }
  return { origin: points[0], destination: points.at(-1)!, points, legs, miles: milesBefore, minutes: minutesBefore };
}

const fuelTypes: Record<FuelGrade, string> = { regular: "REGULAR_UNLEADED", midgrade: "MIDGRADE", premium: "PREMIUM", diesel: "DIESEL" };
export function googleFuelPrice(fuelOptions: unknown, grade: FuelGrade, mapUrl: string, now = Date.now()): Price | null {
  const quotes: Price[] = [];
  for (const item of list(json(fuelOptions).fuelPrices)) {
    const quote = json(item), money = json(quote.price), observedAt = string(quote.updateTime), observed = Date.parse(observedAt);
    if (quote.type !== fuelTypes[grade] || money.currencyCode !== "USD" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(observedAt) || !Number.isFinite(observed) || observed > now + 3600000 || now - observed > 72 * 3600000) continue;
    // Protobuf Money omits zero-valued nanos; units is an int64 JSON string.
    if (money.units !== undefined && (typeof money.units !== "string" || !/^\d+$/.test(money.units))) continue;
    const units = Number(money.units ?? "0"), nanos = money.nanos ?? 0;
    if (!Number.isSafeInteger(units) || typeof nanos !== "number" || !Number.isInteger(nanos) || nanos < 0 || nanos > 999999999) continue;
    const perGallon = units + nanos / 1e9;
    if (perGallon < 0.5 || perGallon > 15) continue;
    quotes.push({ perGallon, observedAt: new Date(observed).toISOString(), source: { title: "Google Maps station fuel price", url: mapUrl } });
  }
  return quotes.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0] ?? null;
}

/** The stations of one Places response that sit within `corridorMiles` of the route, placed along it. */
export function parseGoogleStations(payload: unknown, route: RoadRoute, input: FuelPreferences, now = Date.now(), corridorMiles = 10): Station[] {
  const stations: Station[] = [];
  for (const value of list(json(payload).places).slice(0, 20)) {
    const place = json(value), id = string(place.id), name = string(json(place.displayName).text), address = string(place.formattedAddress), location = coordinate(place.location);
    const components = list(place.addressComponents).map(json), component = (type: string) => components.find(part => list(part.types).includes(type));
    const country = component("country"), state = component("administrative_area_level_1");
    if (!id || !name || !address || !location || country?.shortText !== "US" || place.businessStatus === "CLOSED_PERMANENTLY" || place.businessStatus === "CLOSED_TEMPORARILY") continue;
    const projection = projectOnRoute(location, route);
    if (projection.offRoute > corridorMiles || projection.miles >= route.miles - 0.2) continue;
    const mapUrl = link(place.googleMapsUri) ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(id)}`;
    // Screening estimate only; the final Google route through selected stations
    // supplies actual road-leg distances for the fuel/reserve calculation.
    const detourMiles = projection.offRoute * 2.6;
    const attributions: Source[] = list(place.attributions).map(value => { const item = json(value); return { title: string(item.provider), url: link(item.providerUri) ?? "" }; }).filter(source => source.title && source.url);
    stations.push({ id: `google:${id}`, name, brand: name, address, state: normalizeState(string(state?.shortText) || string(state?.longText)),
      location, routeMiles: projection.miles, routeMinutes: projection.minutes, detourMiles, detourMinutes: detourMiles / 25 * 60 + 2,
      amenities: [], membersOnly: /costco|sam.?s club/i.test(name), price: googleFuelPrice(place.fuelOptions, input.vehicle.grade, mapUrl, now), open: "Hours not requested", mapUrl,
      source: { title: "Google Maps", url: mapUrl }, ...(attributions.length ? { attributions } : {}),
    });
  }
  return stations.sort((a, b) => a.routeMiles - b.routeMiles);
}

const waypoint = (value: Coordinate | string) => typeof value === "string" ? { address: value } : { location: { latLng: { latitude: value.lat, longitude: value.lng } } };
export function googleRouteRequest(origin: Coordinate | string, destination: Coordinate | string, stations: Station[] = []) {
  if (stations.length > 25) throw new FuelError("Google Maps supports up to 25 recommended stops per travel day.");
  return { origin: waypoint(origin), destination: waypoint(destination), intermediates: stations.map(station => waypoint(station.location)),
    // Omit departureTime: Google uses the request time; the trip's calendar date
    // stays a display value rather than an assumed midnight departure.
    travelMode: "DRIVE", routingPreference: GOOGLE_ROUTING_PREFERENCE, computeAlternativeRoutes: false,
    polylineQuality: "HIGH_QUALITY", polylineEncoding: "ENCODED_POLYLINE", languageCode: "en-US", regionCode: "US", units: "IMPERIAL" };
}
export type SearchCircle = { center: Coordinate; radiusMiles: number };
const MAX_RADIUS_MILES = 31; // Nearby Search takes a radius of up to 50 km
/**
 * Circles that cover a corridor `corridorMiles` to each side of the route, one Nearby Search each. A route too
 * long for `maxSearches` circles gets wider ones, spaced out: `complete` is false when they leave gaps.
 */
export function googleSearchCircles(route: RoadRoute, corridorMiles: number, maxSearches: number): { circles: SearchCircle[]; complete: boolean } {
  const wanted = Math.max(1, Math.ceil(route.miles / (corridorMiles * 1.5)));
  const count = Math.min(wanted, maxSearches), spacing = route.miles / count, gapRadius = spacing * 0.6;
  const radiusMiles = Math.min(MAX_RADIUS_MILES, Math.max(corridorMiles, gapRadius));
  const circles = Array.from({ length: count }, (_, index) => {
    const miles = (index + 0.5) * spacing, after = Math.max(1, route.points.findIndex(point => point.miles >= miles));
    const a = route.points[after - 1], b = route.points[after], t = (miles - a.miles) / (b.miles - a.miles || 1);
    return { center: { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) }, radiusMiles };
  });
  return { circles, complete: gapRadius <= radiusMiles };
}
export function googleStationRequest({ center, radiusMiles }: SearchCircle) {
  // Nearest first: where a circle holds more than 20 stations, the ones kept are the ones closest to the route.
  return { includedTypes: ["gas_station"], maxResultCount: 20, rankPreference: "DISTANCE", languageCode: "en-US", regionCode: "US",
    locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: radiusMiles * METERS_PER_MILE } } };
}
