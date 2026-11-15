"use client";

import type { FuelPlan, FuelPreferences, FuelSearch, Station } from "@/lib/fuel-types";
import { membershipFor, stationPrice } from "@/lib/gasoline-intelligence";

export const money=(n:number) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
export const duration=(minutes:number) => {const total=Math.round(minutes);return `${Math.floor(total/60)}h ${total%60}m`;};
function arrival(value:string) {
  return new Date(value).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"});
}
export function RegionalPrices({search}:{search:FuelSearch}) {
  if (!search.regions.length) return <p className="rounded-lg border border-line bg-white p-4 text-[14px] text-muted">No recent, sourced regional prices were found. No cheapest state can be identified from this search.</p>;
  const cheapest=Math.min(...search.regions.map(r => r.average));
  return <section className="grid gap-3" aria-labelledby="regional-heading">
    <h2 id="regional-heading">Prices along the route</h2>
    <p className="text-[14px] text-muted">Compare the regions with available evidence. Station samples are not statewide averages; sample sizes and dates may differ.</p>
    <div className="flex flex-wrap gap-3">{search.regions.map(region => <div key={region.state} className={`min-w-35 rounded-lg border-2 p-3 ${region.average===cheapest ? "border-green bg-white" : "border-line bg-white"}`}>
      <p className="font-bold">{region.state}</p><p className="text-[24px] font-extrabold text-green">{money(region.average)}<span className="text-[13px] font-normal text-muted"> /gal</span></p>
      <p className="text-[12px] text-muted">{region.kind === "station sample" ? `${region.count} reported station${region.count===1?"":"s"}` : "Regional average"}</p>
      {region.average===cheapest && <p className="text-[13px] font-bold text-green">Lowest available average</p>}
      {region.change !== null && Math.abs(region.change)>=0.15 && <p className={`text-[13px] font-semibold ${region.change>0?"text-red":"text-green"}`}>{region.change>0?"↑":"↓"} {money(Math.abs(region.change))} vs previous region</p>}
      {region.observedAt && <p className="text-[12px] text-muted">As of {new Date(region.observedAt).toLocaleDateString()}</p>}
      {region.source && <a className="text-[12px]" href={region.source.url} target="_blank" rel="noreferrer">Source</a>}
    </div>)}</div>
  </section>;
}
export function PlanSummary({plan,input}:{plan:FuelPlan;input:FuelPreferences}) {
  return <section className="grid gap-5" aria-labelledby="plan-heading">
    <div><h2 id="plan-heading">Your road plan</h2><p className="text-[14px] text-muted">Arrival {arrival(plan.arrival)} · Times shown in your browser&apos;s time zone.</p></div>
    <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-2">
      {[["Road distance",`${plan.route.miles.toFixed(0)} mi`],["With breaks",duration(plan.totalMinutes)],["Trip budget",money(plan.totalCost)],["Fuel used value",money(plan.fuelConsumedCost)],["Buy on the road",money(plan.purchaseCost)],["Extra driving",`${plan.detourMiles.toFixed(1)} mi · ${duration(plan.detourMinutes)}`]].map(([label,value]) => <div key={label} className="rounded-lg border border-line bg-white p-3"><p className="text-[12px] font-semibold text-muted">{label}</p><p className="mt-1 text-[20px] font-bold text-green">{value}</p></div>)}
    </div>
    <p className="text-[13px] text-muted">Trip budget = estimated value of all fuel consumed (including starting fuel) + {money(input.otherCosts)} other costs. Fuel bought on the road is shown separately. {plan.gallonsUsed.toFixed(1)} gal used; {plan.gallonsPurchased.toFixed(1)} gal purchased; {plan.fuelOnArrival.toFixed(1)} gal on arrival.</p>
    {plan.stops.length===0 && <p className="rounded-lg border border-green bg-white p-4">You can reach the destination within your fuel reserve and break interval. No stop is needed.</p>}
    <ol className="grid gap-4">{plan.stops.map(stop => <li key={stop.station.id} className="rounded-xl border-2 border-green bg-white p-5">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[12px] font-bold uppercase tracking-wider text-muted">Stop {stop.number} · {stop.station.state || "State not mapped"}</p><h3 className="text-[20px] font-bold">{stop.station.name}</h3></div><p className="text-[22px] font-extrabold text-green">{money(stop.pricePerGallon)}<span className="text-[12px] font-normal">/gal</span></p></div>
      <p className="mt-1 text-[14px] text-muted">{stop.station.address || "Address not mapped"}</p>
      <p className="mt-3 text-[14px]">{stop.milesFromStart.toFixed(1)} mi from start · {stop.legMiles.toFixed(1)} mi / {duration(stop.legMinutes)} from {stop.number===1?"start":`stop ${stop.number-1}`}</p>
      <p className="text-[14px]">Arrive {arrival(stop.arrival)} · Rest {input.stopMinutes} min</p>
      <div className="mt-3 flex flex-wrap gap-2"><span className="rounded bg-paper px-2 py-1 text-[14px] font-semibold">Add {stop.buyGallons.toFixed(2)} gal · {money(stop.cost)}</span><span className="rounded bg-paper px-2 py-1 text-[14px]">Tank {stop.gallonsOnArrival.toFixed(1)} → {stop.fuelAfterStop.toFixed(1)} gal</span></div>
      <p className="mt-3 text-[13px] text-muted">{stop.reason}</p>
      <p className="mt-1 text-[12px] text-muted">Price: {stop.priceKind}{stop.station.price ? ` · observed ${arrival(stop.station.price.observedAt)}` : " · not a pump quote"}</p>
      <div className="mt-2 flex flex-wrap gap-4 text-[13px]"><a href={stop.station.mapUrl} target="_blank" rel="noreferrer">Station on map</a>{stop.station.source && <a href={stop.station.source.url} target="_blank" rel="noreferrer">Station source</a>}{stop.station.price && <a href={stop.station.price.source.url} target="_blank" rel="noreferrer">Price source</a>}</div>
      <p className="mt-2 text-[12px] text-muted">Hours: {stop.station.open}. Fuel grade availability must be confirmed at the station.</p>
    </li>)}</ol>
    <ul className="grid gap-2 rounded-lg border border-line bg-white p-4 text-[13px] text-muted">{plan.warnings.map(w => <li key={w}>• {w}</li>)}</ul>
  </section>;
}
export function StationChoice({station,input,search,selected,active,onSelect,onFocus}:{station:Station;input:FuelPreferences;search:FuelSearch;selected:boolean;active:boolean;onSelect:()=>void;onFocus:()=>void}) {
  const price=stationPrice(station,input,search.regions), membership=membershipFor(station,input);
  const unavailable=station.detourMinutes>input.maxDetourMinutes || (station.membersOnly && !membership) || !price;
  return <li className={`rounded-lg border-2 bg-white p-3 ${active?"border-green":"border-line"}`}>
    <div className="flex items-start gap-3"><input type="checkbox" aria-label={`Include ${station.name} at ${station.routeMiles.toFixed(0)} miles`} className="mt-1 min-h-0! w-4! shrink-0 accent-green" checked={selected} disabled={unavailable} onChange={onSelect}/>
      <div className="min-w-0 flex-1"><button type="button" className="text-left font-bold text-green underline" onClick={onFocus}>{station.name}</button><p className="text-[12px] text-muted">{station.address || "Address not mapped"} · {station.state || "State not mapped"}</p></div>
      <div className="text-right"><p className="font-bold">{price?`${money(price.value)}/gal`:"Unknown"}</p><p className="text-[11px] text-muted">{price?.kind}</p></div>
    </div>
    <p className="mt-2 text-[12px] text-muted">{station.routeMiles.toFixed(1)} mi from start · {duration(station.routeMinutes)} along route · estimated detour {Math.ceil(station.detourMinutes)} min</p>
    <p className="mt-1 text-[12px] text-muted">{station.amenities.length?station.amenities.join(" · "):"Facilities not mapped"}{station.membersOnly?" · Members only":""}</p>
    {unavailable && <p className="mt-1 text-[12px] font-semibold text-red">{station.membersOnly&&!membership?"Requires membership":!price?"Enter an estimated price to select this station":"Exceeds your detour limit"}</p>}
    {station.price && <a href={station.price.source.url} className="text-[12px]" target="_blank" rel="noreferrer">Price source · {new Date(station.price.observedAt).toLocaleDateString()}</a>}
    {station.source && <a href={station.source.url} className="ml-3 text-[12px]" target="_blank" rel="noreferrer">Station source</a>}
  </li>;
}
