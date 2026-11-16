"use client";

import type { FuelStop, RoadRoute, Station } from "@/lib/gasoline-intelligence/types";
import type { DistanceUnit, StationDistances } from "@/lib/gasoline-intelligence/display";
import GoogleFuelMap from "./GoogleFuelMap";

export type MapStation = Station & {
  displayPrice: { value: number; kind: FuelStop["priceKind"] } | null;
  distances: StationDistances;
};
export type FuelMapProps = {
  route: RoadRoute | null;
  stations: MapStation[];
  selectedIds: string[];
  activeId: string | null;
  onPick: (id: string) => void;
  distanceUnit: DistanceUnit;
};

export default function FuelMap(props: FuelMapProps) {
  return <GoogleFuelMap {...props} />;
}
