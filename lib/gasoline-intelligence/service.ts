import { randomUUID } from "node:crypto";
import type { FuelPlan, FuelPreferences, FuelSearch, RegionPrice, RoadRoute, Station } from "./types";
import { buildFuelPlan, eligibleStations, hasVerifiedStationPrice, regionalPrices, selectStops } from "./planner";
import { FuelError, object, text } from "./validation";
import { currentUser, needLogin } from "../server";
import { PLAN_BUDGET_MS, SEARCH_BUDGET_MS, withFuelBudget } from "./budget";
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
  fuelDataProvider(process.env);
  const { route, stations, warnings } = await googleSearchRoute(input);
  if (!stations.length) throw new FuelError("No Google gas stations were found near this route. Try more specific locations or split the trip.", 404);
  warnings.push("Candidate detours are approximate. The final plan verifies road distances and driving times.");
  if (!stations.some(hasVerifiedStationPrice)) warnings.push("Google has no recent prices for the selected fuel grade on these stations. Unknown prices are excluded from recommendations.");
  return storeSearch(ownerId, input, route, stations, regionalPrices(stations), warnings);
}
function storeSearch(ownerId:string,input:FuelPreferences,route:RoadRoute,stations:Station[],regions:RegionPrice[],warnings:string[]):FuelSearch {
  const now=Date.now(), id=randomUUID();
  const search:FuelSearch={id,provider:"google",expiresAt:new Date(now+1800000).toISOString(),route,stations,regions,warnings:[...new Set(warnings)],searchedAt:new Date(now).toISOString()};
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
  if (!entry || entry.ownerId !== ownerId || entry.expires < Date.now() || entry.search.provider !== "google") throw new FuelError("This route search has expired. Search again before planning.",410);
  fuelDataProvider(process.env);
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
  const route=selected.length ? await googleRoadRoute(search.route.origin,search.route.destination,selected) : search.route;
  const plan=buildFuelPlan(search,input,selected,route);
  if (plan.detourMinutes > input.maxDetourMinutes*Math.max(1,selected.length)) throw new FuelError("The actual road detour is much longer than the candidate estimate. Choose other stations or increase the detour limit.",422);
  if (entry.plans.size >= 16) entry.plans.delete(entry.plans.keys().next().value!);
  entry.plans.set(key,plan);
  return plan;
}
