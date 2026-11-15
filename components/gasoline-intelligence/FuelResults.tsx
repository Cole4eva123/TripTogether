"use client";

import type { FuelPlan, FuelPreferences, FuelSearch, Station } from "@/lib/fuel-types";
import { membershipFor, stationPrice } from "@/lib/gasoline-intelligence";
import { formatDistance, type DistanceUnit, type StationDistances } from "@/lib/fuel-display";

export const money=(n:number) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
export const duration=(minutes:number) => {const total=Math.round(minutes);return `${Math.floor(total/60)}h ${total%60}m`;};
function arrival(value:string) {
  return new Date(value).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"});
}
function PreferredAmenities({station,input}:{station:Station;input:FuelPreferences}) {
  const normalize=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,"");
  const matches=station.amenities.filter(amenity=>input.amenities.some(preference=>{
    const key=normalize(preference);return key && normalize(amenity).includes(key);
  }));
  return matches.length?<p className="mt-2 text-[12px] text-muted">{matches.join(" · ")}</p>:null;
}
function StationDetails({station,reason}:{station:Station;reason?:string}) {
  const hours=station.open && !/not mapped|not confirmed|unknown/i.test(station.open);
  if(!reason && !hours && !station.amenities.length && !station.source && !station.price)return null;
  return <details className="mt-3 text-[12px]">
    <summary className="cursor-pointer font-semibold text-green">Details &amp; sources</summary>
    <div className="mt-2 grid gap-2 text-muted">
      {reason && <p>{reason}</p>}
      {!!station.amenities.length && <p>{station.amenities.join(" · ")}</p>}
      {hours && <p>Hours: {station.open}</p>}
      {station.price && <p>Price updated {arrival(station.price.observedAt)}</p>}
      <div className="flex flex-wrap gap-4">
        {station.source && <a href={station.source.url} target="_blank" rel="noreferrer">Station source</a>}
        {station.price && <a href={station.price.source.url} target="_blank" rel="noreferrer">Price source</a>}
      </div>
    </div>
  </details>;
}
export function RegionalPrices({search}:{search:FuelSearch}) {
  if (!search.regions.length) return <p className="text-[14px] text-muted">Regional prices unavailable.</p>;
  const cheapest=Math.min(...search.regions.map(r => r.average));
  return <section className="grid gap-3" aria-labelledby="regional-heading">
    <h2 id="regional-heading">Regional prices</h2>
    <div className="grid auto-rows-fr grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">{search.regions.map(region => <div key={region.state} className={`min-w-0 rounded-lg border-2 p-3 ${region.average===cheapest ? "border-green bg-white" : "border-line bg-white"}`}>
      <p className="font-bold">{region.state}</p><p className="text-[24px] font-extrabold text-green">{money(region.average)}<span className="text-[13px] font-normal text-muted"> /gal</span></p>
      <p className="text-[12px] text-muted">{region.kind === "station sample" ? `${region.count} reported station${region.count===1?"":"s"}` : "Regional average"}</p>
      {region.average===cheapest && <p className="text-[13px] font-bold text-green">Lowest average</p>}
      {region.change !== null && Math.abs(region.change)>=0.15 && <p className={`text-[13px] font-semibold ${region.change>0?"text-red":"text-green"}`}>{region.change>0?"↑":"↓"} {money(Math.abs(region.change))} vs previous region</p>}
      {region.observedAt && <p className="text-[12px] text-muted">As of {new Date(region.observedAt).toLocaleDateString()}</p>}
      {region.source && <a className="text-[12px]" href={region.source.url} target="_blank" rel="noreferrer">Source</a>}
    </div>)}</div>
  </section>;
}
export function PlanSummary({plan,input,distanceUnit}:{plan:FuelPlan;input:FuelPreferences;distanceUnit:DistanceUnit}) {
  const dateOnly=/^\d{4}-\d{2}-\d{2}$/.test(input.departure);
  const departureDay=dateOnly?new Date(`${input.departure}T00:00:00Z`).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}):null;
  return <section className="grid gap-5" aria-labelledby="plan-heading">
    <div><h2 id="plan-heading">Your Plan</h2><p className="text-[14px] text-muted">{dateOnly?`Departure ${departureDay}`:`ETA ${arrival(plan.arrival)}`}</p></div>
    <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-2">
      {[["Distance",formatDistance(plan.route.miles,distanceUnit,0)],["With breaks",duration(plan.totalMinutes)],["Estimated total",money(plan.totalCost)],["Fuel cost",money(plan.fuelConsumedCost)],["On-road purchases",money(plan.purchaseCost)],["Detour",`${formatDistance(plan.detourMiles,distanceUnit)} · ${duration(plan.detourMinutes)}`]].map(([label,value]) => <div key={label} className="rounded-lg border border-line bg-white p-3"><p className="text-[12px] font-semibold text-muted">{label}</p><p className="mt-1 text-[20px] font-bold text-green">{value}</p></div>)}
    </div>
    <div className="text-[13px]"><h3 className="font-semibold text-green">Cost &amp; fuel details</h3><div className="mt-2 grid gap-1 text-muted"><p>Total: {money(plan.fuelConsumedCost)} fuel used + {money(input.otherCosts)} other costs.</p><p>{plan.gallonsUsed.toFixed(1)} gal used · {plan.gallonsPurchased.toFixed(1)} gal purchased · {plan.fuelOnArrival.toFixed(1)} gal on arrival</p></div></div>
    <h2 id="recommended-stops-heading">Your Recommended Stops</h2>
    {plan.stops.length===0 && <p className="rounded-lg border border-green bg-white p-4">No fuel or rest stops needed.</p>}
    <ol className="grid gap-4" aria-labelledby="recommended-stops-heading">{plan.stops.map(stop => <li key={stop.station.id} className="rounded-xl border-2 border-green bg-white p-5">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[12px] font-bold uppercase tracking-wider text-muted">Stop {stop.number}</p><h3 className="text-[20px] font-bold">{stop.station.name}</h3></div><p className="text-[22px] font-extrabold text-green">{money(stop.pricePerGallon)}<span className="text-[12px] font-normal">/gal</span></p></div>
      <p className="mt-1 text-[14px] text-muted">{stop.station.address || "Address not mapped"}</p>
      <div className="mt-3 grid gap-1 text-[14px]">
        <p>{formatDistance(stop.milesFromStart,distanceUnit)} from start</p>
        <p>{formatDistance(stop.legMiles,distanceUnit)} / {duration(stop.legMinutes)} from {stop.number===1?"start":`stop ${stop.number-1}`}</p>
        <p>{formatDistance(plan.route.miles-stop.milesFromStart,distanceUnit)} to destination</p>
      </div>
      <p className="text-[14px]">{dateOnly?`Arrive after ${duration(stop.minutesFromStart)}`:`Arrive ${arrival(stop.arrival)}`} · Rest {input.stopMinutes} min</p>
      <div className="mt-3 flex flex-wrap gap-2"><span className="rounded bg-paper px-2 py-1 text-[14px] font-semibold">Add {stop.buyGallons.toFixed(2)} gal · {money(stop.cost)}</span><span className="rounded bg-paper px-2 py-1 text-[14px]">Tank {stop.gallonsOnArrival.toFixed(1)} → {stop.fuelAfterStop.toFixed(1)} gal</span></div>
      <PreferredAmenities station={stop.station} input={input}/>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-[12px]"><span className="text-muted">{stop.priceKind}</span><a href={stop.station.mapUrl} target="_blank" rel="noreferrer">Open map</a></div>
      <StationDetails station={stop.station} reason={stop.reason}/>
    </li>)}</ol>
  </section>;
}
export function StationChoice({station,input,search,distances,distanceUnit,selected,active,onSelect,onFocus}:{station:Station;input:FuelPreferences;search:FuelSearch;distances:StationDistances;distanceUnit:DistanceUnit;selected:boolean;active:boolean;onSelect:()=>void;onFocus:()=>void}) {
  const price=stationPrice(station,input,search.regions), membership=membershipFor(station,input);
  const unavailable=station.detourMinutes>input.maxDetourMinutes || (station.membersOnly && !membership) || !price;
  return <li className={`rounded-lg border-2 bg-white p-3 ${active?"border-green":"border-line"}`}>
    <div className="flex items-start gap-3"><input type="checkbox" aria-label={`Include ${station.name} at ${formatDistance(distances.fromStart,distanceUnit,0)}`} className="mt-1 min-h-0! w-4! shrink-0 accent-green" checked={selected} disabled={unavailable} onChange={onSelect}/>
      <div className="min-w-0 flex-1"><button type="button" className="text-left font-bold text-green underline" onClick={onFocus}>{station.name}</button><p className="text-[12px] text-muted">{station.address || "Address not mapped"}</p></div>
      <div className="text-right"><p className="font-bold">{price?`${money(price.value)}/gal`:"Unknown"}</p><p className="text-[11px] text-muted">{price?.kind}</p></div>
    </div>
    <div className="mt-2 grid gap-1 text-[12px] text-muted">
      <p>{distances.estimated?"~":""}{formatDistance(distances.fromStart,distanceUnit)} from start</p>
      <p>{distances.estimated?"~":""}{formatDistance(distances.fromPrevious,distanceUnit)} from {distances.previousLabel}</p>
      <p>{distances.estimated?"~":""}{formatDistance(distances.toDestination,distanceUnit)} to destination</p>
      <p>~{Math.ceil(station.detourMinutes)} min detour</p>
    </div>
    <PreferredAmenities station={station} input={input}/>
    {unavailable && <p className="mt-1 text-[12px] font-semibold text-red">{station.membersOnly&&!membership?"Requires membership":!price?"Add a fallback price to select":"Exceeds your detour limit"}</p>}
    <StationDetails station={station}/>
  </li>;
}
