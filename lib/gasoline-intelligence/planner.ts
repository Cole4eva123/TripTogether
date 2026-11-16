import type { Coordinate, FuelPlan, FuelPreferences, FuelSearch, RegionPrice, RoadRoute, Station } from "./types.ts";
import { FuelError } from "./validation.ts";

export const METERS_PER_MILE = 1609.344;
export const MAX_DRIVING_MINUTES = 180;
export type PlanningSearch = Pick<FuelSearch,"route"|"stations"|"regions">;
export type CoverageGap = {
  fromMiles:number;toMiles:number;fromMinutes:number;toMinutes:number;
  drivingMinutes:number;maxMiles:number;reason:"driving time"|"fuel range";
};
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
export function eligibleStations(search: PlanningSearch, input: FuelPreferences, requirePrice=true) {
  return search.stations.filter(s => s.detourMinutes <= input.maxDetourMinutes &&
    (!s.membersOnly || membershipFor(s,input)) && (!requirePrice || stationPrice(s,input,search.regions)));
}

export function findCoverageGaps(search:PlanningSearch,input:FuelPreferences,geometryOnly=false):CoverageGap[] {
  const stations=eligibleStations(search,input,!geometryOnly).sort((a,b)=>a.routeMiles-b.routeMiles);
  const positions=[{miles:0,minutes:0,detourMiles:0,detourMinutes:0},
    ...stations.map(s=>({miles:s.routeMiles,minutes:s.routeMinutes,detourMiles:s.detourMiles,detourMinutes:s.detourMinutes})),
    {miles:search.route.miles,minutes:search.route.minutes,detourMiles:0,detourMinutes:0}];
  const gaps:CoverageGap[]=[];
  for(let i=1;i<positions.length;i++) {
    const from=positions[i-1],to=positions[i];
    const miles=to.miles-from.miles+(from.detourMiles+to.detourMiles)/2;
    const minutes=to.minutes-from.minutes+(from.detourMinutes+to.detourMinutes)/2;
    const availablePercent=i===1?input.initialFuelPercent-input.reservePercent:100-input.reservePercent;
    const maxMiles=input.vehicle.tankGallons*availablePercent/100*input.vehicle.mpg;
    if(minutes>MAX_DRIVING_MINUTES || miles>maxMiles)gaps.push({
      fromMiles:from.miles,toMiles:to.miles,fromMinutes:from.minutes,toMinutes:to.minutes,
      drivingMinutes:minutes,maxMiles,reason:minutes>MAX_DRIVING_MINUTES?"driving time":"fuel range",
    });
  }
  return gaps;
}

