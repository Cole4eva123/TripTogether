import type { Coordinate, FuelPlan, FuelPreferences, FuelSearch, RegionPrice, RoadRoute, Station } from "./types.ts";
import { FuelError } from "./validation.ts";

export const METERS_PER_MILE = 1609.344;
export type PlanningSearch = Pick<FuelSearch,"route"|"stations"|"regions">;
export function distanceMiles(a: Coordinate, b: Coordinate) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 3958.7613 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

// Project onto segments, rather than their vertices, to avoid clumping stations at road junctions.
export function projectOnRoute(location: Coordinate, route: RoadRoute) {
  let best = { miles: 0, minutes: 0, offRoute: Infinity };
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1], b = route.points[i];
    const scale = Math.cos(location.lat * Math.PI / 180);
    const x = (b.lng - a.lng) * scale, y = b.lat - a.lat;
    const t = Math.max(0, Math.min(1, (((location.lng - a.lng) * scale * x) + (location.lat - a.lat) * y) / (x*x + y*y || 1)));
    const offRoute = distanceMiles(location, { lat: a.lat + t*y, lng: a.lng + t*(b.lng-a.lng) });
    if (offRoute < best.offRoute) best = { miles: a.miles + t*(b.miles-a.miles), minutes: a.minutes + t*(b.minutes-a.minutes), offRoute };
  }
  return best;
}
/**
 * The same search or plan with a route light enough to send: Google's 75 points a mile make a cross-country
 * route 13 MB of JSON, and the map only draws a line through them. The server keeps every point to plan on.
 */
export function thinRoute<T extends { route: RoadRoute }>(value: T, max = 5000): T {
  const { points } = value.route, step = Math.ceil(points.length / max);
  // ponytail: every nth point, which cuts corners by a few dozen metres when zoomed right in. Douglas-Peucker if that shows.
  return step <= 1 ? value : { ...value, route: { ...value.route, points: points.filter((_, index) => index % step === 0 || index === points.length - 1) } };
}
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function membershipFor(station: Station, input: FuelPreferences) {
  return input.memberships.find(m => normalize(station.brand + station.name).includes(normalize(m.brand)));
}
export function hasVerifiedStationPrice(station: Station, now=Date.now()) {
  const price=station.price;
  if(!price || !Number.isFinite(price.perGallon) || price.perGallon<0.5 || price.perGallon>15)return false;
  const observed=Date.parse(price.observedAt);
  if(!Number.isFinite(observed) || observed>now+3600000 || now-observed>72*3600000)return false;
  try { const url=new URL(price.source.url);return (url.protocol==="https:" || url.protocol==="http:") && !!url.hostname; }
  catch {return false;}
}
export function stationPrice(station: Station, input: FuelPreferences, regions: RegionPrice[]) {
  if(input.requireStationPrices!==false && !hasVerifiedStationPrice(station))return null;
  const regional = regions.find(r => r.state === station.state);
  const base = station.price?.perGallon ?? regional?.average ?? input.estimatedPrice;
  if (base == null) return null;
  return {
    value: Math.max(0.05, base - (membershipFor(station, input)?.discountCents ?? 0) / 100),
    kind: station.price ? "web report" as const : regional ? "regional estimate" as const : "user estimate" as const,
  };
}
export function regionalPrices(stations: Station[], reports: RegionPrice[] = [], orderedStates: string[] = []): RegionPrice[] {
  const grouped = new Map<string, Station[]>();
  for (const s of stations) {
    if (!s.state || !s.price) continue;
    grouped.set(s.state, [...(grouped.get(s.state) ?? []), s]);
  }
  const result: RegionPrice[] = [...grouped].map(([state, entries]) => reports.find(r=>r.state===state) ?? ({
    state, average: entries.reduce((n,s) => n + s.price!.perGallon, 0) / entries.length,
    count: entries.length, kind: "station sample", source: null,
    observedAt: entries.map(s => s.price!.observedAt).sort()[0], change: null,
  }));
  for (const report of reports) if (!grouped.has(report.state)) result.push(report);
  // The service can include endpoint states with no station. Otherwise, use the earliest mapped
  // occurrence of each state, including unpriced stations; source/price order must not drive the cards.
  const routeOrder = new Map<string, number>();
  const mappedStates = [...stations].filter(station => Number.isFinite(station.routeMiles))
    .sort((a,b) => a.routeMiles-b.routeMiles).map(station => station.state);
  for (const state of [...orderedStates,...mappedStates]) {
    if (state && !routeOrder.has(state)) routeOrder.set(state,routeOrder.size);
  }
  result.sort((a,b) => (routeOrder.get(a.state) ?? Number.MAX_SAFE_INTEGER) - (routeOrder.get(b.state) ?? Number.MAX_SAFE_INTEGER));
  return result.map((r,i) => ({ ...r, change: i ? r.average-result[i-1].average : null }));
}
/** The stations a plan may buy from: ones with a usable price that the driver is allowed to use. */
export function eligibleStations(search: PlanningSearch, input: FuelPreferences) {
  return search.stations.filter(s => (!s.membersOnly || membershipFor(s,input)) && stationPrice(s,input,search.regions));
}

