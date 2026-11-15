import type { FuelGrade, RegionPrice } from "./fuel-types";
import { AAA_URL, parseStatePriceTable } from "./fuel-regions";
import { FuelError } from "./fuel-validation";

const g=globalThis as typeof globalThis & { fuelStatePrices?:{html:string;expires:number};fuelStatePriceRequest?:Promise<string> };
export async function statePriceReports(grade:FuelGrade):Promise<RegionPrice[]> {
  let html=g.fuelStatePrices?.expires && g.fuelStatePrices.expires>Date.now()?g.fuelStatePrices.html:null;
  if(!html) {
    if(!g.fuelStatePriceRequest)g.fuelStatePriceRequest=(async()=>{
      const response=await fetch(AAA_URL,{cache:"no-store",headers:{"User-Agent":"TripTogether/0.1 (local road trip planner; https://github.com/Cole4eva123/TripTogether)"},signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new FuelError("AAA state averages are temporarily unavailable.",502);
      const value=await response.text();g.fuelStatePrices={html:value,expires:Date.now()+900000};return value;
    })().finally(()=>{g.fuelStatePriceRequest=undefined;});
    html=await g.fuelStatePriceRequest;
  }
  return parseStatePriceTable(html,grade);
}
