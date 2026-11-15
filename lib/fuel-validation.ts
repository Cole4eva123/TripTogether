import type { FuelGrade, FuelPreferences, Vehicle } from "./fuel-types.ts";

export class FuelError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status=status; }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FuelError("Expected a JSON object.");
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new FuelError(`${label} is required (up to ${max} characters).`);
  }
  return value.trim();
}
function number(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new FuelError(`${label} must be between ${min} and ${max}.`);
  }
  return value;
}
export function parseVehicle(value: unknown): Vehicle {
  const v = object(value);
  if (!Number.isInteger(v.year)) throw new FuelError("Model year must be a whole number.");
  const grade = v.grade as FuelGrade;
  if (!["regular", "midgrade", "premium", "diesel"].includes(grade)) throw new FuelError("Choose a fuel grade.");
  return {
    year: number(v.year, "Model year", 1980, new Date().getFullYear() + 2),
    make: text(v.make, "Make", 60), model: text(v.model, "Model", 80),
    trim: typeof v.trim === "string" ? v.trim.trim().slice(0, 100) : "",
    mpg: number(v.mpg, "Highway fuel economy (MPG)", 5, 100),
    tankGallons: number(v.tankGallons, "Fuel tank (US gallons)", 3, 100), grade,
  };
}
export function parseFuelPreferences(value: unknown): FuelPreferences {
  const v = object(value);
  const departure = text(v.departure, "Departure date", 40);
  const departureMs=Date.parse(departure);
  if (!Number.isFinite(departureMs) || (/^\d{4}-\d{2}-\d{2}$/.test(departure) && new Date(departureMs).toISOString().slice(0,10)!==departure)) {
    throw new FuelError("Choose a valid departure date.");
  }
  const amenities = Array.isArray(v.amenities) ? v.amenities : [];
  if (amenities.length > 6 || amenities.some(a => typeof a !== "string" || a.length > 60)) {
    throw new FuelError("Choose up to six stop preferences (60 characters each).");
  }
  const memberships = Array.isArray(v.memberships) ? v.memberships : [];
  if (memberships.length > 8) throw new FuelError("Choose up to eight memberships.");
  return {
    origin: text(v.origin, "Starting location"), destination: text(v.destination, "Destination"), departure,
    vehicle: parseVehicle(v.vehicle), initialFuelPercent: number(v.initialFuelPercent, "Starting fuel (%)", 1, 100),
    reservePercent: number(v.reservePercent, "Fuel reserve (%)", 10, 30),
    intervalMinutes: number(v.intervalMinutes, "Stop interval (minutes)", 60, 180),
    maxDetourMinutes: number(v.maxDetourMinutes, "Maximum detour (minutes)", 1, 40),
    stopMinutes: number(v.stopMinutes, "Stop duration (minutes)", 5, 90),
    amenities: amenities as string[],
    memberships: memberships.map(m => {
      const entry = object(m);
      const brand=text(entry.brand, "Membership brand", 60);
      if (brand.replace(/[^a-z0-9]/gi,"").length<2) throw new FuelError("Enter a valid membership brand.");
      return { brand, discountCents: number(entry.discountCents, "Discount (cents/gal)", 0, 100) };
    }),
    estimatedPrice: v.estimatedPrice == null ? null : number(v.estimatedPrice, "Estimated price ($/gal)", 0.5, 15),
    timeValue: number(v.timeValue, "Value of driving time ($/hour)", 0, 100),
    otherCosts: number(v.otherCosts, "Other trip costs ($)", 0, 100000),
  };
}
