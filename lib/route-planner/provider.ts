import { FuelError } from "./validation.ts";

type ProviderEnvironment = {
  [key: string]: string | undefined;
  FUEL_DATA_PROVIDER?: string;
  GOOGLE_MAPS_API_KEY?: string;
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?: string;
};

// The previous providers live only in the ignored local rollback snapshot.
// Never fall back to another network or a model when Google is unavailable.
export function fuelDataProvider(env: ProviderEnvironment): "google" {
  const configured = env.FUEL_DATA_PROVIDER?.trim();
  if (configured && configured !== "google" && configured !== "auto") {
    throw new FuelError("This planner uses Google Maps. Set FUEL_DATA_PROVIDER to google and restart the development server.", 503);
  }
  if (!env.GOOGLE_MAPS_API_KEY?.trim()) {
    throw new FuelError("Add GOOGLE_MAPS_API_KEY to .env.local and restart the development server.", 503);
  }
  if (!env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()) {
    throw new FuelError("Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env.local and restart the development server to display Google station data.", 503);
  }
  return "google";
}
