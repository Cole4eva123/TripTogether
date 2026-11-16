# Gasoline Intelligence

中文合并说明见 [merge instruction.md](<merge instruction.md>)；完整提示词见 [deepseek-prompts.md](deepseek-prompts.md)。

This module lives at `/trips/gasoline-intelligence`, behind the existing sign-in. The trip detail page passes its starting
point, destination and `startDate` to the planner. It does not change shared itineraries, authentication or storage.

## Local setup

1. Run `npm ci`.
2. Copy `.env.example` to `.env.local` and fill in `DEEPSEEK_API_KEY`. For Google route/station prices and map setup, follow [Google Maps setup](google-maps-setup.md).
3. Run `npm run dev`, sign in, then choose **Gasoline Intelligence**.

Configure the DeepSeek key and use `deepseek-flash`, which supports the server-side web tools.
Keep keys server-side: never prefix this key with `NEXT_PUBLIC_`. `.env.local` and local credential notes
are ignored by Git. Existing local keys are not overwritten.

## Data providers and limits

- **Google (preferred when configured):** `FUEL_DATA_PROVIDER=google` selects Routes API, Places API (New)
  and the Maps JavaScript map. `auto` selects Google when the server key exists, otherwise it keeps the
  original providers below; `openstreetmap` explicitly keeps them. Both server and restricted browser
  keys are required before paid search requests begin. Each search uses one Routes request and one to
  three parallel Text Search requests, with up to 20 places per section. Price, address, grade and date
  come directly from each US Place's `fuelOptions`; no station-by-station model research, regional HTML
  lookup or reverse geocoding runs on this path. Invalid, missing or stale quotes remain unknown. Regional
  cards summarize the returned priced stations in route order, with sample counts, rather than claiming
  statewide coverage. Known store/restaurant types and an explicit `restroom:true` are used as facilities;
  no brand-based restroom assumption is made. The final route through stops uses Google road legs.
  Provider failures do not silently switch to web research. Google station data is drawn only on the
  Google map, keeping its branding and returned third-party attributions. The API does not guarantee
  every station has a quote. See [setup and billing](google-maps-setup.md).
