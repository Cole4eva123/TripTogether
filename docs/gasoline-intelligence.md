# Gasoline Intelligence

A fuel planner for a US road trip: given the car and the trip, it finds the stations to buy at, and how much at
each, so the whole drive costs the least at the pump. It lives at `/trips/gasoline-intelligence`, reached from
the header and from a trip's page (which passes the trip's origin, destination and start date).

| Where | What |
|---|---|
| `lib/gasoline-intelligence/planner.ts` | The rules, pure: which stations to buy at (`cheapestStops`) and how much (`buildFuelPlan`) (tested in `planner.test.ts`) |
| `lib/gasoline-intelligence/google.ts`, `google-data.ts` | The Google requests, and the parsing of what comes back (tested in `google.test.ts`) |
| `lib/gasoline-intelligence/service.ts` | A search's lifetime: owner, expiry, rate limits, and the plan's retry loop |
| `lib/gasoline-intelligence/config.ts` | The settings read from the environment |
| `lib/gasoline-intelligence/ai.ts`, `prompts.ts`, `ai-cache.ts` | Vehicle lookup through DeepSeek ([prompts](deepseek-prompts.md)) |
| `lib/gasoline-intelligence/validation.ts`, `form.ts`, `display.ts` | Input validation, the form's defaults, distance display |
| `app/api/gasoline-intelligence/**`, `components/gasoline-intelligence/**` | The three endpoints and the page |

## How it works

### The cheapest plan is a path through stations

What a trip costs is the gallons burned times the price paid for them, and prices only exist at stations. So the
planner works on a graph whose stops are the origin, the destination and every station with a price, and asks
which stations to visit and how much to buy at each. The route is the answer, not the starting point: it is the
origin, the chosen stations, and the destination, in that order.

`cheapestStops` solves this exactly for the stations it is given. Between two purchases the cheapest plan does
one of two things: fills the tank (when the next stop is dearer), or buys just enough to arrive at the reserve
(when the next stop is cheaper, or is the destination). So only a few arrival fuel levels per station are worth
trying, and a pass over the stations in route order finds the cheapest. A tie goes to the plan with fewer stops.
A test checks it against every other subset of stations.

Only money paid at the pump is counted. The fuel already in the tank is free, and driving time, meals and tolls
have no price. A station off the route costs the extra miles to reach it, which is how a detour is weighed
against a lower price. Nothing spaces stops for rest: a stretch of driving longer than
`FUEL_REST_WARNING_MINUTES` adds a warning to the plan and nothing else.

### Where the stations come from

1. One Routes request gives the fastest route. It is only the centre line of the search.
2. Nearby Search requests cover a corridor `FUEL_CORRIDOR_MILES` to each side of it, one circle each, at most
   `FUEL_MAX_STATION_SEARCHES` of them. Each returns up to 20 stations, nearest the route first.
3. A station counts when it is in the US, open, inside the corridor, and has a Google price for the car's fuel
   grade, in USD, updated within 72 hours. Stations without one are shown on the map and never bought from.

The corridor does not need to be wide, because a detour burns fuel. At 30 MPG and $3.50 a gallon, a station 15
miles off the route costs about a gallon to visit, so a 12 gallon fill there must be about 30 cents a gallon
cheaper to pay for the trip. The default is 10 miles.

A route too long for the allowed number of searches gets wider circles spaced further apart, and the search
carries a warning that stations were sampled. Raise `FUEL_MAX_STATION_SEARCHES` to cover it.

### Estimates first, then the real road

Distances between stops are estimated while choosing: miles along the route, plus the way off it to a station
and back (1.3 times the straight line each way). Once the stops are chosen, one more Routes request through
them gives the real legs, and `buildFuelPlan` works out the purchases on those. If the real legs are too long
for the fuel, the stops are chosen again with the estimates stretched by what the road showed, up to three
times, before the plan fails with `422`.

A plan with no stops reuses the first route and makes no second request.

### What is not stored

A search lives in the server's memory for 30 minutes, belongs to the user who made it, and is gone on restart.
At most 24 are kept. Vehicle lookups are cached for 24 hours. Nothing goes in PostgreSQL.

Traffic is as of the moment of the search. The departure date is a calendar day and is only displayed.

## Settings

All in `.env.local` ([Google keys, step by step](google-maps-setup.md)); restart the dev server after a change.

| Variable | Default | What |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | none | Server key for Routes and Places (New). Never exposed to the browser |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | none | Browser key for the map. Public by design, so restrict it by referrer |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | `DEMO_MAP_ID` | The map's id |
| `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` | none, `deepseek-flash` | Vehicle lookup only |
| `FUEL_CORRIDOR_MILES` | `10` | How far from the fastest route to look for stations (1 to 30) |
| `FUEL_MAX_STATION_SEARCHES` | `10` | The most paid Places requests one search may make (1 to 30) |
| `FUEL_REST_WARNING_MINUTES` | `180` | Warn when a leg is longer than this (30 to 600) |

A value outside its range falls back to the default.

## API

All three need the session and answer `401` without it. Shapes are in `lib/gasoline-intelligence/types.ts`.
Every error is `{ error }`.

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/api/gasoline-intelligence/vehicle` | `{ description }` (up to 500 characters) | `200 VehicleSuggestion` | `400`; `429`; `502` DeepSeek failed; `503` no DeepSeek key; `504` |
| POST | `/api/gasoline-intelligence/search` | `FuelPreferences` | `200 FuelSearch`: the search id, the route, the stations, price samples by state, warnings | `400`; `422` no drivable route; `429`; `502` Google failed; `503` no Google keys; `504` |
| POST | `/api/gasoline-intelligence/plan` | `{ searchId, stationIds? }` | `200 FuelPlan`: the stops, gallons and cost at each, on real road legs | `400`; `410` the search expired; `422` the trip can't be made above the reserve; `429`; `502`; `504` |

Without `stationIds` the plan is the cheapest one. With them it is the plan through exactly those stations (the
page doesn't send any). Limits per user per five minutes: 4 searches, 6 vehicle lookups, 20 plans.
