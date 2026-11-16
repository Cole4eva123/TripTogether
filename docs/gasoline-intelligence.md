# Gasoline Intelligence

中文合并说明见 [merge instruction.md](<merge instruction.md>)；配置步骤见 [Google Maps setup](google-maps-setup.md)。

The module lives at `/trips/gasoline-intelligence`, behind the existing sign-in. Trip details pass the
origin, destination and calendar `startDate`. Shared trips, authentication and itinerary storage keep
their existing interfaces.

## Setup and providers

1. Run `npm ci`.
2. On first setup, copy `.env.example` to `.env.local`; update only the missing values if it already exists. Configure the Google server key, separate restricted browser
   key and DeepSeek key as described in [Google Maps setup](google-maps-setup.md).
3. Run `npm run dev`, sign in and choose **Gasoline Intelligence**.

The server reads `GOOGLE_MAPS_API_KEY`; the browser map reads `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and
the optional `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`. Use different keys with API/application restrictions.
Personal credential notes are not loaded at runtime. Restart the dev server after changing environment
values; a production build needs rebuilding when a `NEXT_PUBLIC_` value changes.

The shipped implementation uses **Google Routes API**, **Places API (New)** and **Maps JavaScript API**
for routes, station prices and the map. **DeepSeek only identifies the vehicle**. Missing Google
configuration returns an actionable error; there is no automatic provider fallback.

Routes accepts origin and destination addresses directly. Each search makes one route request, then
one to three parallel Text Search requests along route sections, with at most 20 candidates per section.
A plan with stops makes one additional Routes request through those stops; a no-stop plan reuses the
base route. There is no automatic pagination, retry, per-station Details fanout, regional HTML request,
web station research, extra facility search, review or photo lookup.

Requests use explicit field masks for route geometry, road distances/times, station identity/address,
coordinates, fuel quotes, map links and required attribution. No restaurant, restroom, opening-hours,
review or photo fields are requested. Disabled stop preferences do not create additional API calls.
Google branding and returned third-party attributions stay visible on the Google map.
The browser SDK explicitly loads with `language=en&region=US`, independent of browser language;
Routes and Places requests use `languageCode:"en-US"` and `regionCode:"US"`.
See [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies).

## Vehicle and prices

The driver describes the vehicle. DeepSeek returns editable MPG, tank capacity and fuel grade with
linked sources; other specifications and pale-green research notes are folded away by default.
No confirmation checkbox is required. Incomplete specifications must be entered before planning.
Full-tank range is MPG × US gallons; the default reserve is 15%.

Each accepted price comes from that US station's `fuelOptions`, matches the selected fuel grade,
uses USD per US gallon and was updated within 72 hours. These are latest reported prices, not a
guarantee about the current pump. Missing, stale or invalid quotes remain unknown; recommendations
never replace them with a state average or the historical $3.50 assumption.

**Regional prices** are samples of returned quoted stations grouped by state, ordered by their first
position on the route. Cards show sample counts rather than claiming complete statewide averages.
Differences compare adjacent available samples, not an exact state-border price change.

## Planning and display

The planner balances fuel prices, range, desired break intervals and estimated detours. Membership
eligibility and explicit per-gallon discounts remain supported by the API; no universal brand discount
is assumed. The active page requires verified station prices. Estimate-enabled compatibility inputs
remain available only to explicit older API clients/local optional controls.

One-click planning defaults to two-hour intervals; hourly mode targets one hour. Requested intervals
remain within one to three hours. Final Google road legs must preserve the fuel reserve and the
three-hour driving cap. Missing safe coverage or quotes produces an error without relaxing these limits.
Candidate detours are geometric screening estimates; selected stops use the recalculated Google route.
Quantities buy enough to reach a cheaper selected station or the destination with reserve, up to tank
capacity. A rest stop can purchase zero gallons. This is a bounded heuristic, not a complete station census.

**Your Plan** shows Distance and **Estimated Duration with Breaks** together, followed by one row of Fuel cost,
Fuel used, Fuel purchased and Fuel on arrival. Phones use two columns. A no-purchase plan hides the
zero cost/purchase cards and shows an English message that the existing fuel reaches the destination
while remaining above the selected reserve. Zero detours are hidden. Only purchased fuel is charged;
starting fuel, driving time, meals, tolls and other travel expenses are not valued.

The displayed duration is the sum of Google's final route-leg driving durations through the selected
stops, plus `stopMinutes` for each stop. Detour driving is already included in that Google route and is
not added twice. Both the base route and the final route use `TRAFFIC_AWARE`; Google's leg `duration`
includes traffic. Static step times only weight estimated intermediate-point timing and never replace
the returned leg totals. Requests omit `departureTime`, so traffic estimates assume departure at lookup
time. The trip's date remains a calendar/display value, not a chosen clock time or a future-date forecast.
Results are snapshots, not continuous traffic monitoring. Start a new search to refresh traffic;
searches generated under the previous traffic-unaware mode cannot be reused after the change.

Recommended stops are compact cards connected by arrows. Distance Details is folded by default and
shows distance from start, from the previous stop and to the destination. The map supports wheel zoom,
station previews and matching station prices. Cards and popups use the same selected mi/km unit;
calculations/API distances remain miles. Disclosures animate with reduced-motion support. The search
validity countdown appears beside the candidate count and fuel grade; expiry requires a new search.

Departure is a calendar date (`YYYY-MM-DD`) from the trip or today's local date. Date-only plans show
elapsed arrival time including previous breaks; older ISO timestamp clients retain clock-based arrivals.
The date is displayed without time-zone conversion.

## Boundaries and lifecycle

All feature code and tests stay in `lib/gasoline-intelligence/` and
`components/gasoline-intelligence/`. `google.ts` coordinates Google requests; `google-data.ts` validates
their data; `service.ts` owns the existing session-bound lifecycle. `ai.ts` and `prompts.ts` contain only
vehicle research. `planner.ts`, `form.ts` and `display.ts` keep calculation, form and display concerns separate.

The APIs use the existing session cookie and `lib/api.ts`. Searches are user-bound, transient, bounded
and expire after 30 minutes; results do not survive a server restart. Previously generated identical
plans can be reused within the search lifetime. Google results are not added to a persistent station
database or shared vehicle-research cache. Vehicle research retains its bounded 24-hour cache.

`budget.ts` cancels actual upstream work: search has a 90-second budget, vehicle identification 45 seconds
and final planning 30 seconds. Each Google phase has a 15-second request timeout. DeepSeek thinking stays
disabled; vehicle web research has a 30-second timeout and JSON extraction ten seconds. Partial successful
station-search sections survive other section failures; the planner still rejects unsafe gaps.

- `POST /api/gasoline-intelligence/vehicle`: `{description}` → `VehicleSuggestion`.
- `POST /api/gasoline-intelligence/search`: `FuelPreferences` → `FuelSearch` with `provider:"google"`.
- `POST /api/gasoline-intelligence/plan`: `{searchId, stationIds?:string[]}` → `FuelPlan`.

Response types and status codes are in `lib/gasoline-intelligence/types.ts` and [api.md](api.md).

## Local rollback sources

The former open-source map, routing, station lookup and web-price implementation is retained only in
the Git-ignored `.local-features/gasoline-intelligence/legacy-openstreetmap/2026-11-15-google-migration/`
snapshot. Files preserve their relative paths with `.disabled` suffixes; `manifest.json` records hashes.
The local restoration README explains recovery. These files are not imported, compiled or uploaded.
There is no runtime switch to the archived implementation.

**Stop preferences** and **Choose your stops** also remain disabled, with isolated sources in the
ignored `.local-features/gasoline-intelligence/` directory. Do not force-add either local backup.
A clean checkout builds without this entire directory.

The current vehicle prompts and call flow are tracked in [deepseek-prompts.md](deepseek-prompts.md);
only supplier/cost research notes stay ignored locally. Keep this module guide, Google setup,
the prompt documentation, the API contract and the Chinese merge instructions in the repository so
other contributors can configure and integrate a clean checkout. Keep the module tests with its code.

Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` for local checks.
