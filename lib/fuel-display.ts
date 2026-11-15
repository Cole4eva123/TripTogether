import type { FuelStop, Station } from "./fuel-types.ts";

export type DistanceUnit = "mi" | "km";
export type StationDistances = {
  fromStart: number;
  fromPrevious: number;
  toDestination: number;
  previousLabel: string;
  estimated: boolean;
};
type RouteStation = Pick<Station, "id" | "routeMiles" | "detourMiles">;
type DistancePlan = {
  route: { miles: number };
  stops: (Pick<FuelStop, "number" | "milesFromStart" | "legMiles"> & { station: Pick<Station, "id"> })[];
};

export function formatDistance(miles: number, unit: DistanceUnit, decimals = 1): string {
  return `${(Math.max(0, miles) * (unit === "km" ? 1.609344 : 1)).toFixed(decimals)} ${unit}`;
}

export function getStationDistances(station: RouteStation, routeMiles: number, selected: RouteStation[], plan: DistancePlan | null): StationDistances {
  const stop = plan?.stops.find(stop => stop.station.id === station.id);
  if (stop && plan) {
    return {
      fromStart: stop.milesFromStart,
      fromPrevious: stop.legMiles,
      toDestination: Math.max(0, plan.route.miles - stop.milesFromStart),
      previousLabel: stop.number === 1 ? "start" : `stop ${stop.number - 1}`,
      estimated: false,
    };
  }
  const ordered = [...selected].sort((a, b) => a.routeMiles - b.routeMiles);
  const index = ordered.findIndex(item => item.id === station.id);
  const before = index >= 0 ? ordered.slice(0, index) : ordered.filter(item => item.routeMiles <= station.routeMiles);
  const after = index >= 0 ? ordered.slice(index + 1) : ordered.filter(item => item.routeMiles > station.routeMiles);
  const previous = before.at(-1);
  const halfDetour = Math.max(0, station.detourMiles) / 2;
  const detours = (items: RouteStation[]) => items.reduce((total, item) => total + Math.max(0, item.detourMiles), 0);
  return {
    fromStart: Math.max(0, station.routeMiles) + detours(before) + halfDetour,
    fromPrevious: Math.max(0, station.routeMiles - (previous?.routeMiles ?? 0)) + (previous?.detourMiles ?? 0) / 2 + halfDetour,
    toDestination: Math.max(0, routeMiles - station.routeMiles) + halfDetour + detours(after),
    previousLabel: previous ? `stop ${before.length}` : "start",
    estimated: true,
  };
}

export function resultValidity(expiresAt: string, now: number): string {
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  return seconds > 0
    ? `Results expire in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
    : "Results expired · Search again";
}
