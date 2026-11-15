import { randomUUID } from "node:crypto";
import type { FuelPlan, FuelPreferences, FuelSearch, Station } from "./fuel-types";
import { addressFor, findStations, geocode, geocodedState, nearbyTown, normalizeState, roadRoute } from "./fuel-maps";
import { researchPrices, researchStationAddresses } from "./fuel-ai";
import { buildFuelPlan, eligibleStations, projectOnRoute, regionalPrices, selectStops } from "./gasoline-intelligence";
import { FuelError, object, text } from "./fuel-validation";
import { currentUser, needLogin } from "./server";
import { statePriceReports } from "./fuel-region-provider";

type StoredSearch = { ownerId:string;input:FuelPreferences;search:FuelSearch;expires:number;plans:Map<string,FuelPlan> };
type ServiceState = { searches:Map<string,StoredSearch>;limits:Map<string,{start:number;count:number}> };
const g=globalThis as typeof globalThis & { fuelServiceState?:ServiceState };
const service=g.fuelServiceState ??= {searches:new Map(),limits:new Map()};
export async function fuelUser(action: string, limit = 6) {
  const user=await currentUser();
  if (!user) return needLogin();
  const key=`${user.id}:${action}`, now=Date.now();
  for (const [id,b] of service.limits) if (now-b.start > 300000) service.limits.delete(id);
  const bucket=service.limits.get(key) ?? {start:now,count:0};
  if (++bucket.count > limit) throw new FuelError("Too many requests. Wait five minutes before trying again.",429);
  service.limits.set(key,bucket);
  return user;
}
export function fuelFailure(error: unknown) {
  return Response.json({error:error instanceof FuelError ? error.message : "The fuel planner could not complete the request. Try again."},{status:error instanceof FuelError ? error.status : 500});
}
export async function searchFuel(ownerId: string, input: FuelPreferences): Promise<FuelSearch> {
  const origin=await geocode(input.origin), destination=await geocode(input.destination);
  const route=await roadRoute(origin,destination);
  const warnings=["Detours shown for candidate stations are geometric estimates. The final plan recalculates actual road distances and times."];
  let stations:Station[];
  try {
    if(process.env.FUEL_STATION_PROVIDER==="web")throw new FuelError("Web station research selected.");
    stations=await findStations(route,input);
  }
  catch(error) {
    if(!process.env.DEEPSEEK_API_KEY)throw error;
    warnings.push("Station candidates use cited web locators and geocoded addresses. Facilities are included only when explicitly reported on the station source page; other nearby amenities may be missing.");
    stations=[];
    const towns:string[]=[];
    const count=Math.min(12,Math.max(3,Math.ceil(route.minutes/60)+1));
    for(let i=0;i<count;i++) {
      const target=route.minutes*i/(count-1);
      const point=route.points.reduce((best,p)=>Math.abs(p.minutes-target)<Math.abs(best.minutes-target)?p:best,route.points[0]);
      towns.push(await nearbyTown(point));
    }
    let unmatchedAddresses=0;
    for(const draft of await researchStationAddresses(route,towns)) {
      try {
        const location=await geocode(draft.address),projection=projectOnRoute(location,route);
        if(projection.offRoute>3 || projection.miles>=route.miles-0.2)continue;
        const detourMiles=projection.offRoute*2.6;
        stations.push({id:`web:${stations.length}`,name:draft.name,brand:draft.brand,address:draft.address,state:normalizeState(draft.state),
          location,routeMiles:projection.miles,routeMinutes:projection.minutes,detourMiles,detourMinutes:detourMiles/25*60+2,
          amenities:draft.amenities,membersOnly:/costco|sam.?s club/i.test(draft.name),price:null,open:"Hours not confirmed",
          mapUrl:`https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=18/${location.lat}/${location.lng}`,source:draft.source});
      }catch{unmatchedAddresses++;}
    }
    if(unmatchedAddresses)warnings.push(`${unmatchedAddresses} web station addresses could not be geocoded and were excluded.`);
    stations.sort((a,b)=>a.routeMiles-b.routeMiles);
  }
  if (!stations.length) throw new FuelError("No mapped gas stations were found near this route. Try more specific locations or split the trip.",404);
  // Reverse-geocode only the stations about to be researched, with caching and a shared 1/s limit.
  const indexes=[...new Set(Array.from({length:Math.min(16,stations.length)},(_,i) => Math.round(i*(stations.length-1)/Math.max(1,Math.min(16,stations.length)-1))))];
  for (const index of indexes) {
    try { stations[index]=await addressFor(stations[index]); } catch { warnings.push("Some station addresses or states could not be resolved."); break; }
  }
  const [prices,officialReports]=await Promise.all([researchPrices(stations,input.vehicle.grade),statePriceReports(input.vehicle.grade).catch(()=>[])]);
  stations=prices.stations;
  if (prices.warning) warnings.push(prices.warning);
  const now=Date.now(), id=randomUUID();
  const routeStates=new Set([...stations.map(s=>s.state),geocodedState(input.origin),geocodedState(input.destination)]);
  const reports=[...officialReports.filter(r=>routeStates.has(r.state)),...prices.reports.filter(r=>!officialReports.some(a=>a.state===r.state))];
  if(!officialReports.length)warnings.push("AAA state averages are unavailable or outdated; only other cited reports and your estimate can be used.");
  const search: FuelSearch={id,expiresAt:new Date(now+1800000).toISOString(),route,stations,regions:regionalPrices(stations,reports),warnings:[...new Set(warnings)],searchedAt:new Date(now).toISOString()};
  for (const [key,entry] of service.searches) if (entry.expires < now) service.searches.delete(key);
  if (service.searches.size >= 24) service.searches.delete(service.searches.keys().next().value!);
  service.searches.set(id,{ownerId,input,search,expires:now+1800000,plans:new Map()});
  return search;
}
export async function planFuel(ownerId: string, value: unknown): Promise<FuelPlan> {
  const body=object(value), id=text(body.searchId,"Search id",80), entry=service.searches.get(id);
  if (!entry || entry.ownerId !== ownerId || entry.expires < Date.now()) throw new FuelError("This route search has expired. Search again before planning.",410);
  const {search,input}=entry;
  let selected: Station[];
  if (body.stationIds === undefined) selected=selectStops(search,input);
  else {
    if (!Array.isArray(body.stationIds) || body.stationIds.length > 23 || body.stationIds.some(s => typeof s !== "string") || new Set(body.stationIds).size !== body.stationIds.length) {
      throw new FuelError("Choose up to 23 distinct stops.");
    }
    const ids=body.stationIds as string[], eligible=eligibleStations(search,input);
    selected=ids.map(id => {
      const station=eligible.find(s => s.id === id);
      if (!station) throw new FuelError("A stop is unavailable with your current membership, price or detour settings.");
      return station;
    }).sort((a,b) => a.routeMiles-b.routeMiles);
  }
  const key=selected.map(s => s.id).join(";");
  const cached=entry.plans.get(key);
  if (cached) return cached;
  const route=selected.length ? await roadRoute(search.route.origin,search.route.destination,selected) : search.route;
  for (let i=0;i<selected.length;i++) {
    try { selected[i]=await addressFor(selected[i]); } catch { /* Keep mapped coordinates if the address service is unavailable. */ }
  }
  const plan=buildFuelPlan(search,input,selected,route);
  if (plan.detourMinutes > input.maxDetourMinutes*Math.max(1,selected.length)) throw new FuelError("The actual road detour is much longer than the candidate estimate. Choose other stations or increase the detour limit.",422);
  if (entry.plans.size >= 16) entry.plans.delete(entry.plans.keys().next().value!);
  entry.plans.set(key,plan);
  return plan;
}
