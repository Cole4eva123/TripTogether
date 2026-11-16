import type { FuelPreferences, Vehicle } from "./types.ts";

export type VehicleFields = { [Key in keyof Vehicle]: string };
export type FuelFormSettings = {
  origin: string;
  destination: string;
  departure: string;
  initialFuelPercent: string;
  reservePercent: string;
  intervalMinutes: string;
  maxDetourMinutes: string;
  stopMinutes: string;
  estimatedPrice: string;
  customAmenity: string;
};

export const emptyVehicle: VehicleFields = {
  year: "", make: "", model: "", trim: "", mpg: "", tankGallons: "", grade: "regular",
};
export const defaultFuelAmenities: readonly string[] = ["Restroom"];

export function createFuelFormSettings(initial: { origin?: string; destination?: string; startDate?: string }, now = new Date()): FuelFormSettings {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return {
    origin: initial.origin || "", destination: initial.destination || "", departure: initial.startDate || today,
    initialFuelPercent: "100", reservePercent: "15", intervalMinutes: "120", maxDetourMinutes: "15",
    stopMinutes: "15", estimatedPrice: "3.50", customAmenity: "",
  };
}

export function vehicleToFields(value: Partial<Vehicle>): VehicleFields {
  const result = { ...emptyVehicle };
  for (const key of Object.keys(emptyVehicle) as (keyof Vehicle)[]) {
    if (value[key] != null) result[key] = String(value[key]);
  }
  return result;
}

export function buildFuelPreferences(
  settings: FuelFormSettings,
  vehicle: VehicleFields,
  automatic: boolean,
  amenities: readonly string[] = defaultFuelAmenities,
  memberships: Readonly<Record<string, string>> = {},
): FuelPreferences {
  return {
    origin: settings.origin, destination: settings.destination, departure: settings.departure,
    vehicle: { ...vehicle, year: Number(vehicle.year), mpg: Number(vehicle.mpg), tankGallons: Number(vehicle.tankGallons), grade: vehicle.grade as Vehicle["grade"] },
    initialFuelPercent: Number(settings.initialFuelPercent), reservePercent: Number(settings.reservePercent),
    intervalMinutes: automatic ? Number(settings.intervalMinutes) : 60,
    maxDetourMinutes: Number(settings.maxDetourMinutes), stopMinutes: Number(settings.stopMinutes),
    estimatedPrice: settings.estimatedPrice.trim() ? Number(settings.estimatedPrice) : null,
    requireStationPrices: true,
    amenities: [...amenities, ...(settings.customAmenity.trim() ? [settings.customAmenity.trim()] : [])],
    memberships: Object.entries(memberships).map(([brand, value]) => ({ brand, discountCents: Number(value) })),
  };
}
