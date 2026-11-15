import type { Coordinate, FuelPreferences, RoadRoute, RoutePoint, Station } from "./fuel-types";
import { distanceMiles, METERS_PER_MILE, projectOnRoute } from "./gasoline-intelligence";
import { FuelError } from "./fuel-validation";
import { providerJson } from "./fuel-http";
import { normalizeState } from "./fuel-regions";
export { normalizeState } from "./fuel-regions";

type GeoResult = { lat:string;lon:string;display_name:string;address?:{state?:string;state_code?:string;road?:string;house_number?:string;city?:string;town?:string;village?:string;county?:string;postcode?:string}; };
type MapState = { geocodes:Map<string,{value:GeoResult;expires:number}>; queue:Promise<unknown>; nextCall:number; roadQueue?:Promise<unknown>;nextRoadCall?:number };
const globalMaps = globalThis as typeof globalThis & { fuelMapState?:MapState };
const state:MapState = globalMaps.fuelMapState ??= { geocodes:new Map(),queue:Promise.resolve(),nextCall:0 };
// One shared queue across users and hot reloads: public Nominatim allows at most one request/second.
async function geocodeRequest<T>(url: string): Promise<T> {
  const run = state.queue.catch(() => {}).then(async () => {
    const wait = Math.max(0,state.nextCall-Date.now());
    if (wait) await new Promise(resolve => setTimeout(resolve,wait));
    state.nextCall = Date.now()+1100;
    return providerJson<T>(url,"OpenStreetMap address lookup",{headers:{"User-Agent":process.env.OSM_USER_AGENT || "TripTogether/0.1 (local road trip planner; https://github.com/Cole4eva123/TripTogether)","Accept-Language":"en"}},20000);
  });
  state.queue = run;
  return run;
}
const nominatim = () => (process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org").replace(/\/$/,"");
export async function nearbyTown(location:Coordinate):Promise<string> {
  const key=`town:${location.lat.toFixed(3)},${location.lng.toFixed(3)}`;
  let result=state.geocodes.get(key)?.value;
  if(!result) {
    const params=new URLSearchParams({lat:String(location.lat),lon:String(location.lng),format:"jsonv2",addressdetails:"1",zoom:"10"});
    result=await geocodeRequest<GeoResult>(`${nominatim()}/reverse?${params}`);
    if(state.geocodes.size>=256)state.geocodes.delete(state.geocodes.keys().next().value!);
    state.geocodes.set(key,{value:result,expires:Date.now()+86400000});
  }
  const address=result.address;
  return [address?.city || address?.town || address?.village || address?.county,address?.state].filter(Boolean).join(", ") || result.display_name;
}
export async function geocode(address: string): Promise<Coordinate> {
  const key = address.toLowerCase().trim(), hit = state.geocodes.get(key);
  if (hit && hit.expires > Date.now()) return {lat:Number(hit.value.lat),lng:Number(hit.value.lon)};
  const params = new URLSearchParams({q:address,format:"jsonv2",limit:"1",countrycodes:"us",addressdetails:"1"});
  const result = (await geocodeRequest<GeoResult[]>(`${nominatim()}/search?${params}`))[0];
  if (!result || !Number.isFinite(Number(result.lat)) || !Number.isFinite(Number(result.lon))) throw new FuelError(`Could not find “${address}” in the US. Include the city and state.`,404);
  if (state.geocodes.size >= 256) state.geocodes.delete(state.geocodes.keys().next().value!);
  state.geocodes.set(key,{value:result,expires:Date.now()+86400000});
  return {lat:Number(result.lat),lng:Number(result.lon)};
}
export function geocodedState(address:string):string {
  const location=state.geocodes.get(address.toLowerCase().trim())?.value.address;
  return normalizeState(location?.state || location?.state_code || "");
}
export async function addressFor(station: Station): Promise<Station> {
  if (station.state && station.address) return station;
  const key = `reverse:${station.location.lat.toFixed(5)},${station.location.lng.toFixed(5)}`;
  let result = state.geocodes.get(key)?.value;
  if (!result) {
    const params = new URLSearchParams({lat:String(station.location.lat),lon:String(station.location.lng),format:"jsonv2",addressdetails:"1",zoom:"18"});
    result = await geocodeRequest<GeoResult>(`${nominatim()}/reverse?${params}`);
    if (state.geocodes.size >= 256) state.geocodes.delete(state.geocodes.keys().next().value!);
    state.geocodes.set(key,{value:result,expires:Date.now()+86400000});
  }
  return {...station,address:station.address || result.display_name || "Address not mapped",state:normalizeState(station.state || result.address?.state || result.address?.state_code || "")};
}
type OsrmRoute = { distance:number;duration:number;geometry:{coordinates:[number,number][]};legs:{distance:number;duration:number;annotation?:{distance:number[];duration:number[]}}[] };
export async function roadRoute(origin: Coordinate, destination: Coordinate, stations: Station[] = []): Promise<RoadRoute> {
  const locations = [origin,...stations.map(s => s.location),destination];
  const coords = locations.map(p => `${p.lng},${p.lat}`).join(";");
  const base = (process.env.OSRM_BASE_URL || "https://router.project-osrm.org").replace(/\/$/,"");
  const run=(state.roadQueue ?? Promise.resolve()).catch(()=>{}).then(async()=>{
    const wait=Math.max(0,(state.nextRoadCall ?? 0)-Date.now());
    if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
    state.nextRoadCall=Date.now()+1100;
    return providerJson<{code:string;routes?:OsrmRoute[]}>(`${base}/route/v1/driving/${coords}?overview=full&geometries=geojson&annotations=distance,duration&steps=false`,"OSRM road routing");
  });
  state.roadQueue=run;
  const response = await run;
  const r = response.routes?.[0];
  if (response.code !== "Ok" || !r || r.geometry.coordinates.length < 2 || !Number.isFinite(r.distance) || !Number.isFinite(r.duration) || r.legs.length!==locations.length-1) throw new FuelError("No complete drivable route was found between these locations.",422);
  if (r.duration > 30*3600) throw new FuelError("Please split routes over 30 hours into separate travel days.");
  const distances = r.legs.flatMap(l => l.annotation?.distance ?? []), durations = r.legs.flatMap(l => l.annotation?.duration ?? []);
  let miles=0, minutes=0;
  const points: RoutePoint[] = r.geometry.coordinates.map(([lng,lat],i) => {
    if (i) { miles += (distances[i-1] ?? 0)/METERS_PER_MILE; minutes += (durations[i-1] ?? 0)/60; }
    return {lat,lng,miles,minutes};
  });
  if (distances.length !== points.length-1 || durations.length !== points.length-1) throw new FuelError("Road routing returned incomplete distance/time annotations. Please try again.",502);
  return {origin:points[0],destination:points.at(-1)!,points,miles:r.distance/METERS_PER_MILE,minutes:r.duration/60,
    legs:r.legs.map(l => ({miles:l.distance/METERS_PER_MILE,minutes:l.duration/60}))};
}
type OsmElement = { type:string;id:number;lat?:number;lon?:number;center?:{lat:number;lon:number};tags?:Record<string,string> };
const locationOf = (e: OsmElement): Coordinate | null => {
  const lat=e.lat ?? e.center?.lat, lng=e.lon ?? e.center?.lon;
  return lat !== undefined && lng !== undefined ? {lat,lng} : null;
};
function address(tags: Record<string,string>) {
  return [tags["addr:housenumber"],tags["addr:street"],tags["addr:city"],tags["addr:state"],tags["addr:postcode"]].filter(Boolean).join(" ");
}
export async function findStations(route: RoadRoute, input: FuelPreferences): Promise<Station[]> {
  // Corridor query, not a state/country-wide download. Simplify to at most 300 vertices.
  const stride = Math.max(1,Math.ceil(route.points.length/299));
  const path = route.points.filter((_,i) => i%stride === 0 || i===route.points.length-1).map(p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(",");
  const query = `[out:json][timeout:35][maxsize:16777216];nwr["amenity"="fuel"](around:4000,${path})->.fuel;(.fuel;nwr(around.fuel:350)["amenity"~"^(restaurant|fast_food|toilets)$"];nwr(around.fuel:350)["shop"="convenience"];);out center tags;`;
  const response = await providerJson<{elements:OsmElement[]}>(process.env.OVERPASS_API_URL || "https://overpass-api.de/api/interpreter","OpenStreetMap station search",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","User-Agent":"TripTogether/0.1 (local road trip planner)"},body:new URLSearchParams({data:query}).toString(),
  },45000);
  if (!Array.isArray(response.elements)) throw new FuelError("Station search returned an incomplete response. Try again.",502);
  const facilities=response.elements.filter(e => e.tags?.amenity !== "fuel" && locationOf(e));
  const result: Station[]=[];
  for (const e of response.elements) {
    const tags=e.tags ?? {}, location=locationOf(e);
    if (tags.amenity !== "fuel" || !location || tags.disused === "yes" || tags.access === "private") continue;
    if (input.vehicle.grade === "diesel" && tags["fuel:diesel"] === "no") continue;
    if (input.vehicle.grade !== "diesel" && tags["fuel:octane_87"] === "no" && tags["fuel:octane_95"] === "no" && tags["fuel:diesel"] === "yes") continue;
    const projection=projectOnRoute(location,route);
    if (projection.offRoute > 2.5 || projection.miles >= route.miles-0.2) continue;
    const amenities: string[]=[];
    if (tags.toilets === "yes") amenities.push("Restroom");
    if (tags.shop === "convenience") amenities.push("Convenience store");
    for (const facility of facilities) {
      if (distanceMiles(location,locationOf(facility)!) > 0.22) continue;
      const ft=facility.tags!;
      if (ft.amenity === "toilets") amenities.push("Restroom");
      else if (ft.shop === "convenience") amenities.push("Convenience store");
      else {amenities.push("Restaurant");if(ft.name || ft.brand)amenities.push(ft.name || ft.brand);}
    }
    const name=tags.name || tags.brand || tags.operator || "Gas station";
    const detourMiles=projection.offRoute*2.6;
    result.push({id:`${e.type}/${e.id}`,name,brand:tags.brand || tags.operator || name,address:address(tags),state:normalizeState(tags["addr:state"] || ""),
      location,routeMiles:projection.miles,routeMinutes:projection.minutes,detourMiles,detourMinutes:detourMiles/25*60+2,
      amenities:[...new Set(amenities)],membersOnly:tags.access === "customers" && tags.membership === "yes" || /costco|sam.?s club/i.test(name),
      price:null,open:tags.opening_hours || "Hours not mapped",mapUrl:`https://www.openstreetmap.org/${e.type}/${e.id}`});
  }
  result.sort((a,b) => a.routeMiles-b.routeMiles);
  // Avoid duplicate node/way mappings of the same forecourt.
  const unique=result.filter((s,i) => !result.slice(Math.max(0,i-5),i).some(other => other.name === s.name && distanceMiles(other.location,s.location)<0.06));
  // Keep several choices in each half-hour window, instead of losing rural coverage to city clusters.
  const buckets=new Map<number,Station[]>();
  for (const station of unique) { const b=Math.floor(station.routeMinutes/30); buckets.set(b,[...(buckets.get(b) ?? []),station]); }
  return [...buckets.values()].flatMap(entries => entries.sort((a,b) => a.detourMinutes-b.detourMinutes || b.amenities.length-a.amenities.length).slice(0,4)).sort((a,b) => a.routeMiles-b.routeMiles);
}
