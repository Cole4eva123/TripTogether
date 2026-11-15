import type { Coordinate, FuelPlan, FuelPreferences, FuelSearch, RegionPrice, RoadRoute, Station } from "./fuel-types.ts";
import { FuelError } from "./fuel-validation.ts";

export const METERS_PER_MILE = 1609.344;
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
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function membershipFor(station: Station, input: FuelPreferences) {
  return input.memberships.find(m => normalize(station.brand + station.name).includes(normalize(m.brand)));
}
export function stationPrice(station: Station, input: FuelPreferences, regions: RegionPrice[]) {
  const regional = regions.find(r => r.state === station.state);
  const base = station.price?.perGallon ?? regional?.average ?? input.estimatedPrice;
  if (base == null) return null;
  return {
    value: Math.max(0.05, base - (membershipFor(station, input)?.discountCents ?? 0) / 100),
    kind: station.price ? "web report" as const : regional ? "regional estimate" as const : "user estimate" as const,
  };
}
export function regionalPrices(stations: Station[], reports: RegionPrice[] = []): RegionPrice[] {
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
  result.sort((a,b) => {
    const first = (state: string) => stations.find(s => s.state === state)?.routeMiles ?? Infinity;
    return first(a.state)-first(b.state);
  });
  return result.map((r,i) => ({ ...r, change: i ? r.average-result[i-1].average : null }));
}
export function eligibleStations(search: FuelSearch, input: FuelPreferences) {
  return search.stations.filter(s => s.detourMinutes <= input.maxDetourMinutes &&
    (!s.membersOnly || membershipFor(s,input)) && stationPrice(s,input,search.regions));
}

// A forward shortest-path search balances price, extra driving and evenly spaced breaks.
// Reachability is conservative; final quantities use the road legs returned by the routing service.
export function selectStops(search: FuelSearch, input: FuelPreferences): Station[] {
  const stations = eligibleStations(search,input).sort((a,b) => a.routeMiles-b.routeMiles);
  const usableRange = input.vehicle.tankGallons * (1-input.reservePercent/100) * input.vehicle.mpg;
  const startingRange = input.vehicle.tankGallons * (input.initialFuelPercent-input.reservePercent)/100 * input.vehicle.mpg;
  if (startingRange < 0) throw new FuelError("Starting fuel is below your reserve. Refuel before leaving or correct the fuel level.");
  const nodes: (Station | null)[] = [null, ...stations, null];
  const costs = nodes.map(() => Infinity), previous = nodes.map(() => -1);
  costs[0] = 0;
  const pos = (i: number) => i === 0 ? { miles: 0, minutes: 0 } : i === nodes.length-1 ? search.route : { miles: nodes[i]!.routeMiles, minutes: nodes[i]!.routeMinutes };
  for (let j = 1; j < nodes.length; j++) {
    const to = pos(j), station = nodes[j];
    for (let i = 0; i < j; i++) {
      if (!Number.isFinite(costs[i])) continue;
      const from = pos(i), before = nodes[i];
      const miles = to.miles-from.miles + (before?.detourMiles ?? 0)/2 + (station?.detourMiles ?? 0)/2;
      const minutes = to.minutes-from.minutes + (before?.detourMinutes ?? 0)/2 + (station?.detourMinutes ?? 0)/2;
      if (miles < 0 || (station && miles < 0.05) || miles > (i === 0 ? startingRange : usableRange) || minutes > 180) continue;
      const price = (station && stationPrice(station,input,search.regions)?.value) ?? input.estimatedPrice ?? 4;
      const matches = station ? input.amenities.filter(p => station.amenities.some(a => normalize(a).includes(normalize(p)))).length : 0;
      const spacing = 10 * (minutes/input.intervalMinutes - 1)**2;
      const shortBreak = station && minutes < 60 ? 10*(1-minutes/60) : 0;
      const detour = (station?.detourMinutes ?? 0)/60*input.timeValue;
      const cost = costs[i] + miles/input.vehicle.mpg*price + (station ? 2 : 0) + spacing + shortBreak + detour - Math.min(3,matches*1.5);
      if (cost < costs[j]) { costs[j]=cost; previous[j]=i; }
    }
  }
  if (!Number.isFinite(costs.at(-1))) throw new FuelError("No safe combination was found within the fuel reserve and three-hour driving limit. Try a larger detour limit, more starting fuel, or add an estimated fuel price for stations without quotes.",422);
  const selected: Station[] = [];
  for (let j = nodes.length-1; previous[j] > 0; j=previous[j]) selected.unshift(nodes[previous[j]]!);
  if (selected.length > 23) throw new FuelError("This route needs too many stops. Split it into separate travel days.");
  return selected;
}

