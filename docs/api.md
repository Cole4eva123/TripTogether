# API contract

The frontend calls these endpoints and nothing else (`lib/api.ts`). They live in `app/api/` as Next.js route
handlers. Today they run on `lib/mock-db.ts`, an in-memory store that empties on every restart.

**Building the real backend:** replace `lib/mock-db.ts` (and `currentUser` in `lib/server.ts`) with a database. Keep
every path, status code and response shape below, and the frontend needs no changes.

## Conventions

- Bodies are JSON. Shapes are in `lib/types.ts`: `User`, `Trip`, `Member`, `TripInput`, `PlanItem`, `PlanInput`.
- Dates are `YYYY-MM-DD` strings, with no time or time zone.
- Every error is `{ "error": string }`, written for the person using the app. The frontend shows it as-is.
- The session is an httpOnly cookie, `tt_session`, set by register and login. Every endpoint outside `/api/auth`
  returns `401 { error }` without it.
- A trip someone isn't a member of answers `404`, the same as a trip that doesn't exist, so trip ids aren't
  probeable.
- Validate trip bodies with `parseTripInput` and plan bodies with `parsePlanInput`, both in `lib/validate.ts`
  (tested in `lib/validate.test.ts`). They drop unknown fields, so a body can't set `ownerId`, `inviteCode` or
  `addedBy`.

## Auth

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/api/auth/register` | `{ name, email, password }` | `201 { user }`, sets cookie | `400` missing name, bad email, password under 8 characters; `409` email taken |
| POST | `/api/auth/login` | `{ email, password }` | `200 { user }`, sets cookie | `401` wrong email or password |
| POST | `/api/auth/logout` | none | `204`, clears cookie | none |
| GET | `/api/auth/me` | none | `200 { user }` | `401` |

Emails are trimmed and lowercased before they're stored or compared. Passwords must be stored hashed (the mock
keeps them in plain text).

## Trips

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/trips` | none | `200 { trips: Trip[] }`, the trips I'm a member of, earliest start first | `401` |
| POST | `/api/trips` | `TripInput` | `201 { trip }`; I become owner and first member | `400` invalid input |
| GET | `/api/trips/:id` | none | `200 { trip, members: Member[], items: PlanItem[] }` | `404` |
| PATCH | `/api/trips/:id` | `TripInput` (all four fields) | `200 { trip }` | `400`; `403` not the owner; `404` |
| DELETE | `/api/trips/:id` | none | `204`; its plan items go too | `403` not the owner; `404` |

`TripInput` is `{ origin, destination, startDate, endDate }`. `endDate` may equal `startDate`, not precede it, and
a trip is at most 60 days. Editing the dates leaves existing plan items where they are, even outside the new
dates; the frontend shows those apart and lets members move or remove them.

## Members

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/api/trips/join` | `{ code }` | `200 { trip }`; joining a trip I'm already in also succeeds | `404` no trip with that code |
| DELETE | `/api/trips/:id/members/me` | none | `204`, I leave the trip | `404`; `409` the owner can't leave (delete the trip instead) |

Invite codes are 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O, 1/I/L), unique, generated when the
trip is created. The join endpoint trims and uppercases the code before looking it up.

## Itinerary

Any member can add, edit and remove any plan item. Items come back with `GET /api/trips/:id` in no particular
order; the frontend groups and sorts them (`lib/itinerary.ts`).

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/api/trips/:id/items` | `PlanInput` | `201 { item }`; `addedBy` is my name | `400` invalid input; `404` trip |
| PATCH | `/api/trips/:id/items/:itemId` | `PlanInput` (all fields) | `200 { item }` | `400`; `404` trip or item |
| DELETE | `/api/trips/:id/items/:itemId` | none | `204` | `404` trip or item |

`PlanInput` is `{ date, time, title, place, note }`:

- `date` is a day within the trip's current dates.
- `time` is `HH:MM` on a 24-hour clock, or empty/null for "any time that day" (stored as `null`).
- `title` is required, up to 120 characters; `place` up to 120; `note` up to 1000. Missing `place` and `note`
  are stored as `""`.

## Gasoline Intelligence

The fuel planner uses the existing session cookie. All three endpoints return `401` when signed out.
Bodies and response shapes are defined in `lib/gasoline-intelligence/types.ts`; provider configuration, estimates and
planning behavior are documented in `docs/gasoline-intelligence.md`.

New searches return `FuelSearch.provider:"google"`; clients display station data on the Google map.
Optional `Station.attributions` contains provider names and links to retain with the map. Routes,
station lookup and station-specific `fuelOptions` quotes use Google only. DeepSeek identifies vehicles
only. There is no web-price research, regional HTML request, extra facility lookup or provider fallback.
Missing Google keys return `503`; upstream failures do not switch providers. Searches from the archived
non-Google implementation cannot be reused and return `410` during planning.
See `docs/google-maps-setup.md` for configuration.

`FuelPreferences.departure` is a calendar date (`YYYY-MM-DD`), passed through from the trip's `startDate`.
Legacy ISO timestamp values remain accepted. With a date-only departure, the UI displays elapsed travel
time at each stop rather than an assumed departure/arrival clock time.

Both route computations use `TRAFFIC_AWARE`. Google's route-leg `duration` values include traffic,
and `FuelPlan.totalMinutes` adds `stopMinutes` per stop. `departureTime` is omitted from Google requests,
so traffic estimates assume departure at lookup time; the input calendar date is not a future traffic
forecast. Results do not update continuously; a new search refreshes traffic. Searches created under
the previous routing preference return `410` during planning rather than reuse old timing.

`FuelPlan.purchaseCost` and each `FuelStop.cost` are fuel-purchase cash only (gallons bought × station price).
`totalCost`, `fuelConsumedCost`, `FuelPreferences.timeValue` and `FuelPreferences.otherCosts` have been
removed. Gallons used, purchased and remaining are still returned separately; old nonfuel cost inputs
are ignored. No-purchase plans cost zero without assigning a dollar value to starting fuel.
Provider timeouts return `504`: vehicle identification has a 45-second budget, route search 90 seconds,
and final road planning 30 seconds. Each Google request has a 15-second timeout within that budget.

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/api/gasoline-intelligence/vehicle` | `{ description: string }` (up to 500 characters) | `200 VehicleSuggestion` with cited research and editable partial vehicle specs | `400` invalid input; `429` rate limit; `502` upstream failure; `503` missing DeepSeek key |
| POST | `/api/gasoline-intelligence/search` | `FuelPreferences` | `200 FuelSearch`, including an opaque user-bound search ID, route, stations, regional station samples and warnings | `400` invalid settings; `404` location/stations not found; `429`; `502` map failure; `503` missing Google configuration; `504` timeout |
| POST | `/api/gasoline-intelligence/plan` | `{ searchId, stationIds?: string[] }` | `200 FuelPlan` with road-verified stops, quantities, costs and arrival times | `400` invalid selection; `410` expired/unavailable search; `422` insufficient verified station prices, insufficient range or over three hours between stops; `429`; `502` upstream failure |

Searches last 30 minutes and are not persisted. Search/vehicle/plan rate limits are respectively
4/6/20 requests per five minutes per user. `FuelPreferences.requireStationPrices` defaults to `true`;
the page always enables it. Recommended stops require a recent Google quote for that exact US station,
USD currency and selected fuel grade. Regional station samples remain comparison data. If verified quotes cannot support a safe route,
planning returns `422` explaining the missing station prices. Explicit `false` is retained only for
legacy estimate-enabled API clients/local optional controls. Membership eligibility, prices and route
coordinates are resolved on the server, not trusted from a planning request.