// Fuel-price scoring plus nonmonetary preferences for evenly spaced breaks and facilities.
// Reachability is conservative; final quantities use the road legs returned by the routing service.
export function selectStops(search: PlanningSearch, input: FuelPreferences, geometryOnly=false): Station[] {
  const stations = eligibleStations(search,input,!geometryOnly).sort((a,b) => a.routeMiles-b.routeMiles);
  const usableRange = input.vehicle.tankGallons * (1-input.reservePercent/100) * input.vehicle.mpg;
  const startingRange = input.vehicle.tankGallons * (input.initialFuelPercent-input.reservePercent)/100 * input.vehicle.mpg;
  if (startingRange < 0) throw new FuelError("Starting fuel is below your reserve. Refuel before leaving or correct the fuel level.");
  const nodes: (Station | null)[] = [null, ...stations, null];
  const scores = nodes.map(() => Infinity), previous = nodes.map(() => -1);
  scores[0] = 0;
  const pos = (i: number) => i === 0 ? { miles: 0, minutes: 0 } : i === nodes.length-1 ? search.route : { miles: nodes[i]!.routeMiles, minutes: nodes[i]!.routeMinutes };
  for (let j = 1; j < nodes.length; j++) {
    const to = pos(j), station = nodes[j];
    for (let i = 0; i < j; i++) {
      if (!Number.isFinite(scores[i])) continue;
      const from = pos(i), before = nodes[i];
      const miles = to.miles-from.miles + (before?.detourMiles ?? 0)/2 + (station?.detourMiles ?? 0)/2;
      const minutes = to.minutes-from.minutes + (before?.detourMinutes ?? 0)/2 + (station?.detourMinutes ?? 0)/2;
      if (miles < 0 || (station && miles < 0.05) || miles > (i === 0 ? startingRange : usableRange) || minutes > MAX_DRIVING_MINUTES) continue;
      // The geometry pass ranks reachability only; it never creates or stores quote values.
      const price = geometryOnly ? 1 : (station && stationPrice(station,input,search.regions)?.value) ??
        (before && stationPrice(before,input,search.regions)?.value) ?? (input.requireStationPrices===false ? input.estimatedPrice ?? 4 : 0);
      const matches = station ? input.amenities.filter(p => station.amenities.some(a => normalize(a).includes(normalize(p)))).length : 0;
      const spacing = 10 * (minutes/input.intervalMinutes - 1)**2;
      const shortBreak = station && minutes < 60 ? 10*(1-minutes/60) : 0;
      const score = scores[i] + miles/input.vehicle.mpg*price + spacing + shortBreak - Math.min(3,matches*1.5);
      if (score < scores[j]) { scores[j]=score; previous[j]=i; }
    }
  }
  if (!Number.isFinite(scores.at(-1))) {
    if(!geometryOnly && input.requireStationPrices!==false) {
      let geometryReachable=false;
      try {selectStops(search,input,true);geometryReachable=true;}catch {/* The original geometry error is reported below. */}
      if(geometryReachable)throw new FuelError("Not enough verified station prices were found to plan this route within your fuel reserve and driving limits. Stations without a recent, cited quote are excluded; state averages and fallback estimates are not used.",422);
    }
    const gap=findCoverageGaps(search,input,geometryOnly)[0];
    const detail=gap?` Eligible station coverage is missing between miles ${gap.fromMiles.toFixed(0)} and ${gap.toMiles.toFixed(0)} (${Math.round(gap.drivingMinutes)} driving minutes between available stops), exceeding ${gap.reason==="driving time"?"the three-hour driving limit":"the available fuel range"}.`:"";
    throw new FuelError(`No safe combination was found.${detail} Search again to look for more stations in the missing section, or review the detour, membership and price settings.`,422);
  }
  const selected: Station[] = [];
  for (let j = nodes.length-1; previous[j] > 0; j=previous[j]) selected.unshift(nodes[previous[j]]!);
  if (selected.length > 23) throw new FuelError("This route needs too many stops. Split it into separate travel days.");
  return selected;
}

export function buildFuelPlan(search: FuelSearch, input: FuelPreferences, stations: Station[], route: RoadRoute): FuelPlan {
  if (route.legs.length !== stations.length+1) throw new FuelError("The routing service returned incomplete legs. Try again.",502);
  const tank = input.vehicle.tankGallons, reserve = tank*input.reservePercent/100, mpg = input.vehicle.mpg;
  const prices = stations.map(s => stationPrice(s,input,search.regions));
  if (prices.some(p => !p)) throw new FuelError(input.requireStationPrices!==false ? "A selected station has no recent, verified station price. Search again for station quotes." : "A selected station has no usable price. Enter an estimated price or choose another station.");
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
  if (stops.some(s => s.priceKind !== "web report")) warnings.push("Some prices are regional or user estimates. Compare the posted pump price before purchasing.");
  warnings.push("Driving times exclude live traffic. Opening hours, facilities and prices may change; confirm before arrival.");
  return {
    searchId: search.id, route, stops, arrival: new Date(Date.parse(input.departure)+minutes*60000).toISOString(),
    totalMinutes: minutes, detourMinutes: Math.max(0,route.minutes-search.route.minutes), detourMiles: Math.max(0,route.miles-search.route.miles),
    gallonsUsed, gallonsPurchased: purchased, fuelOnArrival: Math.max(0,fuel), purchaseCost,
    warnings: [...new Set(warnings)],
  };
}
