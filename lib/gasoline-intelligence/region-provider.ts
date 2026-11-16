import type { FuelGrade, RegionPrice } from "./types";
import { AAA_URL, parseStatePriceTable } from "./regions";
import { FuelError } from "./validation";
import { EIA_STATE_AREAS, eiaPriceUrl, mergeStateReports, parseEiaStatePrices } from "./eia";
import { providerJson } from "./http";
import { fuelRequestSignal } from "./budget";

type EiaCache = { values: Map<FuelGrade, { body: unknown; expires: number }>; pending: Map<FuelGrade, Promise<unknown>> };
const g=globalThis as typeof globalThis & { fuelStatePrices?:{html:string;expires:number};fuelStatePriceRequest?:Promise<string>;fuelEiaPrices?:EiaCache };
const eia = g.fuelEiaPrices ??= { values: new Map(), pending: new Map() };

export async function eiaStatePriceReports(grade: FuelGrade): Promise<RegionPrice[]> {
  const key = process.env.EIA_API_KEY;
  if (!key) return [];
  const hit = eia.values.get(grade);
  if (hit && hit.expires > Date.now()) return parseEiaStatePrices(hit.body, grade);
  if (!eia.pending.has(grade)) {
    const request = providerJson<unknown>(eiaPriceUrl(key, grade), "EIA state fuel prices", {}, 5000).then(body => {
      if (parseEiaStatePrices(body, grade).length) eia.values.set(grade, { body, expires: Date.now() + 900000 });
      return body;
    }).finally(() => { eia.pending.delete(grade); });
    eia.pending.set(grade, request);
  }
  return parseEiaStatePrices(await eia.pending.get(grade), grade);
}

async function aaaStatePriceReports(grade:FuelGrade):Promise<RegionPrice[]> {
  let html=g.fuelStatePrices?.expires && g.fuelStatePrices.expires>Date.now()?g.fuelStatePrices.html:null;
  if(!html) {
    if(!g.fuelStatePriceRequest)g.fuelStatePriceRequest=(async()=>{
      const response=await fetch(AAA_URL,{cache:"no-store",headers:{"User-Agent":"TripTogether/0.1 (local road trip planner; https://github.com/Cole4eva123/TripTogether)"},signal:fuelRequestSignal(5000)});
      if(!response.ok)throw new FuelError("AAA state averages are temporarily unavailable.",502);
      const value=await response.text();g.fuelStatePrices={html:value,expires:Date.now()+900000};return value;
    })().finally(()=>{g.fuelStatePriceRequest=undefined;});
    html=await g.fuelStatePriceRequest;
  }
  return parseStatePriceTable(html,grade);
}

export async function statePriceReports(grade: FuelGrade, requestedStates?: string[]): Promise<RegionPrice[]> {
  if (requestedStates?.length === 0) return [];
  const wanted = requestedStates ? [...new Set(requestedStates)] : undefined;
  const canUseEia = !wanted || wanted.some(state => EIA_STATE_AREAS.some(area => area === `S${state}`));
  const primary = canUseEia ? await eiaStatePriceReports(grade).catch(() => []) : [];
  if (wanted?.every(state => primary.some(report => report.state === state))) return mergeStateReports(primary, [], wanted);
  const fallback = await aaaStatePriceReports(grade).catch(() => []);
  return mergeStateReports(primary, fallback, wanted);
}