export function buildFuelPlan(search: FuelSearch, input: FuelPreferences, stations: Station[], route: RoadRoute): FuelPlan {
  if (route.legs.length !== stations.length+1) throw new FuelError("The routing service returned incomplete legs. Try again.",502);
  const tank = input.vehicle.tankGallons, reserve = tank*input.reservePercent/100, mpg = input.vehicle.mpg;
  const prices = stations.map(s => stationPrice(s,input,search.regions));
  if (prices.some(p => !p)) throw new FuelError("A selected station has no usable price. Enter an estimated price or choose another station.");
  let fuel = tank*input.initialFuelPercent/100, miles = 0, minutes = 0;
  const warnings = [...search.warnings];
  let purchaseCost = 0, purchased = 0;
  const stops = stations.map((station,i) => {
    const leg = route.legs[i];
    if (leg.minutes > 180.01) throw new FuelError(`The road leg to ${station.name} takes over three hours. Add an earlier stop.`,422);
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
      reason: [buyGallons > 0.01 ? "Fuel stop" : "Rest stop; no fuel purchase needed", matches.length ? `Nearby: ${matches.join(", ")}` : "Break up the drive", membershipFor(station,input) ? "Membership applied" : ""].filter(Boolean).join(" · "),
    };
    if (leg.minutes < 60) warnings.push(`Stop ${i+1} is less than one hour after the previous stop; it may be needed for fuel or your manual selection.`);
    minutes += input.stopMinutes;
    return result;
  });
  const last = route.legs.at(-1)!;
  if (last.minutes > 180.01) throw new FuelError("The final road leg takes over three hours. Add a stop before the destination.",422);
  fuel -= last.miles/mpg;
  if (fuel < reserve-0.001) throw new FuelError("The destination cannot be reached with your fuel reserve. Add a stop before arrival.",422);
  minutes += last.minutes;
  const gallonsUsed = route.miles/mpg;
  const avgPrice = purchased > 0 ? purchaseCost/purchased : input.estimatedPrice ?? search.regions[0]?.average ?? search.stations.find(s => s.price)?.price?.perGallon;
  if (avgPrice == null) throw new FuelError("Enter an estimated fuel price to calculate the value of fuel already in your tank.");
  if (stops.some(s => s.priceKind !== "web report")) warnings.push("Some prices are regional or user estimates. Compare the posted pump price before purchasing.");
  warnings.push("Driving times exclude live traffic. Opening hours, facilities and prices may change; confirm before arrival.");
  const fuelConsumedCost = gallonsUsed*avgPrice;
  return {
    searchId: search.id, route, stops, arrival: new Date(Date.parse(input.departure)+minutes*60000).toISOString(),
    totalMinutes: minutes, detourMinutes: Math.max(0,route.minutes-search.route.minutes), detourMiles: Math.max(0,route.miles-search.route.miles),
    gallonsUsed, gallonsPurchased: purchased, fuelOnArrival: Math.max(0,fuel), purchaseCost,
    fuelConsumedCost, totalCost: fuelConsumedCost+input.otherCosts, warnings: [...new Set(warnings)],
  };
}
