"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { useMe } from "@/components/me";
import { api, errorText } from "@/lib/api";
import { stationPrice } from "@/lib/gasoline-intelligence";
import type { FuelPlan, FuelPreferences, FuelSearch, Vehicle, VehicleSuggestion } from "@/lib/fuel-types";
import FuelMap from "./FuelMap";
import { duration, PlanSummary, RegionalPrices, StationChoice } from "./FuelResults";

const emptyVehicle={year:"",make:"",model:"",trim:"",mpg:"",tankGallons:"",grade:"regular"};
const availableAmenities=["Restroom","Convenience store","McDonald's","Starbucks","Subway"];
const membershipBrands=["Costco","Sam's Club","Shell","BP","Exxon"];
function localDepartureDate() {
  const date=new Date();
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
const field="grid content-start gap-1.5";
const panel="grid gap-4 rounded-xl border-2 border-line bg-white p-5";

export default function GasolineIntelligence() {
  const params=useSearchParams(), me=useMe();
  const [description,setDescription]=useState("");
  const [vehicle,setVehicle]=useState(emptyVehicle);
  const [suggestion,setSuggestion]=useState<VehicleSuggestion|null>(null);
  const vehicleDetails=useRef<HTMLDetailsElement>(null);
  const [confirmed,setConfirmed]=useState(false);
  const [settings,setSettings]=useState({
    origin:params.get("origin") || "",destination:params.get("destination") || "",departure:params.get("startDate") || localDepartureDate(),
    initialFuelPercent:"100",reservePercent:"15",intervalMinutes:"120",maxDetourMinutes:"15",stopMinutes:"15",
    estimatedPrice:"3.50",timeValue:"15",otherCosts:"0",customAmenity:"",
  });
  const [amenities,setAmenities]=useState<string[]>(["Restroom"]);
  const [memberships,setMemberships]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [search,setSearch]=useState<FuelSearch|null>(null);
  const [plan,setPlan]=useState<FuelPlan|null>(null);
  const [plannedInput,setPlannedInput]=useState<FuelPreferences|null>(null);
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [activeId,setActiveId]=useState<string|null>(null);
  const [filter,setFilter]=useState("");
  const pick=useCallback((id:string) => setActiveId(id),[]);
  function invalidate() {setSearch(null);setPlan(null);setSelectedIds([]);setActiveId(null);setError("");}
  function changeSetting(key:keyof typeof settings,value:string) {setSettings(s => ({...s,[key]:value}));invalidate();}
  function changeVehicle(key:keyof typeof vehicle,value:string) {setVehicle(v => ({...v,[key]:value}));setConfirmed(false);invalidate();}
  async function identify() {
    setBusy("Finding your vehicle…");setError("");setConfirmed(false);setSuggestion(null);invalidate();
    try {
      const result=await api<VehicleSuggestion>("/gasoline-intelligence/vehicle","POST",{description});
      setSuggestion(result);
      setVehicle({...emptyVehicle,...Object.fromEntries(Object.entries(result.vehicle).filter(([,value]) => value!=null).map(([key,value]) => [key,String(value)]))});
      if(vehicleDetails.current)vehicleDetails.current.open=!result.vehicle.year || !result.vehicle.make || !result.vehicle.model;
    } catch (e) {setError(errorText(e));}
    finally {setBusy("");}
  }
  async function submit(event:React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();setError("");
    if (!confirmed) {setError("Check and confirm your vehicle specifications before planning.");return;}
    const automatic=(event.nativeEvent as SubmitEvent).submitter?.getAttribute("value")==="auto";
    const departure=settings.departure;
    const input:FuelPreferences={
      origin:settings.origin,destination:settings.destination,departure,
      vehicle:{...vehicle,year:Number(vehicle.year),mpg:Number(vehicle.mpg),tankGallons:Number(vehicle.tankGallons),grade:vehicle.grade as Vehicle["grade"]},
      initialFuelPercent:Number(settings.initialFuelPercent),reservePercent:Number(settings.reservePercent),
      intervalMinutes:automatic?Number(settings.intervalMinutes):60,maxDetourMinutes:Number(settings.maxDetourMinutes),stopMinutes:Number(settings.stopMinutes),
      estimatedPrice:settings.estimatedPrice.trim()?Number(settings.estimatedPrice):null,timeValue:Number(settings.timeValue),otherCosts:Number(settings.otherCosts),
      amenities:[...amenities,...(settings.customAmenity.trim()?[settings.customAmenity.trim()]:[])],
      memberships:Object.entries(memberships).map(([brand,value]) => ({brand,discountCents:Number(value)})),
    };
    setBusy("Finding fuel stops… This may take a few minutes.");
    setPlan(null);setSearch(null);setSelectedIds([]);setActiveId(null);setPlannedInput(input);
    try {
      const result=await api<FuelSearch>("/gasoline-intelligence/search","POST",{...input,vehicleConfirmed:confirmed});
      setSearch(result);setBusy("Planning your stops…");
      const planned=await api<FuelPlan>("/gasoline-intelligence/plan","POST",{searchId:result.id});
      setPlan(planned);setSelectedIds(planned.stops.map(s => s.station.id));
    } catch (e) {setError(errorText(e));}
    finally {setBusy("");}
  }
  async function recalculate(automatic=false) {
    if (!search) return;
    setBusy("Updating your plan…");setError("");
    try {
      const result=await api<FuelPlan>("/gasoline-intelligence/plan","POST",{searchId:search.id,...(automatic?{}:{stationIds:selectedIds})});
      setPlan(result);setSelectedIds(result.stops.map(s => s.station.id));
    } catch (e) {setError(errorText(e));}
    finally {setBusy("");}
  }
  function toggleStation(id:string) {
    if (selectedIds.includes(id)) setSelectedIds(ids => ids.filter(s => s!==id));
    else if (selectedIds.length>=23) setError("Choose no more than 23 stops per travel day.");
    else setSelectedIds(ids => [...ids,id].sort((a,b) => search!.stations.find(s => s.id===a)!.routeMiles-search!.stations.find(s => s.id===b)!.routeMiles));
  }
  const dirty=!!search && (!plan || selectedIds.join(";")!==plan.stops.map(s => s.station.id).join(";"));
  const mapStations=search?.stations.map(station => {
    const stop=plan?.stops.find(stop => stop.station.id===station.id);
    return {
      ...(stop?.station ?? station),
      displayPrice: stop && !dirty
        ? {value:stop.pricePerGallon,kind:stop.priceKind}
        : plannedInput ? stationPrice(station,plannedInput,search.regions) : null,
    };
  }) ?? [];
  const visibleStations=search?.stations.filter(s => `${s.name} ${s.address} ${s.state} ${s.amenities.join(" ")}`.toLowerCase().includes(filter.toLowerCase())) ?? [];
  const vehicleSummary=[vehicle.year,vehicle.make,vehicle.model,vehicle.trim].filter(Boolean).join(" ");
  if (!me) return <main className="mx-auto max-w-300 p-4" role="status">Loading your session…</main>;

  return <main className="mx-auto max-w-320 px-4 pt-4 pb-16">
    <Link href="/trips" className="text-[14px]">Back to your trips</Link>
    <div className="mt-5 mb-8 flex flex-wrap items-end justify-between gap-4"><h1>Gasoline Intelligence</h1><span className="sign sign-small">US road trips</span></div>

    <div className="grid grid-cols-[350px_minmax(0,1fr)] items-start gap-7 max-md:grid-cols-1">
      <form className="grid gap-5" onSubmit={submit}>
        <fieldset disabled={!!busy} className="grid min-w-0 gap-5 disabled:opacity-75">
          <section className={panel} aria-labelledby="vehicle-heading">
            <h2 id="vehicle-heading"><span className="mr-2 text-green">01</span> Your vehicle</h2>
            <div className={field}><label htmlFor="vehicle-description">Describe your car</label><textarea id="vehicle-description" rows={2} maxLength={500} placeholder="e.g. 2022 Toyota RAV4 XLE AWD, gas, not hybrid" value={description} onChange={e => {setDescription(e.target.value);setSuggestion(null);setConfirmed(false);invalidate();}}/><button type="button" className="btn btn-quiet" disabled={!description.trim()} onClick={identify}>Find my vehicle with AI</button></div>
            {suggestion && vehicleSummary && <p role="status" className="text-[14px] font-semibold text-green">Found: {vehicleSummary}</p>}
            <div className="grid grid-cols-2 gap-3">
              {([["mpg","MPG",5],["tankGallons","Tank (US gal)",3]] as const).map(([key,label,min]) => <div className={field} key={key}><label htmlFor={`vehicle-${key}`} className="text-[13px]">{label}</label><input id={`vehicle-${key}`} type="number" value={vehicle[key]} onChange={e => changeVehicle(key,e.target.value)} required step="any" min={min} max={100}/></div>)}
            </div>
            {Number(vehicle.mpg)>0 && Number(vehicle.tankGallons)>0 && <p className="rounded-lg bg-paper p-3 text-[14px]"><strong>{Math.round(Number(vehicle.mpg)*Number(vehicle.tankGallons))} mi</strong> full tank · <strong>{Math.round(Number(vehicle.mpg)*Number(vehicle.tankGallons)*(1-Number(settings.reservePercent)/100))} mi</strong> with reserve</p>}
            <details ref={vehicleDetails} onInvalidCapture={event => {event.currentTarget.open=true;}}>
              <summary className="cursor-pointer text-[13px] font-semibold text-green">Vehicle details</summary>
              <div className="mt-3 grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  {([["year","Year","number"],["make","Make","text"],["model","Model","text"],["trim","Trim / engine","text"]] as const).map(([key,label,type]) => <div className={field} key={key}><label htmlFor={`vehicle-${key}`} className="text-[13px]">{label}</label><input id={`vehicle-${key}`} type={type} value={vehicle[key]} onChange={e => changeVehicle(key,e.target.value)} required={key!=="trim"} min={key==="year"?1980:undefined} max={key==="year"?new Date().getFullYear()+2:undefined}/></div>)}
                </div>
                <div className={field}><label htmlFor="fuel-grade">Fuel grade</label><select id="fuel-grade" value={vehicle.grade} onChange={e => changeVehicle("grade",e.target.value)}><option value="regular">Regular unleaded</option><option value="midgrade">Midgrade</option><option value="premium">Premium</option><option value="diesel">Diesel</option></select></div>
                {suggestion && <div className="grid gap-2 text-[12px] text-muted"><p>{suggestion.notes}</p>{suggestion.sources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.title}</a>)}</div>}
              </div>
            </details>
            <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" className="mt-1 min-h-0! w-4! shrink-0 accent-green" checked={confirmed} onChange={e => {setConfirmed(e.target.checked);invalidate();}}/>Confirm vehicle details</label>
          </section>
          <section className={panel} aria-labelledby="route-heading">
            <h2 id="route-heading"><span className="mr-2 text-green">02</span> Your route</h2>
            <div className={field}><label htmlFor="fuel-origin">Starting location</label><input id="fuel-origin" placeholder="Champaign, IL" required maxLength={200} value={settings.origin} onChange={e => changeSetting("origin",e.target.value)}/></div>
            <div className={field}><label htmlFor="fuel-destination">Destination</label><input id="fuel-destination" placeholder="Nashville, TN" required maxLength={200} value={settings.destination} onChange={e => changeSetting("destination",e.target.value)}/></div>
            <div className={field}><label htmlFor="fuel-departure">Departure date</label><input id="fuel-departure" type="date" required value={settings.departure} onChange={e => changeSetting("departure",e.target.value)}/></div>
            <div className="grid grid-cols-2 gap-3"><div className={field}><label htmlFor="initial-fuel" className="text-[13px]">Starting fuel (%)</label><input id="initial-fuel" type="number" min="1" max="100" required value={settings.initialFuelPercent} onChange={e => changeSetting("initialFuelPercent",e.target.value)}/></div><div className={field}><label htmlFor="reserve" className="text-[13px]">Keep in reserve (%)</label><input id="reserve" type="number" min="10" max="30" required value={settings.reservePercent} onChange={e => changeSetting("reservePercent",e.target.value)}/></div></div>
          </section>
          <section className={panel} aria-labelledby="preferences-heading">
            <h2 id="preferences-heading"><span className="mr-2 text-green">03</span> Stop preferences</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-2">{availableAmenities.map(name => <label key={name} className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="min-h-0! w-4! accent-green" checked={amenities.includes(name)} onChange={e => {setAmenities(list => e.target.checked?[...list,name]:list.filter(a => a!==name));invalidate();}}/>{name}</label>)}</div>
            <div className={field}><label htmlFor="custom-amenity" className="text-[13px]">Another restaurant or facility</label><input id="custom-amenity" maxLength={60} placeholder="e.g. Taco Bell" value={settings.customAmenity} onChange={e => changeSetting("customAmenity",e.target.value)}/></div>
            <div className="grid grid-cols-2 gap-3"><div className={field}><label htmlFor="interval" className="text-[13px]">One-click interval</label><select id="interval" value={settings.intervalMinutes} onChange={e => changeSetting("intervalMinutes",e.target.value)}>{[60,90,120,150,180].map(n => <option key={n} value={n}>{duration(n)}</option>)}</select></div><div className={field}><label htmlFor="stop-duration" className="text-[13px]">Break (minutes)</label><input id="stop-duration" type="number" min="5" max="90" required value={settings.stopMinutes} onChange={e => changeSetting("stopMinutes",e.target.value)}/></div></div>
            <details onInvalidCapture={event => {event.currentTarget.open=true;}}><summary className="cursor-pointer text-[14px] font-bold text-green">Memberships, detours &amp; budget</summary><div className="mt-4 grid gap-4">
              <div className={field}><label htmlFor="estimatedPrice" className="text-[13px]">Fallback estimate ($/gal)</label><input id="estimatedPrice" type="number" step="any" min="0.5" max="15" value={settings.estimatedPrice} onChange={e => changeSetting("estimatedPrice",e.target.value)}/><p className="text-[12px] text-muted">For missing prices; optional.</p></div>
              <p className="text-[12px] text-muted">Extra discount in ¢/gal; use 0 for access only.</p>
              {membershipBrands.map(brand => <div key={brand} className="flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="min-h-0! w-4! accent-green" checked={brand in memberships} onChange={e => {setMemberships(current => {const copy={...current};if(e.target.checked) copy[brand]="0";else delete copy[brand];return copy;});invalidate();}}/>{brand}</label>{brand in memberships && <input aria-label={`${brand} additional discount cents per gallon`} className="w-24!" type="number" min="0" max="100" value={memberships[brand]} onChange={e => {setMemberships(m => ({...m,[brand]:e.target.value}));invalidate();}}/>}</div>)}
              {([["maxDetourMinutes","Candidate detour limit (minutes)",1,40],["timeValue","Extra driving time value ($/hour)",0,100],["otherCosts","Other costs: tolls, meals, etc. ($)",0,100000]] as const).map(([key,label,min,max]) => <div key={key} className={field}><label htmlFor={key} className="text-[13px]">{label}</label><input id={key} type="number" step="any" min={min} max={max} value={settings[key]} required onChange={e => changeSetting(key,e.target.value)}/></div>)}
            </div></details>
          </section>
          <div className="grid gap-2"><button className="btn" type="submit" value="auto" disabled={!confirmed}>One-click plan</button><button className="btn btn-quiet" type="submit" value="hourly" disabled={!confirmed}>Find hourly stops</button></div>
        </fieldset>
      </form>

      <div className="grid min-w-0 gap-6">
        <div className="grid gap-3"><FuelMap route={dirty?search?.route ?? null:plan?.route ?? search?.route ?? null} stations={mapStations} selectedIds={selectedIds} activeId={activeId} onPick={pick}/>
          {!search && !busy && <p className="text-[14px] text-muted">Enter your vehicle and route to get started.</p>}
        </div>
        {busy && <div role="status" aria-live="polite" className="rounded-lg border-2 border-green bg-white p-4 font-semibold text-green">{busy}</div>}
        {error && <div role="alert" className="rounded-lg border-2 border-red bg-white p-4 font-semibold text-red">{error}</div>}
        {search && plannedInput && <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px]"><strong>{search.route.miles.toFixed(0)} mi · {duration(search.route.minutes)} driving</strong><span className="text-muted">{search.stations.length} nearby candidates · {plannedInput.vehicle.grade} fuel</span></div>
          <RegionalPrices search={search}/>
          <section className="grid gap-3" aria-labelledby="adjust-heading"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="adjust-heading">Choose your stops</h2><p className="mt-1 text-[13px] text-muted">Select stops, then recalculate.</p></div><span className="text-[13px] font-bold text-green">{selectedIds.length} selected</span></div>
            <label className={field}><span className="text-[13px]">Filter stations</span><input placeholder="Station, state or facility" value={filter} onChange={e => setFilter(e.target.value)}/></label>
            <fieldset disabled={!!busy} className="min-w-0"><ul className="grid max-h-[430px] gap-3 overflow-y-auto pr-1">{visibleStations.map(station => <StationChoice key={station.id} station={station} input={plannedInput} search={search} selected={selectedIds.includes(station.id)} active={activeId===station.id} onSelect={() => toggleStation(station.id)} onFocus={() => setActiveId(station.id)}/>)}</ul></fieldset>
            {visibleStations.length===0 && <p className="text-[14px] text-muted">No stations match this filter.</p>}
            <div className="flex flex-wrap gap-2"><button className="btn" disabled={!!busy || !dirty} onClick={() => recalculate()}>Recalculate selected stops</button><button className="btn btn-quiet" disabled={!!busy} onClick={() => recalculate(true)}>Restore recommendations</button></div>
            {dirty && <p className="text-[13px] font-bold text-green">Recalculate to apply your changes.</p>}
          </section>
          {plan && !dirty && <PlanSummary plan={plan} input={plannedInput}/>}
        </>}
      </div>
    </div>
  </main>;
}
