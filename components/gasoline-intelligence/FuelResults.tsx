"use client";

import type { FuelPlan, FuelPreferences, FuelSearch, Station } from "@/lib/gasoline-intelligence/types";
import { formatDistance, type DistanceUnit } from "@/lib/gasoline-intelligence/display";
import AnimatedDisclosure from "./AnimatedDisclosure";

export const money=(n:number) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
export const duration=(minutes:number) => {const total=Math.round(minutes);return `${Math.floor(total/60)}h ${total%60}m`;};
function arrival(value:string) {
  return new Date(value).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"});
}
export function PreferredAmenities({station,input}:{station:Station;input:FuelPreferences}) {
  const normalize=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,"");
  const matches=station.amenities.filter(amenity=>input.amenities.some(preference=>{
    const key=normalize(preference);return key && normalize(amenity).includes(key);
  }));
  return matches.length?<p className="mt-2 text-[12px] text-muted">{matches.join(" · ")}</p>:null;
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
  const needsFuel=plan.gallonsPurchased>0.000001;
  const fuelMetrics=[
    ...(needsFuel?[{label:"Fuel cost",value:money(plan.purchaseCost),unit:""}]:[]),
    {label:"Fuel used",value:plan.gallonsUsed.toFixed(1),unit:" gal"},
    ...(needsFuel?[{label:"Fuel purchased",value:plan.gallonsPurchased.toFixed(1),unit:" gal"}]:[]),
    {label:"Fuel on arrival",value:plan.fuelOnArrival.toFixed(1),unit:" gal"},
  ];
  return <section className="grid gap-5" aria-labelledby="plan-heading">
    <div><h2 id="plan-heading">Your Plan</h2><p className="text-[14px] text-muted">{dateOnly?`Departure ${departureDay}`:`ETA ${arrival(plan.arrival)}`}</p></div>
    <div className="grid grid-cols-2 gap-3">
      {[["Distance",formatDistance(plan.route.miles,distanceUnit,0)],["Estimated Duration with Breaks",duration(plan.totalMinutes)]].map(([label,value]) => <div key={label} className="min-w-0 rounded-lg border border-line bg-white p-3"><p className="text-[12px] font-semibold text-muted">{label}</p><p className="mt-1 text-[20px] font-bold text-green">{value}</p></div>)}
    </div>
    {(plan.detourMiles>=0.05 || plan.detourMinutes>=0.5) && <p className="text-[13px] text-muted">Detour: {formatDistance(plan.detourMiles,distanceUnit)} · {duration(plan.detourMinutes)}</p>}
    {!needsFuel && <p className="rounded-lg border border-green/20 bg-green/5 p-4 text-[14px] leading-relaxed text-green">Your current fuel is enough to reach your destination without dropping below your selected {input.reservePercent}% reserve.</p>}
    <div className={`grid gap-3 ${needsFuel?"grid-cols-4 max-sm:grid-cols-2":"grid-cols-2"}`}>
      {fuelMetrics.map(({label,value,unit}) => <div key={label} className="min-w-0 rounded-lg border border-line bg-white p-3"><p className="text-[12px] font-semibold text-muted">{label}</p><p className="mt-1 text-[20px] font-bold text-green">{value}{unit && <span className="text-[12px] font-normal">{unit}</span>}</p></div>)}
    </div>
    <h2 id="recommended-stops-heading">Your Recommended Stops</h2>
    {plan.stops.length===0 && <p className="rounded-lg border border-green bg-white p-4">No fuel or rest stops needed.</p>}
    <ol className="flex items-stretch overflow-x-auto pb-3 max-sm:flex-col max-sm:overflow-visible max-sm:pb-0" aria-labelledby="recommended-stops-heading">{plan.stops.map((stop,index) => <li key={stop.station.id} className="flex shrink-0 items-stretch max-sm:flex-col">
      <article className="flex w-64 min-w-0 flex-col rounded-xl border-2 border-green bg-white p-4 max-sm:w-full">
        <div className="flex items-center justify-between gap-2"><p className="text-[12px] font-bold uppercase tracking-wider text-muted">Stop {stop.number}</p><p className="text-[20px] font-extrabold text-green">{money(stop.pricePerGallon)}<span className="text-[11px] font-normal">/gal</span></p></div>
        <h3 className="mt-1 text-[18px] leading-tight font-bold">{stop.station.name}</h3>
        <p className="mt-2 text-[12px] leading-snug text-muted">{stop.station.address || "Address not mapped"}</p>
        <AnimatedDisclosure title="Distance Details" className="mt-3">
        <div className="grid gap-1 text-[12px] leading-snug">
          <p>{formatDistance(stop.milesFromStart,distanceUnit)} from start</p>
          <p>{formatDistance(stop.legMiles,distanceUnit)} / {duration(stop.legMinutes)} from {stop.number===1?"start":`stop ${stop.number-1}`}</p>
          <p>{formatDistance(plan.route.miles-stop.milesFromStart,distanceUnit)} to destination</p>
        </div>
        </AnimatedDisclosure>
        <p className="mt-2 text-[12px] leading-snug">{dateOnly?`Arrive after ${duration(stop.minutesFromStart)}`:`Arrive ${arrival(stop.arrival)}`} · Rest {input.stopMinutes} min</p>
        <div className="mt-3 grid gap-1 rounded-lg bg-paper p-2 text-[12px] leading-snug"><p className="font-semibold">Add {stop.buyGallons.toFixed(2)} gal · {money(stop.cost)}</p><p>Tank {stop.gallonsOnArrival.toFixed(1)} → {stop.fuelAfterStop.toFixed(1)} gal</p></div>
        <PreferredAmenities station={stop.station} input={input}/>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3 text-[12px]"><span className="text-muted">{stop.priceKind === "web report" ? "Station quote" : stop.priceKind}</span><a href={stop.station.mapUrl} target="_blank" rel="noreferrer">Open map</a></div>
      </article>
      {index<plan.stops.length-1 && <span aria-hidden="true" className="grid w-9 shrink-0 place-items-center text-[26px] font-bold text-green max-sm:h-10 max-sm:w-full"><span className="max-sm:hidden">→</span><span className="hidden max-sm:block">↓</span></span>}
    </li>)}</ol>
  </section>;
}
