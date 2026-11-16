"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useMe } from "@/components/me";
import PlaceField from "@/components/PlaceField";
import { api, errorText } from "@/lib/api";
import { stationPrice } from "@/lib/route-planner/planner";
import { formatDistance, getStationDistances, type DistanceUnit } from "@/lib/route-planner/display";
import type {
  FuelPlan,
  FuelPreferences,
  FuelSearch,
  VehicleSuggestion,
} from "@/lib/route-planner/types";
import FuelMap from "./FuelMap";
import FuelSearchBar from "./FuelSearchBar";
import AnimatedDisclosure from "./AnimatedDisclosure";
import { PlanSummary, RegionalPrices } from "./FuelResults";
import { buildFuelPreferences, createFuelFormSettings, emptyVehicle, vehicleToFields } from "@/lib/route-planner/form";

const field = "grid content-start gap-1.5";
// A slider, not the boxed text input the element defaults draw.
const slider = "h-6 min-h-0 border-0 bg-transparent p-0 accent-green";

export default function RoutePlanner() {
  const params = useSearchParams(),
    me = useMe();
  const [description, setDescription] = useState("");
  const [vehicle, setVehicle] = useState(emptyVehicle);
  const [suggestion, setSuggestion] = useState<VehicleSuggestion | null>(null);
  const [settings, setSettings] = useState(() => createFuelFormSettings({
    origin: params.get("origin") || "",
    destination: params.get("destination") || "",
    startDate: params.get("startDate") || "",
  }));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState<FuelSearch | null>(null);
  const [storedPlan, setPlan] = useState<FuelPlan | null>(null);
  const [plannedInput, setPlannedInput] = useState<FuelPreferences | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>("mi");
  const pick = useCallback((id: string) => setActiveId(id), []);
  function invalidate() {
    setSearch(null);
    setPlan(null);
    setActiveId(null);
    setError("");
  }
  function changeSetting(key: keyof typeof settings, value: string) {
    setSettings((s) => ({ ...s, [key]: value }));
    invalidate();
  }
  function changeVehicle(key: keyof typeof vehicle, value: string) {
    setVehicle((v) => ({ ...v, [key]: value }));
    invalidate();
  }
  async function identify() {
    setBusy("Finding your vehicle…");
    setError("");
    setSuggestion(null);
    invalidate();
    try {
      const result = await api<VehicleSuggestion>("/route-planner/vehicle", "POST", {
        description,
      });
      setSuggestion(result);
      setVehicle(vehicleToFields(result.vehicle));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const input = buildFuelPreferences(settings, vehicle);
    setBusy("Finding your route, stations and sourced fuel prices. This may take 5–20 seconds…");
    setPlan(null);
    setSearch(null);
    setActiveId(null);
    setPlannedInput(input);
    try {
      const result = await api<FuelSearch>("/route-planner/search", "POST", input);
      setSearch(result);
      setBusy("Working out the cheapest stops…");
      const planned = await api<FuelPlan>("/route-planner/plan", "POST", {
        searchId: result.id,
      });
      setPlan(planned);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }
  const plan=storedPlan?.stops.every(stop=>stop.priceKind === "web report")?storedPlan:null;
  const selectedIds = plan?.stops.map(stop => stop.station.id) ?? [];
  const selectedStations = plan?.stops.map(stop => stop.station) ?? [];
  const mapStations =
    search?.stations.map((station) => {
      const stop = plan?.stops.find((stop) => stop.station.id === station.id);
      return {
        ...(stop?.station ?? station),
        distances: getStationDistances(station, search.route.miles, selectedStations, plan),
        displayPrice:
          stop
            ? { value: stop.pricePerGallon, kind: stop.priceKind }
            : plannedInput
              ? stationPrice(station, plannedInput, search.regions)
              : null,
      };
    }) ?? [];
  const vehicleSummary = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ");
  if (!me)
    return (
      <main className="mx-auto max-w-300 p-4" role="status">
        Loading your session…
      </main>
    );

  const mpg = Number(vehicle.mpg),
    tank = Number(vehicle.tankGallons);
  const usable = (percent: string) => formatDistance((mpg * tank * (Number(percent) - Number(settings.reservePercent))) / 100, distanceUnit, 0);

  return (
    <main className="mx-auto max-w-320 px-4 pt-4 pb-16">
      <Link href="/trips" className="text-[14px]">
        Back to your trips
      </Link>
      <h1 className="mt-5">Route planner</h1>
      <p className="mt-1 mb-8 text-muted">The cheapest places to fill up between two cities.</p>

      <div className="grid grid-cols-[350px_minmax(0,1fr)] items-start gap-9 max-md:grid-cols-1">
        <form onSubmit={submit}>
          <fieldset disabled={!!busy} className="grid min-w-0 gap-4 rounded-xl border-2 border-line bg-white p-5 disabled:opacity-75">
            <div className={field}>
              <label htmlFor="fuel-origin">From</label>
              <PlaceField
                id="fuel-origin"
                placeholder="Chicago"
                value={settings.origin}
                onChange={(value) => changeSetting("origin", value)}
              />
            </div>
            <div className={field}>
              <label htmlFor="fuel-destination">To</label>
              <PlaceField
                id="fuel-destination"
                placeholder="Nashville"
                value={settings.destination}
                onChange={(value) => changeSetting("destination", value)}
              />
            </div>
            <div className={field}>
              <label htmlFor="fuel-departure">Leaving on</label>
              <input
                id="fuel-departure"
                type="date"
                required
                value={settings.departure}
                onChange={(e) => changeSetting("departure", e.target.value)}
              />
            </div>

            <hr className="my-1 border-line" />

            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["mpg", "Highway MPG", 5],
                  ["tankGallons", "Tank (US gal)", 3],
                ] as const
              ).map(([key, label, min]) => (
                <div className={field} key={key}>
                  <label htmlFor={`vehicle-${key}`}>{label}</label>
                  <input
                    id={`vehicle-${key}`}
                    type="number"
                    value={vehicle[key]}
                    onChange={(e) => changeVehicle(key, e.target.value)}
                    required
                    step="any"
                    min={min}
                    max={100}
                  />
                </div>
              ))}
            </div>
            <AnimatedDisclosure title="Don't know them? Look up your car">
              <div className="grid gap-3">
                <div className={field}>
                  <label htmlFor="vehicle-description" className="text-[14px]">
                    Describe your car
                  </label>
                  <textarea
                    id="vehicle-description"
                    rows={2}
                    maxLength={500}
                    placeholder="2022 Toyota RAV4 XLE AWD, gas, not hybrid"
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      setSuggestion(null);
                      invalidate();
                    }}
                  />
                </div>
                <button type="button" className="btn btn-quiet btn-small" disabled={!description.trim()} onClick={identify}>
                  Look up this car
                </button>
                {suggestion && (
                  <div className="grid gap-1 text-[14px]" role="status">
                    {vehicleSummary && <p className="font-bold text-green">Found {vehicleSummary}</p>}
                    <p className="text-muted">{suggestion.notes}</p>
                    {suggestion.sources.map((s) => (
                      <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                        {s.title}
                      </a>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ["year", "Year", "number"],
                      ["make", "Make", "text"],
                      ["model", "Model", "text"],
                      ["trim", "Engine or trim", "text"],
                    ] as const
                  ).map(([key, label, type]) => (
                    <div className={field} key={key}>
                      <label htmlFor={`vehicle-${key}`} className="text-[14px]">
                        {label}
                      </label>
                      <input
                        id={`vehicle-${key}`}
                        type={type}
                        value={vehicle[key]}
                        onChange={(e) => changeVehicle(key, e.target.value)}
                        min={key === "year" ? 1980 : undefined}
                        max={key === "year" ? new Date().getFullYear() + 2 : undefined}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </AnimatedDisclosure>
            <div className={field}>
              <label htmlFor="fuel-grade">Fuel grade</label>
              <select id="fuel-grade" value={vehicle.grade} onChange={(e) => changeVehicle("grade", e.target.value)}>
                <option value="regular">Regular unleaded</option>
                <option value="midgrade">Midgrade</option>
                <option value="premium">Premium</option>
                <option value="diesel">Diesel</option>
              </select>
            </div>

            {(
              [
                ["initialFuelPercent", "initial-fuel", "Fuel in the tank now", 1, 100],
                ["reservePercent", "reserve", "Keep in reserve", 10, 30],
              ] as const
            ).map(([key, id, label, min, max]) => (
              <div className={field} key={key}>
                <div className="flex items-baseline justify-between">
                  <label htmlFor={id}>{label}</label>
                  <output htmlFor={id} className="font-bold tabular-nums">
                    {settings[key]}%
                  </output>
                </div>
                <input
                  id={id}
                  type="range"
                  className={slider}
                  min={min}
                  max={max}
                  value={settings[key]}
                  onChange={(e) => changeSetting(key, e.target.value)}
                />
              </div>
            ))}
            {mpg > 0 && tank > 0 && (
              <p className="text-[14px] text-muted">
                About {usable(settings.initialFuelPercent)} before you need fuel, {usable("100")} on a full tank.
              </p>
            )}

            <button className="btn mt-1" type="submit">
              Find the cheapest fuel plan
            </button>
          </fieldset>
        </form>

        <div className="grid min-w-0 gap-6">
          <FuelMap
            route={plan?.route ?? search?.route ?? null}
            stations={mapStations}
            selectedIds={selectedIds}
            activeId={activeId}
            onPick={pick}
            distanceUnit={distanceUnit}
          />
          {!search && !busy && !error && <p className="text-muted">Pick a route and enter your car to see the plan here.</p>}
          {busy && (
            <p role="status" aria-live="polite" className="font-bold text-green">
              {busy}
            </p>
          )}
          {(error || (storedPlan && !plan)) && (
            <p role="alert" className="rounded-lg border-2 border-red bg-white p-4 font-semibold text-red">
              {error || "Search again to get station-specific prices."}
            </p>
          )}
          {search && plannedInput && (
            <>
              {plan && (
                <PlanSummary
                  plan={plan}
                  input={plannedInput}
                  warnings={[...new Set([...search.warnings, ...plan.warnings])]}
                  distanceUnit={distanceUnit}
                />
              )}
              <RegionalPrices search={search} />
              <FuelSearchBar
                count={search.stations.length}
                grade={plannedInput.vehicle.grade}
                expiresAt={search.expiresAt}
                distanceUnit={distanceUnit}
                onDistanceUnitChange={setDistanceUnit}
              />
            </>
          )}
        </div>
      </div>
      <footer className="mt-10 text-[12px] leading-relaxed text-muted">
        <p>Route, station and fuel price data: Google Maps. Vehicle research: DeepSeek with linked sources.</p>
      </footer>
    </main>
  );
}