type Stop = { station: Station | null; miles: number; spur: number; location: Coordinate };
/** The trip as the solver sees it: the origin, the given stations in route order, the destination. */
function stopsAlong(route: RoadRoute, stations: Station[]): Stop[] {
  return [{ station: null, miles: 0, spur: 0, location: route.origin },
    ...stations.map(s => ({ station: s, miles: s.routeMiles, spur: s.detourMiles/2, location: s.location })),
    { station: null, miles: route.miles, spur: 0, location: route.destination }];
}
// Road miles between two stops, estimated: along the route, plus the way off it and back on. Never less than
// the straight line. The final Google route through the chosen stations replaces these with real legs.
const estimatedMiles = (from: Stop, to: Stop) =>
  Math.max(to.miles-from.miles+from.spur+to.spur, distanceMiles(from.location,to.location));

/** How much longer the real road legs through `stations` are than the estimates they were chosen on. */
export function worstLegRatio(search: PlanningSearch, stations: Station[], route: RoadRoute) {
  const stops = stopsAlong(search.route,stations);
  return Math.max(1,...route.legs.map((leg,i) => leg.miles/Math.max(0.1,estimatedMiles(stops[i],stops[i+1]))));
}

type Arrival = { fuel: number; cost: number; stops: number; from: Arrival | null; at: number };
const cheaper = (a: Arrival, b: Arrival) => a.cost < b.cost-1e-9 || (a.cost < b.cost+1e-9 && a.stops < b.stops);

/**
 * The stations to buy at so the whole trip costs the least at the pump, never dropping below the reserve.
 *
 * Exact over the stations given ("To fill or not to fill", Khuller, Malekian and Mestre): between two purchases
 * the cheapest plan either fills up (the next stop is dearer) or buys just enough to arrive at the reserve (the
 * next stop is cheaper, or is the destination), so only those arrival fuel levels need to be tried. Fuel here is
 * gallons above the reserve. `scale` stretches the estimated distances when real road legs came back longer.
 */
export function cheapestStops(search: PlanningSearch, input: FuelPreferences, scale = 1): Station[] {
  const { tankGallons, mpg } = input.vehicle;
  const capacity = tankGallons*(1-input.reservePercent/100);
  const startFuel = tankGallons*(input.initialFuelPercent-input.reservePercent)/100;
  if (startFuel < 0) throw new FuelError("Starting fuel is below your reserve. Refuel before leaving or correct the fuel level.");
  // ponytail: stops are only visited in route order, so a plan never doubles back; fine inside a corridor.
  const stops = stopsAlong(search.route,eligibleStations(search,input).sort((a,b) => a.routeMiles-b.routeMiles));
  const prices = stops.map(stop => stop.station ? stationPrice(stop.station,input,search.regions)!.value : 0);
  const last = stops.length-1;
  // arrivals[i]: the cheapest way to reach stop i with each fuel level worth trying, keyed by that level.
  const arrivals: Map<number,Arrival>[] = stops.map(() => new Map());
  arrivals[0].set(0,{ fuel: startFuel, cost: 0, stops: 0, from: null, at: 0 });
  const reach = (to: number, next: Arrival) => {
    const key = Math.round(next.fuel*1e6), known = arrivals[to].get(key);
    if (!known || cheaper(next,known)) arrivals[to].set(key,next);
  };
  for (let i = 0; i < last; i++) for (let j = i+1; j <= last; j++) {
    if ((stops[j].miles-stops[i].miles)*scale/mpg > capacity) break; // every later stop is further still
    const need = estimatedMiles(stops[i],stops[j])*scale/mpg;
    if (need > capacity+1e-9) continue;
    for (const here of arrivals[i].values()) {
      const next = { stops: here.stops+(i ? 1 : 0), from: here, at: j };
      if (i === 0) { // nothing to buy at the origin: drive on what is in the tank
        if (need <= here.fuel+1e-9) reach(j,{ ...next, fuel: Math.max(0,here.fuel-need), cost: 0 });
      } else if (j === last || prices[j] <= prices[i]) { // buy just enough to arrive at the reserve
        if (here.fuel <= need) reach(j,{ ...next, fuel: 0, cost: here.cost+(need-here.fuel)*prices[i] });
      } else reach(j,{ ...next, fuel: capacity-need, cost: here.cost+(capacity-here.fuel)*prices[i] });
    }
  }
  let best: Arrival | null = null;
  for (const arrival of arrivals[last].values()) if (!best || cheaper(arrival,best)) best = arrival;
  if (!best) {
    const farthest = stops[arrivals.findLastIndex(found => found.size > 0)].miles;
    throw new FuelError(`No fuel plan keeps you above your reserve: with the stations that have a recent price, the car gets no further than mile ${farthest.toFixed(0)} of ${search.route.miles.toFixed(0)}. Start with more fuel or lower the reserve, then search again.`,422);
  }
  const selected: Station[] = [];
  for (let arrival = best.from; arrival?.from; arrival = arrival.from) selected.unshift(stops[arrival.at].station!);
  if (selected.length > 23) throw new FuelError("This route needs too many stops. Split it into separate travel days.");
  return selected;
}

