import { randomUUID } from "node:crypto";
import type { FuelPlan, FuelPreferences, FuelSearch, RegionPrice, RoadRoute, Station } from "./types";
import { addressFor, findStations, geocode, geocodedState, roadRoute } from "./maps";
import { researchPrices } from "./ai";
import { buildFuelPlan, eligibleStations, hasVerifiedStationPrice, regionalPrices, selectStops } from "./planner";
import { FuelError, object, text } from "./validation";
import { currentUser, needLogin } from "../server";
import { statePriceReports } from "./region-provider";
import { fillStationCoverage, pointAlongRoute, unpricedCandidatesForGaps } from "./coverage";
import { webStations } from "./stations";
import { PLAN_BUDGET_MS, SEARCH_BUDGET_MS, remainingFuelMs, withFuelBudget } from "./budget";
import { fuelDataProvider } from "./provider";
import { googleRoadRoute, googleSearchRoute } from "./google";

type StoredSearch = { ownerId:string;input:FuelPreferences;search:FuelSearch;expires:number;plans:Map<string,FuelPlan> };
type ServiceState = { searches:Map<string,StoredSearch>;limits:Map<string,{start:number;count:number}> };
const g=globalThis as typeof globalThis & { fuelServiceState?:ServiceState };
const service:ServiceState=g.fuelServiceState ??= {searches:new Map(),limits:new Map()};
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
  try { return await withFuelBudget(SEARCH_BUDGET_MS,()=>searchWithinBudget(ownerId,input)); }
  catch(error) {
    if(error instanceof Error && ["TimeoutError","AbortError"].includes(error.name))throw new FuelError("Route lookup timed out. Try more specific locations or search again.",504);
    throw error;
  }
}
async function searchWithinBudget(ownerId: string, input: FuelPreferences): Promise<FuelSearch> {
  if (fuelDataProvider(process.env) === "google") {
    const { route, stations, warnings } = await googleSearchRoute(input);
    if (!stations.length) throw new FuelError("No Google gas stations were found near this route. Try more specific locations or split the trip.", 404);
    warnings.push("Candidate detours are approximate. The final plan verifies road distances and driving times.");
    if (!stations.some(hasVerifiedStationPrice)) warnings.push("Google has no recent prices for the selected fuel grade on these stations. Unknown prices are excluded from recommendations.");
    // Google already supplies station addresses and prices. Avoid web research,
    // reverse geocoding and regional HTML fetches on this path.
    return storeSearch(ownerId, input, route, stations, regionalPrices(stations), warnings, "google");
  }
  const origin=await geocode(input.origin), destination=await geocode(input.destination);
  // Warm the provider cache while routing/discovery runs; later calls ask for every route state.
  void statePriceReports(input.vehicle.grade,[geocodedState(input.origin),geocodedState(input.destination)].filter(Boolean)).catch(()=>[]);
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
    const count=Math.min(12,Math.max(3,Math.ceil(route.minutes/90)+1));
    const found=await webStations(route,Array.from({length:count},(_,i)=>pointAlongRoute(route,route.minutes*i/(count-1))));
    stations=found.stations;
    if(found.unmatchedAddresses)warnings.push(`${found.unmatchedAddresses} web station addresses could not be geocoded and were excluded.`);
  }
  // Resolve only the price sample; the public geocoder remains globally throttled.
  async function resolveSampleAddresses() {
    const indexes=[...new Set(Array.from({length:Math.min(16,stations.length)},(_,i) => Math.round(i*(stations.length-1)/Math.max(1,Math.min(16,stations.length)-1))))];
    for (const index of indexes) {
      try { stations[index]=await addressFor(stations[index]); } catch { warnings.push("Some station addresses or states could not be resolved."); break; }
    }
  }
  await resolveSampleAddresses();
  const initialStates=[...new Set([...stations.map(s=>s.state),geocodedState(input.origin),geocodedState(input.destination)].filter(Boolean))];
  const officialReports:RegionPrice[]=[];
  // Regional comparisons are optional and must not delay the station-specific recommendation.
  void statePriceReports(input.vehicle.grade,initialStates).then(reports=>officialReports.push(...reports)).catch(()=>[]);
  if(process.env.DEEPSEEK_API_KEY && remainingFuelMs()>45000) {
    const expanded=await fillStationCoverage({route,stations,regions:officialReports},input,async points=>{
      const found=await webStations(route,points,true);
      if(found.unmatchedAddresses)warnings.push(`${found.unmatchedAddresses} extra station addresses could not be geocoded and were excluded.`);
      return found.stations;
    },1);
    stations=expanded.stations;warnings.push(...expanded.warnings);
  }
  if (!stations.length) throw new FuelError("No mapped gas stations were found near this route. Try more specific locations or split the trip.",404);
  await resolveSampleAddresses();
  const addedStates=[...new Set(stations.map(s=>s.state).filter(s=>s && !initialStates.includes(s)))];
  if(addedStates.length) void statePriceReports(input.vehicle.grade,addedStates).then(reports=>officialReports.push(...reports)).catch(()=>[]);
  const prices=await researchPrices(stations,input.vehicle.grade,[]);
  stations=prices.stations;
  if (prices.warning) warnings.push(prices.warning);
  if(input.requireStationPrices!==false && process.env.DEEPSEEK_API_KEY) {
    const researchedIds=new Set((stations.length<=16?stations:Array.from({length:16},(_,i)=>stations[Math.round(i*(stations.length-1)/15)])).map(station=>station.id));
    const quotedPathAvailable=()=>{
      try {selectStops({route,stations,regions:officialReports},input);return true;}
      catch(error) {if(!(error instanceof FuelError) || error.status!==422)throw error;return false;}
    };
    async function quoteCandidates(candidates:Station[]) {
      if(!candidates.length)return candidates;
      const sample=candidates.length<=16?candidates:Array.from({length:16},(_,i)=>candidates[Math.round(i*(candidates.length-1)/15)]);
      sample.forEach(station=>researchedIds.add(station.id));
      const result=await researchPrices(sample,input.vehicle.grade,[]);
      if(result.warning)warnings.push(result.warning);
      const updates=new Map(result.stations.map(station=>[station.id,station]));
      return candidates.map(station=>updates.get(station.id) ?? station);
    }
    if(!quotedPathAvailable() && remainingFuelMs()>18000) {
      const candidates=unpricedCandidatesForGaps({route,stations,regions:officialReports},input,researchedIds,8);
      const updates=new Map((await quoteCandidates(candidates)).map(station=>[station.id,station]));
      stations=stations.map(station=>updates.get(station.id) ?? station);
    }
    // Do not start another paid discovery chain after quote lookup. A later explicit search can retry.
  }
  const routeStates=new Set([...stations.map(s=>s.state),geocodedState(input.origin),geocodedState(input.destination)]);
  const reports=[...officialReports.filter(r=>routeStates.has(r.state)),...prices.reports.filter(r=>!officialReports.some(a=>a.state===r.state))];
  if(!officialReports.length)warnings.push(input.requireStationPrices!==false ? "Regional comparison prices are unavailable. Recommended stops still require verified station-specific quotes." : "Regional price providers are unavailable or outdated; only other cited reports and your estimate can be used.");
  const orderedStates=[geocodedState(input.origin),...[...stations].sort((a,b)=>a.routeMiles-b.routeMiles).map(station=>station.state),geocodedState(input.destination)].filter(Boolean);
  return storeSearch(ownerId,input,route,stations,regionalPrices(stations,reports,orderedStates),warnings,"openstreetmap");
}
function storeSearch(ownerId:string,input:FuelPreferences,route:RoadRoute,stations:Station[],regions:RegionPrice[],warnings:string[],provider:NonNullable<FuelSearch["provider"]>):FuelSearch {
  const now=Date.now(), id=randomUUID();
  const search:FuelSearch={id,provider,expiresAt:new Date(now+1800000).toISOString(),route,stations,regions,warnings:[...new Set(warnings)],searchedAt:new Date(now).toISOString()};
  for (const [key,entry] of service.searches) if (entry.expires < now) service.searches.delete(key);
  if (service.searches.size >= 24) service.searches.delete(service.searches.keys().next().value!);
  service.searches.set(id,{ownerId,input,search,expires:now+1800000,plans:new Map()});
  return search;
}
export async function planFuel(ownerId: string, value: unknown): Promise<FuelPlan> {
  try { return await withFuelBudget(PLAN_BUDGET_MS,()=>planWithinBudget(ownerId,value)); }
  catch(error) {
    if(error instanceof Error && ["TimeoutError","AbortError"].includes(error.name))throw new FuelError("Road planning timed out. Search again or try more specific locations.",504);
    throw error;
  }
}
async function planWithinBudget(ownerId: string, value: unknown): Promise<FuelPlan> {
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
  if (cached && !("totalCost" in cached) && !("fuelConsumedCost" in cached) && (input.requireStationPrices===false || (input.requireStationPrices===true && cached.stops.every(stop=>stop.priceKind==="web report" && hasVerifiedStationPrice(stop.station))))) return cached;
  const route=selected.length ? await (search.provider==="google" ? googleRoadRoute : roadRoute)(search.route.origin,search.route.destination,selected) : search.route;
  for (let i=0;search.provider!=="google" && i<selected.length;i++) {
    try { selected[i]=await addressFor(selected[i]); } catch { /* Keep mapped coordinates if the address service is unavailable. */ }
  }
  const plan=buildFuelPlan(search,input,selected,route);
  if (plan.detourMinutes > input.maxDetourMinutes*Math.max(1,selected.length)) throw new FuelError("The actual road detour is much longer than the candidate estimate. Choose other stations or increase the detour limit.",422);
  if (entry.plans.size >= 16) entry.plans.delete(entry.plans.keys().next().value!);
  entry.plans.set(key,plan);
  return plan;
}
