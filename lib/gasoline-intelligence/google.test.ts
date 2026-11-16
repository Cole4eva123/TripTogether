import assert from "node:assert/strict";
import { test } from "node:test";
import type { FuelPreferences } from "./types.ts";
import { GOOGLE_PLACES_FIELDS, GOOGLE_ROUTES_FIELDS, decodeGooglePolyline, encodeGooglePolyline, googleFuelPrice, googleRouteRequest, googleSearchPolylines, googleStationRequest, parseGoogleRoute, parseGoogleStations } from "./google-data.ts";
import { buildFuelPlan, METERS_PER_MILE } from "./planner.ts";

const now = Date.parse("2026-11-15T18:00:00Z"), mapUrl = "https://maps.google.com/?cid=123";
const input: FuelPreferences = { origin: "Tahlequah, OK", destination: "Urbana, IL", departure: "2026-11-20", vehicle: { year: 2010, make: "Toyota", model: "Corolla", trim: "LE", mpg: 34, tankGallons: 13.2, grade: "regular" }, initialFuelPercent: 85, reservePercent: 25, intervalMinutes: 90, maxDetourMinutes: 15, stopMinutes: 20, amenities: [], memberships: [], estimatedPrice: null };
const points = [{ lat: 40, lng: -90 }, { lat: 40, lng: -89.9 }, { lat: 40, lng: -89.8 }];
const polyline = encodeGooglePolyline(points);
function payload() {
  return { routes: [{ distanceMeters: 20000, duration: "1200s", polyline: { encodedPolyline: polyline }, legs: [{ distanceMeters: 20000, duration: "1200s", polyline: { encodedPolyline: polyline }, startLocation: { latLng: { latitude: 40, longitude: -90 } }, endLocation: { latLng: { latitude: 40, longitude: -89.8 } }, steps: [
    { distanceMeters: 10000, staticDuration: "300s", polyline: { encodedPolyline: encodeGooglePolyline(points.slice(0, 2)) } },
    { distanceMeters: 10000, staticDuration: "900s", polyline: { encodedPolyline: encodeGooglePolyline(points.slice(1)) } },
  ] }] }] };
}
const quote = (type = "REGULAR_UNLEADED", currencyCode = "USD", updateTime = "2026-11-15T17:00:00Z") => ({ type, price: { currencyCode, units: "3", nanos: 259000000 }, updateTime });
function place() { return { id: "abc", displayName: { text: "Sample Gas" }, formattedAddress: "1 Main St, Illinois, USA", location: { latitude: 40, longitude: -89.9 }, types: ["gas_station", "convenience_store"], businessStatus: "OPERATIONAL", addressComponents: [{ shortText: "US", types: ["country"] }, { shortText: "IL", types: ["administrative_area_level_1"] }], googleMapsUri: mapUrl, fuelOptions: { fuelPrices: [quote()] }, attributions: [{ provider: "Provider", providerUri: "https://example.com" }] }; }

test("Google's documented polyline fixture decodes and round-trips", () => {
  const encoded = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
  const decoded = [{ lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }, { lat: 43.252, lng: -126.453 }];
  assert.deepEqual(decodeGooglePolyline(encoded), decoded);
  assert.equal(encodeGooglePolyline(decoded), encoded);
  assert.throws(() => decodeGooglePolyline(encoded.slice(0, -1)), /polyline/);
  assert.throws(() => decodeGooglePolyline("?"), /polyline/);
  assert.throws(() => decodeGooglePolyline("~~~~~~~"), /polyline/);
});

test("Google route projection uses step times and preserves exact route and leg totals", () => {
  const route = parseGoogleRoute(payload());
  assert.equal(route.miles, 20000 / METERS_PER_MILE);
  assert.equal(route.minutes, 20);
  assert.equal(route.legs.length, 1);
  assert.equal(route.points.at(-1)?.miles, route.miles);
  assert.equal(route.points.at(-1)?.minutes, route.minutes);
  assert.equal(route.points.find(point => point.lng === -89.9)?.minutes, 5);
  assert.ok(route.points.every((point, index) => !index || point.minutes >= route.points[index - 1].minutes));
  assert.throws(() => parseGoogleRoute(payload(), 2), /complete drivable/);
  const incomplete = payload(); incomplete.routes[0].legs[0].steps[0].polyline.encodedPolyline = "?";
  assert.throws(() => parseGoogleRoute(incomplete), /polyline/);
});

