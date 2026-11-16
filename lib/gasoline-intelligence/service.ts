import { randomUUID } from "node:crypto";
import type { FuelPlan, FuelPreferences, FuelSearch, RegionPrice, RoadRoute, Station } from "./types";
import { buildFuelPlan, cheapestStops, eligibleStations, hasVerifiedStationPrice, regionalPrices, worstLegRatio } from "./planner";
import { fuelConfig } from "./config";
import { qualifiedPlaceName } from "../place-search";
import { FuelError, object, text } from "./validation";
import { currentUser, needLogin } from "../server";
import { PLAN_BUDGET_MS, SEARCH_BUDGET_MS, withFuelBudget } from "./budget";
import { fuelDataProvider } from "./provider";
import { googleRoadRoute, googleSearchRoute } from "./google";
import { GOOGLE_ROUTING_PREFERENCE } from "./google-data";

type StoredSearch = { ownerId:string;input:FuelPreferences;search:FuelSearch;expires:number;plans:Map<string,FuelPlan>;routingPreference:typeof GOOGLE_ROUTING_PREFERENCE };
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
async function searchWithinBudget(ownerId: string, typed: FuelPreferences): Promise<FuelSearch> {
  // Google gets the gazetteer's full name ("Nashville, Tennessee"), never what was typed.
  const origin=qualifiedPlaceName(typed.origin), destination=qualifiedPlaceName(typed.destination);
  if (!origin || !destination) throw new FuelError("Pick the starting location and the destination from the list.");
  const input={...typed,origin,destination};
  fuelDataProvider(process.env);
  const { route, stations, warnings } = await googleSearchRoute(input);
  // No stations is not an error yet: the fuel in the tank may be enough for the whole trip.
  if (!stations.some(hasVerifiedStationPrice)) warnings.push("Google has no recent prices for the selected fuel grade near this route, so there is nowhere to plan a purchase.");
  return storeSearch(ownerId, input, route, stations, regionalPrices(stations), warnings);
}
function storeSearch(ownerId:string,input:FuelPreferences,route:RoadRoute,stations:Station[],regions:RegionPrice[],warnings:string[]):FuelSearch {
  const now=Date.now(), id=randomUUID();
  const search:FuelSearch={id,provider:"google",expiresAt:new Date(now+1800000).toISOString(),route,stations,regions,warnings:[...new Set(warnings)],searchedAt:new Date(now).toISOString()};
  for (const [key,entry] of service.searches) if (entry.expires < now) service.searches.delete(key);
  if (service.searches.size >= 24) service.searches.delete(service.searches.keys().next().value!);
  service.searches.set(id,{ownerId,input,search,expires:now+1800000,plans:new Map(),routingPreference:GOOGLE_ROUTING_PREFERENCE});
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
  if (!entry || entry.ownerId !== ownerId || entry.expires < Date.now() || entry.search.provider !== "google" || entry.routingPreference !== GOOGLE_ROUTING_PREFERENCE) throw new FuelError("This route search has expired. Search again before planning.",410);
  fuelDataProvider(process.env);
  const {search,input}=entry;
  const road = (stations: Station[]) => stations.length ? googleRoadRoute(search.route.origin,search.route.destination,stations) : search.route;
  const key = (stations: Station[]) => stations.map(s => s.id).join(";");
  const finish = (plan: FuelPlan) => {
    if (entry.plans.size >= 16) entry.plans.delete(entry.plans.keys().next().value!);
    entry.plans.set(key(plan.stops.map(stop => stop.station)),plan);
    return plan;
  };
  const { restWarningMinutes } = fuelConfig();
  if (body.stationIds !== undefined) {
    if (!Array.isArray(body.stationIds) || body.stationIds.length > 23 || body.stationIds.some(s => typeof s !== "string") || new Set(body.stationIds).size !== body.stationIds.length) {
      throw new FuelError("Choose up to 23 distinct stops.");
    }
    const ids=body.stationIds as string[], eligible=eligibleStations(search,input);
    const selected=ids.map(id => {
      const station=eligible.find(s => s.id === id);
      if (!station) throw new FuelError("A stop is unavailable with your current membership or price settings.");
      return station;
    }).sort((a,b) => a.routeMiles-b.routeMiles);
    return entry.plans.get(key(selected)) ?? finish(buildFuelPlan(search,input,selected,await road(selected),restWarningMinutes));
  }
  // The stops are chosen on estimated distances. When the real road legs are too long for the fuel, choose
  // again with the estimates stretched by what the road showed, a few times at most.
  for (let scale=1, attempt=0, tried=""; ; attempt++) {
    const selected=cheapestStops(search,input,scale);
    const cached=entry.plans.get(key(selected));
    if (cached) return cached;
    const route=await road(selected);
    try { return finish(buildFuelPlan(search,input,selected,route,restWarningMinutes)); }
    catch(error) {
      // The same stops again would fail the same way, and cost another request.
      if (attempt === 2 || tried === key(selected) || !(error instanceof FuelError) || error.status !== 422) throw error;
      tried=key(selected);
      scale=Math.max(scale*1.05,worstLegRatio(search,selected,route)*1.02);
    }
  }
}
