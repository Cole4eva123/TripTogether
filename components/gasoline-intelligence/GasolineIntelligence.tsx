"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { useMe } from "@/components/me";
import { api, errorText } from "@/lib/api";
import { stationPrice } from "@/lib/gasoline-intelligence/planner";
import { formatDistance, getStationDistances, type DistanceUnit } from "@/lib/gasoline-intelligence/display";
import type {
  FuelPlan,
  FuelPreferences,
  FuelSearch,
  VehicleSuggestion,
} from "@/lib/gasoline-intelligence/types";
import FuelMap from "./FuelMap";
import FuelSearchBar from "./FuelSearchBar";
import OneClickPlanButton from "./OneClickPlanButton";
import AnimatedDisclosure, { type AnimatedDisclosureHandle } from "./AnimatedDisclosure";
import { PlanSummary, RegionalPrices } from "./FuelResults";
import { buildFuelPreferences, createFuelFormSettings, emptyVehicle, vehicleToFields } from "@/lib/gasoline-intelligence/form";

const field = "grid content-start gap-1.5";
const panel = "grid gap-4 rounded-xl border-2 border-line bg-white p-5";

export default function GasolineIntelligence() {
  const params = useSearchParams(),
    me = useMe();
  const [description, setDescription] = useState("");
  const [vehicle, setVehicle] = useState(emptyVehicle);
  const [suggestion, setSuggestion] = useState<VehicleSuggestion | null>(null);
  const vehicleDetails = useRef<AnimatedDisclosureHandle>(null);
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
      const result = await api<VehicleSuggestion>("/gasoline-intelligence/vehicle", "POST", {
        description,
      });
      setSuggestion(result);
      setVehicle(vehicleToFields(result.vehicle));
      if (vehicleDetails.current) vehicleDetails.current.open = false;
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const automatic =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "auto";
    const input = buildFuelPreferences(settings, vehicle, automatic);
    setBusy("Finding your route, stations and sourced fuel prices. This may take 1–3 minutes…");
    setPlan(null);
    setSearch(null);
    setActiveId(null);
    setPlannedInput(input);
    try {
      const result = await api<FuelSearch>("/gasoline-intelligence/search", "POST", input);
      setSearch(result);
      setBusy("Planning your stops…");
      const planned = await api<FuelPlan>("/gasoline-intelligence/plan", "POST", {
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
  const mapProvider = search?.provider ?? (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? "google" : "openstreetmap");
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

  return (
    <main className="mx-auto max-w-320 px-4 pt-4 pb-16">
      <Link href="/trips" className="text-[14px]">
        Back to your trips
      </Link>
      <div className="mt-5 mb-8 flex flex-wrap items-end justify-between gap-4">
        <h1>Gasoline Intelligence</h1>
        <span className="sign sign-small">US road trips</span>
      </div>

      <div className="grid grid-cols-[350px_minmax(0,1fr)] items-start gap-7 max-md:grid-cols-1">
        <form className="grid gap-5" onSubmit={submit}>
          <fieldset disabled={!!busy} className="grid min-w-0 gap-5 disabled:opacity-75">
            <section className={panel} aria-labelledby="vehicle-heading">
              <h2 id="vehicle-heading">
                <span className="mr-2 text-green">01</span> Your vehicle
              </h2>
              <div className={field}>
                <label htmlFor="vehicle-description">Describe your car</label>
                <textarea
                  id="vehicle-description"
                  rows={2}
                  maxLength={500}
                  placeholder="e.g. 2022 Toyota RAV4 XLE AWD, gas, not hybrid"
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setSuggestion(null);
                    invalidate();
                  }}
                />
                <button
                  type="button"
                  className="btn btn-quiet"
                  disabled={!description.trim()}
                  onClick={identify}
                >
                  Find my vehicle with AI
                </button>
              </div>
              {suggestion && vehicleSummary && (
                <p role="status" className="text-[14px] font-semibold text-green">
                  Found: {vehicleSummary}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["mpg", "MPG", 5],
                    ["tankGallons", "Tank (US gal)", 3],
                  ] as const
                ).map(([key, label, min]) => (
                  <div className={field} key={key}>
                    <label htmlFor={`vehicle-${key}`} className="text-[13px]">
                      {label}
                    </label>
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
              <div className={field}>
                <label htmlFor="fuel-grade">Fuel grade</label>
                <select
                  id="fuel-grade"
                  value={vehicle.grade}
                  onChange={(e) => changeVehicle("grade", e.target.value)}
                >
                  <option value="regular">Regular unleaded</option>
                  <option value="midgrade">Midgrade</option>
                  <option value="premium">Premium</option>
                  <option value="diesel">Diesel</option>
                </select>
              </div>
              {Number(vehicle.mpg) > 0 && Number(vehicle.tankGallons) > 0 && (
                <p className="rounded-lg bg-paper p-3 text-[14px]">
                  <strong>
                    {formatDistance(Number(vehicle.mpg) * Number(vehicle.tankGallons), distanceUnit, 0)}
                  </strong>{" "}
                  full tank ·{" "}
                  <strong>
                    {formatDistance(
                      Number(vehicle.mpg) *
                        Number(vehicle.tankGallons) *
                        (1 - Number(settings.reservePercent) / 100),
                      distanceUnit,
                      0,
                    )}
                  </strong>{" "}
                  with reserve
                </p>
              )}
              <AnimatedDisclosure
                ref={vehicleDetails}
                title="Other details for your vehicle"
              >
                <div className="grid gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    {(
                      [
                        ["year", "Year", "number"],
                        ["make", "Make", "text"],
                        ["model", "Model", "text"],
                        ["trim", "Engine / Trim", "text"],
                      ] as const
                    ).map(([key, label, type]) => (
                      <div className={field} key={key}>
                        <label htmlFor={`vehicle-${key}`} className="text-[13px]">
                          {label}
                        </label>
                        <input
                          id={`vehicle-${key}`}
                          type={type}
                          value={vehicle[key]}
                          onChange={(e) => changeVehicle(key, e.target.value)}
                          required={key !== "trim"}
                          min={key === "year" ? 1980 : undefined}
                          max={key === "year" ? new Date().getFullYear() + 2 : undefined}
                        />
                      </div>
                    ))}
                  </div>
                  {suggestion && (
                    <div className="grid gap-3 rounded-xl bg-paper p-4 text-[13px] text-muted">
                      <p>{suggestion.notes}</p>
                      {suggestion.sources.map((s) => (
                        <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                          {s.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </AnimatedDisclosure>
            </section>
            <section className={panel} aria-labelledby="route-heading">
              <h2 id="route-heading">
                <span className="mr-2 text-green">02</span> Your route
              </h2>
              <div className={field}>
                <label htmlFor="fuel-origin">Starting location</label>
                <input
                  id="fuel-origin"
                  placeholder="Champaign, IL"
                  required
                  maxLength={200}
                  value={settings.origin}
                  onChange={(e) => changeSetting("origin", e.target.value)}
                />
              </div>
              <div className={field}>
                <label htmlFor="fuel-destination">Destination</label>
                <input
                  id="fuel-destination"
                  placeholder="Nashville, TN"
                  required
                  maxLength={200}
                  value={settings.destination}
                  onChange={(e) => changeSetting("destination", e.target.value)}
                />
              </div>
              <div className={field}>
                <label htmlFor="fuel-departure">Departure date</label>
                <input
                  id="fuel-departure"
                  type="date"
                  required
                  value={settings.departure}
                  onChange={(e) => changeSetting("departure", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className={field}>
                  <label htmlFor="initial-fuel" className="text-[13px]">
                    Starting fuel (%)
                  </label>
                  <input
                    id="initial-fuel"
                    type="number"
                    min="1"
                    max="100"
                    required
                    value={settings.initialFuelPercent}
                    onChange={(e) => changeSetting("initialFuelPercent", e.target.value)}
                  />
                </div>
                <div className={field}>
                  <label htmlFor="reserve" className="text-[13px]">
                    Keep in reserve (%)
                  </label>
                  <input
                    id="reserve"
                    type="number"
                    min="10"
                    max="30"
                    required
                    value={settings.reservePercent}
                    onChange={(e) => changeSetting("reservePercent", e.target.value)}
                  />
                </div>
              </div>
            </section>
            <div className="grid gap-2">
              <OneClickPlanButton />
              <button className="btn btn-quiet" type="submit" value="hourly">
                Find hourly stops
              </button>
            </div>
          </fieldset>
        </form>

        <div className="grid min-w-0 gap-6">
          <div className="grid gap-3">
            <FuelMap
              provider={mapProvider}
              route={plan?.route ?? search?.route ?? null}
              stations={mapStations}
              selectedIds={selectedIds}
              activeId={activeId}
              onPick={pick}
              distanceUnit={distanceUnit}
            />
            {!search && !busy && (
              <p className="text-[14px] text-muted">Enter your vehicle and route to get started.</p>
            )}
          </div>
          {busy && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-lg border-2 border-green bg-white p-4 font-semibold text-green"
            >
              {busy}
            </div>
          )}
          {(error || (storedPlan && !plan)) && (
            <div
              role="alert"
              className="rounded-lg border-2 border-red bg-white p-4 font-semibold text-red"
            >
              {error || "Search again to get station-specific prices."}
            </div>
          )}
          {search && plannedInput && (
            <>
              <FuelSearchBar
                count={search.stations.length}
                grade={plannedInput.vehicle.grade}
                expiresAt={search.expiresAt}
                distanceUnit={distanceUnit}
                onDistanceUnitChange={setDistanceUnit}
              />
              <RegionalPrices search={search} />
              {plan && <PlanSummary plan={plan} input={plannedInput} distanceUnit={distanceUnit} />}
            </>
          )}
        </div>
      </div>
      <footer className="mt-10 text-[12px] leading-relaxed text-muted">
        {mapProvider === "google" ? <p>Route, station and fuel price data: Google Maps. Vehicle research: DeepSeek with linked sources.</p> : <>
          <p>Map and facility data © OpenStreetMap contributors; driving estimates by OSRM. Price reports and vehicle research by DeepSeek with linked sources.</p>
          <p>Public map services may be busy; local demo use is rate limited.</p>
        </>}
      </footer>
    </main>
  );
}