test("missing step duration uses geometry estimates without changing Google's leg totals", () => {
  const response = payload();
  delete (response.routes[0].legs[0].steps[0] as { staticDuration?: string }).staticDuration;
  const route = parseGoogleRoute(response);
  assert.equal(route.minutes, 20);
  assert.ok(Math.abs(route.points.find(point => point.lng === -89.9)!.minutes - 10) < 0.001);
});

test("traffic-aware leg durations determine driving, rest totals and the three-hour limit", () => {
  const response = payload(), first = response.routes[0].legs[0];
  first.duration = "1800s"; // Traffic adds ten minutes over the static step durations.
  const onward = [{ lat: 40, lng: -89.8 }, { lat: 40, lng: -89.7 }, { lat: 40, lng: -89.6 }];
  const second = { ...first, duration: "2400s", startLocation: first.endLocation, endLocation: { latLng: { latitude: 40, longitude: -89.6 } }, polyline: { encodedPolyline: encodeGooglePolyline(onward) }, steps: [] };
  response.routes[0].legs.push(second);
  response.routes[0].distanceMeters = 40000;
  response.routes[0].duration = "4200s";
  response.routes[0].polyline.encodedPolyline = encodeGooglePolyline([...points, ...onward.slice(1)]);
  const route = parseGoogleRoute(response, 2);
  assert.equal(route.minutes, 70);
  assert.deepEqual(route.legs.map(leg => leg.minutes), [30, 40]);
  assert.equal(route.points.find(point => point.lng === -89.9)?.minutes, 7.5);
  const stop = parseGoogleStations({ places: [{ ...place(), location: { latitude: 40, longitude: -89.8 } }] }, route, input, now)[0];
  stop.price = { ...stop.price!, observedAt: new Date().toISOString() };
  const search = { id: "traffic-test", expiresAt: "2026-11-20T18:00:00Z", route, stations: [stop], regions: [], warnings: [], searchedAt: new Date().toISOString() };
  const plan = buildFuelPlan(search, input, [stop], route);
  assert.equal(plan.totalMinutes, 90); // 70 minutes driving plus one 20-minute break.
  assert.equal(plan.stops[0].minutesFromStart, 30);

  first.duration = "10860s";
  response.routes[0].duration = "13260s";
  assert.throws(() => buildFuelPlan(search, input, [stop], parseGoogleRoute(response, 2)), /over three hours/);
});

test("leg polyline handles zero steps, while partial or inconsistent routes fail", () => {
  const response = payload(); response.routes[0].legs[0].steps = [];
  const route = parseGoogleRoute(response);
  assert.equal(route.points.at(-1)?.minutes, 20);
  assert.equal(route.points.at(-1)?.miles, 20000 / METERS_PER_MILE);
  assert.throws(() => parseGoogleRoute({}), /complete drivable/);
  const invalid = payload(); invalid.routes[0].distanceMeters = 22000;
  assert.throws(() => parseGoogleRoute(invalid), /inconsistent/);
  const missing = payload(); delete (missing.routes[0].legs[0] as { duration?: string }).duration;
  assert.throws(() => parseGoogleRoute(missing), /incomplete route legs/);
});

test("multi-stop route legs retain stop boundaries and monotonic cumulative values", () => {
  const response = payload(), first = response.routes[0].legs[0];
  const onward = [{ lat: 40, lng: -89.8 }, { lat: 40, lng: -89.7 }, { lat: 40, lng: -89.6 }];
  const second = { ...first, startLocation: first.endLocation, endLocation: { latLng: { latitude: 40, longitude: -89.6 } }, polyline: { encodedPolyline: encodeGooglePolyline(onward) }, steps: [] };
  response.routes[0].legs.push(second);
  response.routes[0].distanceMeters = 40000;
  response.routes[0].duration = "2400s";
  response.routes[0].polyline.encodedPolyline = encodeGooglePolyline([...points, ...onward.slice(1)]);
  const route = parseGoogleRoute(response, 2);
  assert.deepEqual(route.legs, [{ miles: 20000 / METERS_PER_MILE, minutes: 20 }, { miles: 20000 / METERS_PER_MILE, minutes: 20 }]);
  assert.equal(route.points.find(point => point.lng === -89.8)?.minutes, 20);
  assert.equal(route.points.at(-1)?.minutes, 40);
  assert.ok(route.points.every((point, index) => !index || point.miles >= route.points[index - 1].miles && point.minutes >= route.points[index - 1].minutes));
});

