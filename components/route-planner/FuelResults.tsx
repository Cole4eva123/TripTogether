"use client";

import type { FuelPlan, FuelPreferences, FuelSearch } from "@/lib/route-planner/types";
import { formatDistance, type DistanceUnit } from "@/lib/route-planner/display";
import AnimatedDisclosure from "./AnimatedDisclosure";

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
export const duration = (minutes: number) => {
  const total = Math.round(minutes);
  return `${Math.floor(total / 60)}h ${total % 60}m`;
};
const gallons = (n: number) => `${n.toFixed(1)} gal`;

// The round post at each end of the road, centred on it the way `.marker` is.
const endpoint =
  "absolute top-0.5 left-[calc((var(--road-w)_-_20px)_/_2_-_var(--road-w)_-_var(--road-gap))] size-5 rounded-full border-4 border-white bg-green";

/** Each state's average pump price along the route, on one line. */
export function RegionalPrices({ search }: { search: FuelSearch }) {
  if (!search.regions.length) return null;
  const cheapest = Math.min(...search.regions.map((region) => region.average));
  return (
    <ul className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[15px]" aria-label="Average price by state">
      <li className="text-muted">Average by state</li>
      {search.regions.map((region) => (
        <li key={region.state} className={region.average === cheapest ? "font-bold text-green" : ""}>
          <span className="font-bold">{region.state}</span>{" "}
          <span className="tabular-nums">{money(region.average)}</span>
          {region.average === cheapest && " lowest"}
        </li>
      ))}
    </ul>
  );
}

/** The plan: what it costs on a guide sign, then the drive as a road with a marker post at every fuel stop. */
export function PlanSummary({
  plan,
  input,
  warnings,
  distanceUnit,
}: {
  plan: FuelPlan;
  input: FuelPreferences;
  warnings: string[];
  distanceUnit: DistanceUnit;
}) {
  const miles = (n: number, decimals = 0) => formatDistance(n, distanceUnit, decimals);
  const needsFuel = plan.gallonsPurchased > 0.000001;
  return (
    <section className="grid gap-6" aria-labelledby="plan-heading">
      <div className="sign grid gap-1 px-7 pt-6 pb-5">
        <h2 id="plan-heading" className="text-[44px] leading-none font-extrabold tabular-nums max-sm:text-[36px]">
          {needsFuel ? money(plan.purchaseCost) : "No fuel stops needed"}
        </h2>
        <p className="text-[17px] font-semibold">
          {needsFuel
            ? `in fuel, buying ${gallons(plan.gallonsPurchased)} at ${plan.stops.length === 1 ? "one stop" : `${plan.stops.length} stops`}`
            : `The fuel in the tank gets you there above your ${input.reservePercent}% reserve.`}
        </p>
        <p className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[15px]">
          <span>{miles(plan.route.miles)}</span>
          <span>{duration(plan.totalMinutes)} with stops</span>
          {plan.detourMiles >= 0.05 && <span>{miles(plan.detourMiles, 1)} of detour</span>}
        </p>
      </div>

      {warnings.length > 0 && (
        <ul className="grid gap-1 text-[14px] text-muted">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <ol className="road road-itinerary mt-2 mb-6 max-w-2xl">
        <li className="relative pb-8">
          <span className={endpoint} aria-hidden />
          <p className="font-bold">{input.origin}</p>
          <p className="text-[14px] text-muted">
            Leave with {gallons((input.vehicle.tankGallons * input.initialFuelPercent) / 100)} in the tank
          </p>
        </li>
        {plan.stops.map((stop) => (
          <li key={stop.station.id} className="relative pb-8">
            <span className="marker" aria-hidden>
              {stop.number}
            </span>
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-[18px] leading-tight font-extrabold wrap-anywhere">{stop.station.name}</h3>
              <p className="shrink-0 text-[20px] leading-tight font-extrabold text-green tabular-nums">
                {money(stop.pricePerGallon)}
                <span className="text-[13px] font-semibold"> /gal</span>
              </p>
            </div>
            <p>
              Add {stop.buyGallons.toFixed(2)} gal for {money(stop.cost)}
              <span className="text-muted"> at {miles(stop.milesFromStart)}</span>
            </p>
            <AnimatedDisclosure title="Stop details" className="max-w-md">
              <div className="grid gap-1 text-[14px]">
                <p>{stop.station.address || "Address not mapped"}</p>
                <p>
                  {miles(stop.legMiles, 1)} and {duration(stop.legMinutes)} from{" "}
                  {stop.number === 1 ? "the start" : `stop ${stop.number - 1}`}, {miles(plan.route.miles - stop.milesFromStart, 1)} to go
                </p>
                <p>
                  Tank goes from {gallons(stop.gallonsOnArrival)} to {gallons(stop.fuelAfterStop)}
                </p>
                <p>
                  <a href={stop.station.mapUrl} target="_blank" rel="noreferrer">
                    Open in Google Maps
                  </a>
                </p>
              </div>
            </AnimatedDisclosure>
          </li>
        ))}
        <li className="relative">
          <span className={endpoint} aria-hidden />
          <p className="font-bold">{input.destination}</p>
          <p className="text-[14px] text-muted">
            Arrive with {gallons(plan.fuelOnArrival)}, after burning {gallons(plan.gallonsUsed)}
          </p>
        </li>
      </ol>
    </section>
  );
}
