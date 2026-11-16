import type { Coordinate, FuelPreferences, RoadRoute, Station } from "./types";
import { providerJson } from "./http";
import { FuelError } from "./validation";
import { GOOGLE_PLACES_FIELDS, GOOGLE_ROUTES_FIELDS, googleRouteRequest, googleSearchPolylines, googleStationRequest, parseGoogleRoute, parseGoogleStations } from "./google-data";

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
function apiKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) throw new FuelError("Google Maps is not configured. Add GOOGLE_MAPS_API_KEY to the server environment.", 503);
  return key;
}
async function computeRoute(origin: Coordinate | string, destination: Coordinate | string, stations: Station[] = []) {
  const payload = await providerJson<unknown>(ROUTES_URL, "Google Maps routing", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey(), "X-Goog-FieldMask": GOOGLE_ROUTES_FIELDS },
    body: JSON.stringify(googleRouteRequest(origin, destination, stations)),
  }, 15000);
  return parseGoogleRoute(payload, stations.length + 1);
}
export async function googleRoadRoute(origin: Coordinate, destination: Coordinate, stations: Station[] = []): Promise<RoadRoute> {
  return computeRoute(origin, destination, stations);
}
export async function googleSearchRoute(input: FuelPreferences): Promise<{ route: RoadRoute; stations: Station[]; warnings: string[] }> {
  // Routes resolves address waypoints directly; there is no per-station geocoding or model call.
  const route = await computeRoute(input.origin, input.destination);
  const key = apiKey();
  const results = await Promise.allSettled(googleSearchPolylines(route).map(async encodedPolyline => {
    const payload = await providerJson<unknown>(PLACES_URL, "Google Maps station and fuel price search", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": GOOGLE_PLACES_FIELDS },
      body: JSON.stringify(googleStationRequest(encodedPolyline)),
    }, 15000);
    return parseGoogleStations(payload, route, input);
  }));
  const successes = results.filter(result => result.status === "fulfilled");
  const failures = results.filter(result => result.status === "rejected");
  if (!successes.length && failures.length) throw failures[0].reason;
  const unique = new Map<string, Station>();
  for (const station of successes.flatMap(result => result.value)) {
    const previous = unique.get(station.id);
    if (!previous || (!previous.price && station.price) || (station.price && previous.price && Date.parse(station.price.observedAt) > Date.parse(previous.price.observedAt))) unique.set(station.id, station);
  }
  return { route, stations: [...unique.values()].sort((a, b) => a.routeMiles - b.routeMiles),
    warnings: failures.length ? ["Some route sections could not be searched. Try again for more station coverage."] : [] };
}
