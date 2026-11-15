# Gasoline Intelligence

中文合并说明见 [merge instruction.md](<merge instruction.md>)。

This module lives at `/trips/gasoline-intelligence`, behind the existing sign-in. The trip detail page passes its starting
point and destination to the planner. It does not change shared itineraries, authentication or storage.

## Local setup

1. Run `npm ci`.
2. Copy `.env.example` to `.env.local` and fill in `DEEPSEEK_API_KEY`.
3. Run `npm run dev`, sign in, then choose **Gasoline Intelligence**.

Configure the DeepSeek key and use `deepseek-flash`, which supports the server-side web tools.
Keep keys server-side: never prefix this key with `NEXT_PUBLIC_`. `.env.local` and local credential notes
are ignored by Git. Existing local keys are not overwritten.

## Data providers and limits

- **Nominatim:** resolves the two locations in the US and missing addresses for sampled/selected stations.
  An identifying User-Agent, a shared single-request queue (at least 1.1 seconds apart), bounded cache,
  and explicit submit-only searches are implemented. There is no autocomplete or background polling.
  **Read the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/): public
  service traffic must stay below one request per second across the entire application. The developer
  must deliberately choose this service and operate it within that limit.** The public endpoint is for
  this small local demo; replace `NOMINATIM_BASE_URL` before scaling or running multiple instances.
- **OSRM:** road geometry, per-segment distances/durations and road legs through selected stops. Times
  are estimates without live traffic. Routes over 30 hours must be split into separate travel days.
  The public demo has no service guarantee; `OSRM_BASE_URL` can point to a dedicated instance.
- **Overpass / OpenStreetMap:** stations within a 4 km route corridor and mapped restaurants,
  convenience stores and toilets within approximately 350 m. Stations are deduplicated and sampled
  with several alternatives per half-hour window. These are mapped facilities, not promises about
  opening hours, fuel grade availability or accessible restrooms. Configure `OVERPASS_API_URL` to
  replace the public service. A timeout or coverage gap produces an actionable error.
  If the index is unreachable and DeepSeek is configured, the fallback uses the DeepSeek Search API to
  find station-directory pages around route towns, extracts supported addresses, and geocodes them.
  Addresses without matching search-result source URLs or geocoding
  matches are rejected. These candidates link their station source; facilities are included only when
  explicitly reported by that source. Other nearby facilities may be missing. The fallback never
  assumes a restroom is present because of a chain's name. Set `FUEL_STATION_PROVIDER=web` to select
  this path directly on networks where Overpass is unreachable; the default `auto` tries OSM first.
- **Leaflet + OpenStreetMap tiles:** interactive map, route, numbered stops and alternative stations.
  Attribution stays visible. See the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
  before deploying; no bulk downloading, offline prefetch or tile proxy is used.
- **AAA state price table:** retrieves the public [state fuel price averages](https://gasprices.aaa.com/state-gas-price-averages/)
  once per 15 minutes across users, parses the selected grade and publication date, and rejects missing,
  invalid or older-than-seven-day data. These reports take precedence over smaller station samples.
  A state average is always an estimate for a particular station, never a station-specific pump quote.
- **DeepSeek:** web research of the vehicle and at most 16 evenly distributed candidate stations per
  search. A second JSON-mode call extracts the research because web tools do not accept JSON response
  mode. Vehicle and price sources must match actual citation annotations; station-directory sources
  must match URLs from the Search API results. A station price must have an observation
  date within 72 hours; a regional report within seven days. Unknown, uncited and stale prices are
  discarded. Research failure leaves stations usable with the user's explicit estimate.

References: [OSRM route API](https://project-osrm.org/docs/v5.5.2/api/),
[Overpass QL](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL),
[DeepSeek web tools](https://api-docs.deepseek.com/guides/web_tools/),
[DeepSeek JSON output](https://api-docs.deepseek.com/guides/json_mode/).

## Vehicle and price confirmation

The driver describes their car (including year/trim/engine if known), reviews cited specifications, and
confirms the MPG, tank capacity and required fuel grade. Missing specifications remain blank. Pure EVs
need a separate charging planner. Full-tank range is MPG × US gallons; the default reserve is 15%.

Web-reported station prices, AAA/other regional estimates and the user's fallback estimate have separate labels.
The initial $3.50/gal fallback is an editable assumption, **not a current market quote**. Clear it to
exclude stations lacking either a price report or a regional estimate. Regional station-sample means
show sample sizes and must not be described as statewide averages. Price changes compare the available
regional evidence in route order, not a guarantee about an exact state border or individual exit.

## Planning and manual edits

The forward path search scores candidate sequences using fuel cost, geometric detours, the driver's
time value, desired interval and nearby facilities. It excludes inaccessible membership-only stations
and estimated detours above the configured limit. Membership discounts are additional user-entered
cents per gallon; zero means membership access only. There is no assumed universal brand discount.

Hourly mode targets 60 minutes; one-click mode accepts a 60–180 minute preference. Actual road legs
must stay at or below three hours and retain the fuel reserve. Sparse coverage may prevent a plan;
the app returns a clear error rather than an unsafe sequence. Fuel needs can require an earlier stop.
Before price enrichment, the search checks whether eligible candidates cover the whole route. If they
leave an unreachable section, it performs up to two focused station-search rounds, at most six route
anchors per round, and deduplicates the additional candidates. It preserves the requested reserve,
detour limit and three-hour driving cap. An unresolved gap is reported with its mile range rather than
being described as a problem with the starting fuel level.
The recommendation is a cost-based heuristic, not proof of a global optimum or a complete station census.

Candidate detours are estimates based on distance from the route. After selection, OSRM recomputes
the entire route through the stops. Quantities, arrival times, distance since the previous stop and fuel
feasibility use these actual road legs. At each stop buy enough to reach the next cheaper selected
station with reserve, or cover the remaining trip up to tank capacity. Rest stops can buy zero gallons.

Manual station selection is ordered along the original route. **Recalculate selected stops** applies
the edits; the old totals are hidden while edits are pending. The same reserve and driving-time checks
apply to manual edits. A maximum of 23 stops is allowed per travel day.

The trip budget estimates the value of **all fuel consumed**, including starting fuel, plus other costs
entered by the user. Cash spent buying fuel on the road is shown separately and is not added twice.
Tolls, meals and accommodation are not automatically priced. Arrival times include breaks and are
displayed in the browser's time zone, with a time-zone label.

## API and lifecycle

All endpoints require the existing session cookie. Keys never reach the browser. Searches expire after
30 minutes and are bound to their user in a bounded process-local cache. Requests are rate limited per
signed-in user; selections and costs cannot be supplied by an untrusted client as authoritative data.
Nothing in this module is persisted across server restarts.

- `POST /api/gasoline-intelligence/vehicle`: `{description}` → `VehicleSuggestion`.
- `POST /api/gasoline-intelligence/search`: `FuelPreferences & {vehicleConfirmed:true}` → `FuelSearch`.
- `POST /api/gasoline-intelligence/plan`: `{searchId, stationIds?:string[]}` → `FuelPlan`. Omit IDs for recommendations;
  an empty array deliberately requests no stops, subject to range and driving-time checks.

See `lib/fuel-types.ts` for response shapes and `docs/api.md` for status codes.
Run `npm run lint`, `npm run typecheck`, and `npm test` for local checks.