test("only fresh, exact-grade, valid USD station quotes become prices", () => {
  assert.equal(googleFuelPrice({ fuelPrices: [quote("PREMIUM"), quote()] }, "regular", mapUrl, now)?.perGallon, 3.259);
  for (const invalid of [quote("DIESEL"), quote("REGULAR_UNLEADED", "CAD"), quote("REGULAR_UNLEADED", "USD", "2026-11-10T00:00:00Z"), quote("REGULAR_UNLEADED", "USD", "2026-11-16T00:00:00Z"), { ...quote(), price: { currencyCode: "USD", units: "3.259" } }, { ...quote(), price: { currencyCode: "USD", units: "3", nanos: -1 } }, { ...quote(), price: { currencyCode: "USD", units: "16" } }]) {
    assert.equal(googleFuelPrice({ fuelPrices: [invalid] }, "regular", mapUrl, now), null);
  }
  assert.equal(googleFuelPrice({ fuelPrices: [{ ...quote(), price: { currencyCode: "USD", units: "3" } }] }, "regular", mapUrl, now)?.perGallon, 3);
});

test("Google station parsing binds price to a US place and excludes unrelated locations", () => {
  const route = parseGoogleRoute(payload()), valid = place();
  const stations = parseGoogleStations({ places: [valid, { ...valid, id: "canada", addressComponents: [{ shortText: "CA", types: ["country"] }] }, { ...valid, id: "far", location: { latitude: 42, longitude: -89.9 } }, { ...valid, id: "closed", businessStatus: "CLOSED_PERMANENTLY" }] }, route, input, now);
  assert.equal(stations.length, 1);
  assert.equal(stations[0].id, "google:abc");
  assert.equal(stations[0].state, "IL");
  assert.equal(stations[0].price?.source.url, mapUrl);
  assert.equal(stations[0].price?.perGallon, 3.259);
  assert.deepEqual(stations[0].amenities, []);
  assert.deepEqual(stations[0].attributions, [{ title: "Provider", url: "https://example.com/" }]);
  assert.deepEqual(parseGoogleStations({ places: [{ ...valid, restroom: true }] }, route, input, now)[0].amenities, []);
  assert.ok(Math.abs(stations[0].routeMinutes - 5) < 0.001);
  assert.equal(parseGoogleStations({ places: [{ ...valid, fuelOptions: {} }] }, route, input, now)[0].price, null);
});

test("Google requests resolve addresses directly and bound route station searches", () => {
  const request = googleRouteRequest(input.origin, input.destination);
  assert.deepEqual(request.origin, { address: input.origin });
  assert.equal(request.routingPreference, "TRAFFIC_AWARE");
  assert.ok(!("departureTime" in request));
  assert.ok(!("extraComputations" in request));
  const stop = parseGoogleStations({ places: [place()] }, parseGoogleRoute(payload()), input, now)[0];
  const throughStop = googleRouteRequest(points[0], points[2], [stop]);
  assert.equal(throughStop.routingPreference, "TRAFFIC_AWARE");
  assert.equal(throughStop.intermediates.length, 1);
  assert.ok(GOOGLE_ROUTES_FIELDS.includes("routes.legs.steps.staticDuration"));
  assert.ok(GOOGLE_PLACES_FIELDS.includes("places.fuelOptions"));
  assert.ok(!GOOGLE_PLACES_FIELDS.includes("*"));
  for (const unused of ["restroom", "types", "reviews", "photos", "openingHours", "rating"]) assert.ok(!GOOGLE_PLACES_FIELDS.includes(`places.${unused}`));
  const search = googleStationRequest(polyline);
  assert.equal(search.pageSize, 20);
  assert.equal(search.strictTypeFiltering, true);
  assert.equal(search.searchAlongRouteParameters.polyline.encodedPolyline, polyline);
  const route = parseGoogleRoute(payload());
  assert.equal(googleSearchPolylines(route).length, 1);
  const longRoute = { ...route, minutes: 600, points: Array.from({ length: 61 }, (_, i) => ({ lat: 40, lng: -90 + i / 100, minutes: i * 10, miles: i * 10 })) };
  const searches = googleSearchPolylines(longRoute);
  assert.equal(searches.length, 3);
  assert.equal(decodeGooglePolyline(searches[0])[0].lng, -90);
  assert.equal(decodeGooglePolyline(searches[2]).at(-1)?.lng, -89.4);
});
