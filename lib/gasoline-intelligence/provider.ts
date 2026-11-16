import { FuelError } from "./validation.ts";

type ProviderEnvironment = {
  [key: string]: string | undefined;
  FUEL_DATA_PROVIDER?: string;
  GOOGLE_MAPS_API_KEY?: string;
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?: string;
};

// Keep provider selection explicit: a failed Google request must not silently
// start the slower, separately billed research path or mix map data providers.
export function fuelDataProvider(env: ProviderEnvironment): "google" | "openstreetmap" {
  const configured = env.FUEL_DATA_PROVIDER?.trim() || "auto";
  if (!["auto", "google", "openstreetmap"].includes(configured)) {
    throw new FuelError("Set FUEL_DATA_PROVIDER to auto, google or openstreetmap.", 503);
  }
  if (configured === "openstreetmap") return "openstreetmap";
  if (configured === "auto" && !env.GOOGLE_MAPS_API_KEY?.trim()) return "openstreetmap";
  if (!env.GOOGLE_MAPS_API_KEY?.trim()) {
    throw new FuelError("Add GOOGLE_MAPS_API_KEY to .env.local and restart the development server.", 503);
  }
  if (!env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()) {
    throw new FuelError("Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env.local and restart the development server to display Google station data.", 503);
  }
  return "google";
}
