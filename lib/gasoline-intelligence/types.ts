export type Coordinate = { lat: number; lng: number };
export type FuelGrade = "regular" | "midgrade" | "premium" | "diesel";
export type Source = { title: string; url: string };
export type Vehicle = {
  year: number;
  make: string;
  model: string;
  trim: string;
  mpg: number;
  tankGallons: number;
  grade: FuelGrade;
};
export type VehicleSuggestion = {
  vehicle: Partial<Vehicle>;
  sources: Source[];
  notes: string;
};
export type FuelPreferences = {
  origin: string;
  destination: string;
  departure: string; // YYYY-MM-DD; ISO timestamps remain accepted for older clients.
  vehicle: Vehicle;
  initialFuelPercent: number;
  reservePercent: number;
  intervalMinutes: number;
  maxDetourMinutes: number;
  stopMinutes: number;
  amenities: string[];
  memberships: { brand: string; discountCents: number }[];
  estimatedPrice: number | null;
  requireStationPrices?: boolean; // Defaults to true; regional/default estimates cannot price a recommended stop.
};
export type Price = {
  perGallon: number;
  source: Source;
  observedAt: string;
};
export type Station = {
  id: string;
  name: string;
  brand: string;
  address: string;
  state: string;
  location: Coordinate;
  routeMiles: number;
  routeMinutes: number;
  detourMiles: number;
  detourMinutes: number;
  amenities: string[];
  membersOnly: boolean;
  price: Price | null;
  open: string;
  mapUrl: string;
  source?: Source;
  attributions?: Source[];
};
export type RoutePoint = Coordinate & { miles: number; minutes: number };
export type RoadRoute = {
  origin: Coordinate;
  destination: Coordinate;
  points: RoutePoint[];
  miles: number;
  minutes: number;
  legs: { miles: number; minutes: number }[];
};
export type RegionPrice = {
  state: string;
  average: number;
  count: number;
  kind: "station sample" | "regional report";
  source: Source | null;
  observedAt: string | null;
  change: number | null;
};
export type FuelSearch = {
  id: string;
  provider?: "google" | "openstreetmap";
  expiresAt: string;
  route: RoadRoute;
  stations: Station[];
  regions: RegionPrice[];
  warnings: string[];
  searchedAt: string;
};
export type FuelStop = {
  station: Station;
  number: number;
  legMiles: number;
  legMinutes: number;
  milesFromStart: number;
  minutesFromStart: number;
  arrival: string;
  gallonsOnArrival: number;
  buyGallons: number;
  fuelAfterStop: number;
  pricePerGallon: number;
  priceKind: "web report" | "regional estimate" | "user estimate";
  cost: number;
  reason: string;
};
export type FuelPlan = {
  searchId: string;
  route: RoadRoute;
  stops: FuelStop[];
  arrival: string;
  totalMinutes: number;
  detourMinutes: number;
  detourMiles: number;
  gallonsUsed: number;
  gallonsPurchased: number;
  fuelOnArrival: number;
  purchaseCost: number;
  warnings: string[];
};