- **Original provider path:** the services below remain available without Google configuration.
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
- **EIA JSON API (optional):** `EIA_API_KEY` enables official weekly, grade-specific state retail averages
  for supported states. Only actual state facets and USD/US-gallon observations within seven days are
  accepted; national, PADD and city averages are never relabeled as state data. If every route state is
  covered, no AAA HTML is requested. See [EIA API documentation](https://www.eia.gov/opendata/documentation.php).
- **AAA state price table (fallback):** when no configured API covers a requested state, retrieves the public [state fuel price averages](https://gasprices.aaa.com/state-gas-price-averages/)
  once per 15 minutes across users, parses the selected grade and publication date, and rejects missing,
  invalid or older-than-seven-day data. These reports take precedence over smaller station samples.
  A state average is always an estimate for a particular station, never a station-specific pump quote.
- **DeepSeek:** web research of the vehicle and an initial sample of at most 16 evenly distributed candidate stations,
  in batches of four with at most four batches in flight. If a safe quoted path is still unavailable and
  at least 18 seconds remain, research at most eight unqueried existing candidates near gaps. No late
  paid station-discovery chain is started: at most 24 station IDs are researched. A second JSON-mode
  call per batch extracts the research because web tools do not accept JSON response
  mode. Vehicle and price sources must match actual citation annotations; station-directory sources
  must match URLs from the Search API results. A station price must have an observation
  date within 72 hours; a regional report within seven days. Unknown, uncited and stale prices are
  discarded. The page requires station-specific quotes; missing quotes remain unknown and are excluded
  from recommendations, even when a regional average is available.

References: [OSRM route API](https://project-osrm.org/docs/v5.5.2/api/),
[Overpass QL](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL),
[DeepSeek web tools](https://api-docs.deepseek.com/guides/web_tools/),
[DeepSeek JSON output](https://api-docs.deepseek.com/guides/json_mode/).

## Vehicle specifications and prices

The driver describes their car (including year/trim/engine if known). MPG, tank capacity and fuel grade
remain visible and editable; other specifications and sources are folded away by default. Research
notes and their linked sources share a pale green panel inside the folded vehicle details. There is no confirmation
step. Missing specifications remain blank and must be filled in before planning. Pure EVs
need a separate charging planner. Full-tank range is MPG × US gallons; the default reserve is 15%.

The page sets `requireStationPrices:true`: only source-backed, grade/address-matched station prices
observed within 72 hours can price a recommended stop. State averages are comparison data and never
replace a missing station quote. The historical $3.50 fallback remains in the optional controls/API,
but only explicit `requireStationPrices:false` enables estimate-based plans. Regional station-sample means
show sample sizes and must not be described as statewide averages. Price changes compare the available
regional evidence in route order, not a guarantee about an exact state border or individual exit.

## Planning and optional controls

The forward path search scores candidate sequences using fuel prices, desired intervals and nearby
facilities, with geometric detours in reachability checks. It excludes inaccessible membership-only stations
and estimated detours above the configured limit. Membership discounts are additional user-entered
cents per gallon; zero means membership access only. There is no assumed universal brand discount.

Hourly mode targets 60 minutes; one-click mode defaults to 120 minutes. The optional settings/API
accept a 60–180 minute preference. Actual road legs
must stay at or below three hours and retain the fuel reserve. Sparse coverage may prevent a plan;
the app returns a clear error rather than an unsafe sequence. Fuel needs can require an earlier stop.
Before price enrichment, the search checks geometric coverage without requiring prices. If candidates
leave an unreachable section and at least 45 seconds remain, it performs at most one focused station-search
round with at most six anchors, and deduplicates the additional candidates. It preserves the requested reserve,
detour limit and three-hour driving cap. An unresolved gap is reported with its mile range rather than
being described as a problem with the starting fuel level.
The recommendation is a cost-based heuristic, not proof of a global optimum or a complete station census.

Candidate detours are estimates based on distance from the route. After selection, the selected route provider recomputes
the entire route through the stops. Quantities, arrival times, distance since the previous stop and fuel
feasibility use these actual road legs. At each stop buy enough to reach the next cheaper selected
station with reserve, or cover the remaining trip up to tank capacity. Rest stops can buy zero gallons.

**Stop preferences** and **Choose your stops** are currently disabled in the shipped page. Their full
source, isolated components and restoration instructions are retained only in the Git-ignored
`.local-features/gasoline-intelligence/` directory with `.disabled` extensions. No tracked module imports
that directory, so a clean checkout builds without it. Defaults and API support remain intact: 120-minute
interval, 15-minute breaks/detours, no memberships and Restroom preference.
The retained $3.50 estimate field is ignored for recommended station prices in the default strict mode.
The API still supports ordered manual stop IDs and the same reserve/driving checks, up to 23 stops.

The mi/km pill switch beside the candidate count switches displayed distances throughout
the planner; calculations and API fields remain in miles. Station popups and cards separate the address,
distance from start, distance from the previous selected stop, and distance to the destination. Verified
stops use the recomputed road legs; candidates and pending edits show approximate distances with `~`.
Regional price cards follow the first-encounter order of states along the trip, including origin and
destination states without station anchors. Unknown-position regions stay last; price deltas are computed
after ordering. Cards share equal widths and heights. **Fuel cost** is only the sum of purchased gallons
times each station's price. Three separate cards show fuel used, purchased and on arrival. The former
**Cost & fuel details** block is removed, followed by
**Your Recommended Stops** in the same heading style as **Your Plan**. Stops appear as compact cards linked
by arrows: a horizontally scrolling row on desktop, a downward sequence on phones. Recommended cards
do not show the former **Details & sources** disclosure; quote citations and dates remain in API data.
The three distance lines are folded under **Distance Details** in cards and map popups. Active disclosures
share 200 ms height, opacity and chevron transitions, with reduced-motion support.
Hovering over **One-click plan** for one second shows its explanation in a rounded theme-colored
tooltip; keyboard focus also reveals it, and Escape dismisses it. The map's lower-left summary keeps
the displayed route's distance and driving time alongside the zoom and preview instructions.
The live countdown to the search's `expiresAt` follows the fuel grade in the candidate summary.
An expired result prompts a new search; the countdown does not renew it. The muted page footer credits
the active providers: Google Maps and DeepSeek, or OpenStreetMap, OSRM and DeepSeek with public-service limits.

Only road fuel purchases are charged. There is no starting-fuel valuation, total-trip cost, driving-time
charge, toll, meal or accommodation calculation; a zero-purchase plan has fuel cost zero.
Departure is a calendar date (`YYYY-MM-DD`)
prefilled from the trip's `startDate`; standalone use defaults to today. Stops display elapsed time since
departure, including previous breaks, without assuming a clock time. Calendar dates are shown without
time-zone conversion. Older API clients can still send an ISO timestamp and receive clock-based arrivals.

## API and lifecycle

All endpoints require the existing session cookie. Server keys never reach the browser; the separate,
website-restricted Maps JavaScript key is public by design. Searches expire after
30 minutes and are bound to their user in a bounded process-local cache. Requests are rate limited per
signed-in user; selections and costs cannot be supplied by an untrusted client as authoritative data.
Nothing in this module is persisted across server restarts.

## Performance and module boundaries

All module code and tests live in `lib/gasoline-intelligence/`. `form.ts` owns defaults and request conversion; `prompts.ts` owns prompt templates;
`stations.ts` owns web-directory fallback; `eia.ts` validates official price JSON;
`service.ts` coordinates the providers and the existing session-bound search lifecycle.
Complete cited vehicle research is cached for 24 hours, station directories for six hours, road routes
for five minutes, and successful price batches for five minutes. Cached quotes retain their actual
observation timestamps and are checked for freshness again. Identical in-flight requests are shared;
the public geocoder's single-request queue remains in place. State price lookups overlap routing and
station discovery, and DeepSeek skips regional averages already returned by a price provider.
These changes reduce repeated work; first-time online lookup time still depends on upstream services.
Actual fetch and queue cancellation use the request-local budget in `budget.ts`: route search 90 seconds,
vehicle identification 45 seconds and road planning 30 seconds. DeepSeek thinking stays disabled;
web research times out at 30 seconds and JSON extraction at 10 seconds. Search API, routing and Overpass
time out at 12 seconds, geocoding at eight seconds, and regional providers at five seconds. Regional
comparison data does not block recommendations; DeepSeek no longer does extra regional-average research.
Valid partial quotes survive failed batches, and timeouts never relax fuel or driving constraints.

- `POST /api/gasoline-intelligence/vehicle`: `{description}` → `VehicleSuggestion`.
- `POST /api/gasoline-intelligence/search`: `FuelPreferences` → `FuelSearch`.
- `POST /api/gasoline-intelligence/plan`: `{searchId, stationIds?:string[]}` → `FuelPlan`. Omit IDs for recommendations;
  an empty array deliberately requests no stops, subject to range and driving-time checks.

See `lib/gasoline-intelligence/types.ts` for response shapes and `docs/api.md` for status codes.
Run `npm run lint`, `npm run typecheck`, and `npm test` for local checks.
