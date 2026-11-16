// The planner's settings, read from the environment (.env.local). Defaults and meanings: .env.example.
function setting(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}
export const fuelConfig = () => ({
  corridorMiles: setting("FUEL_CORRIDOR_MILES", 10, 1, 30),
  maxStationSearches: Math.floor(setting("FUEL_MAX_STATION_SEARCHES", 10, 1, 30)),
  restWarningMinutes: setting("FUEL_REST_WARNING_MINUTES", 180, 30, 600),
});