export function buildFuelPlan(search: FuelSearch, input: FuelPreferences, stations: Station[], route: RoadRoute, restWarningMinutes = 180): FuelPlan {
  if (route.legs.length !== stations.length+1) throw new FuelError("The routing service returned incomplete legs. Try again.",502);
  const tank = input.vehicle.tankGallons, reserve = tank*input.reservePercent/100, mpg = input.vehicle.mpg;
  const prices = stations.map(s => stationPrice(s,input,search.regions));
  if (prices.some(p => !p)) throw new FuelError(input.requireStationPrices!==false ? "A selected station has no recent, verified station price. Search again for station quotes." : "A selected station has no usable price. Enter an estimated price or choose another station.");
  let fuel = tank*input.initialFuelPercent/100, miles = 0, minutes = 0;
  const warnings = [...search.warnings];
  let purchaseCost = 0, purchased = 0;
  const stops = stations.map((station,i) => {
    const leg = route.legs[i];
    fuel -= leg.miles/mpg;
    if (fuel < reserve-0.001) throw new FuelError(`The road leg to ${station.name} cannot be reached with your fuel reserve. Add an earlier stop or increase starting fuel.`,422);
    const arrivalFuel = Math.max(0,fuel), price = prices[i]!;
    miles += leg.miles; minutes += leg.minutes;
    // Buy just enough to reach the next cheaper station; otherwise cover all remaining miles, capped at a full tank.
    let requiredMiles = 0;
    for (let j=i+1; j<route.legs.length; j++) {
      requiredMiles += route.legs[j].miles;
      if (j < prices.length && prices[j]!.value < price.value) break;
    }
    const target = Math.min(tank,requiredMiles/mpg+reserve);
    const buyGallons = Math.max(0,target-fuel);
    fuel += buyGallons; purchased += buyGallons; purchaseCost += buyGallons*price.value;
    if (route.legs[i+1].miles/mpg > fuel-reserve+0.001) throw new FuelError(`The leg after ${station.name} exceeds the vehicle's usable range. Add another stop.`,422);
    const matches = input.amenities.filter(p => station.amenities.some(a => normalize(a).includes(normalize(p))));
    const result = {
      station, number: i+1, legMiles: leg.miles, legMinutes: leg.minutes, milesFromStart: miles,
      minutesFromStart: minutes, arrival: new Date(Date.parse(input.departure)+minutes*60000).toISOString(),
      gallonsOnArrival: arrivalFuel, buyGallons, fuelAfterStop: fuel, pricePerGallon: price.value, priceKind: price.kind,
      cost: buyGallons*price.value,
      reason: [buyGallons > 0.01 ? "Fuel stop" : "Rest stop; no fuel purchase needed", matches.length ? `Nearby: ${matches.join(", ")}` : "", membershipFor(station,input) ? "Membership applied" : ""].filter(Boolean).join(" · "),
    };
    minutes += input.stopMinutes;
    return result;
  });
  const last = route.legs.at(-1)!;
  const longest = Math.round(Math.max(...route.legs.map(leg => leg.minutes)));
  if (longest > restWarningMinutes) warnings.push(`The longest stretch between stops is ${Math.floor(longest/60)}h ${longest%60}m of driving. Stops are chosen for fuel cost only, so plan your own breaks.`);
  fuel -= last.miles/mpg;
  if (fuel < reserve-0.001) throw new FuelError("The destination cannot be reached with your fuel reserve. Add a stop before arrival.",422);
  minutes += last.minutes;
  const gallonsUsed = route.miles/mpg;
  if (stops.some(s => s.priceKind !== "web report")) warnings.push("Some prices are regional or user estimates. Compare the posted pump price before purchasing.");
  warnings.push("Driving times account for traffic at lookup and may change. Opening hours, facilities and prices may change; confirm before arrival.");
  return {
    searchId: search.id, route, stops, arrival: new Date(Date.parse(input.departure)+minutes*60000).toISOString(),
    totalMinutes: minutes, detourMinutes: Math.max(0,route.minutes-search.route.minutes), detourMiles: Math.max(0,route.miles-search.route.miles),
    gallonsUsed, gallonsPurchased: purchased, fuelOnArrival: Math.max(0,fuel), purchaseCost,
    warnings: [...new Set(warnings)],
  };
}
