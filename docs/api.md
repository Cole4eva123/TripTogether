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

## Travel blind box

`/api/trips/:id/blind-box` uses the same session and membership checks (`401` / `404`) as the itinerary.
Types live in `lib/blind-box-types.ts`. All successes return `{ box: BlindBoxView | null }` and are private,
uncached responses. State is in `lib/blind-box-store.ts`, in memory until the server restarts; deleting a trip
also deletes its box. A trip has one current round, shared by its members.

| Method | Body | Success | Errors |
|---|---|---|---|
| GET | none | `200`, null if no round | `401`; `404` |
| POST | `BlindBoxSettings`, plus `previousRoundId` when replacing a revealed round | `201`, new collecting round | `403` non-organizer; `400` invalid settings; `409` collecting round exists or stale round |
| PATCH | `{ roundId, action: "submit", option: BlindBoxOptionInput }` | `200`, idea sealed | `400` invalid/nonmatching option or more than 10 per person; `409` stale/revealed round |
| PATCH | `{ roundId, action: "remove", optionId }` | `200`, own idea removed | `404` absent/not own; `409` stale/revealed round |
| PATCH | `{ roundId, action: "reveal" }` | `200`, shared reveal (repeat returns the same result) | `403` non-organizer; `400` no matching options or date outside edited trip; `409` stale round |
| PATCH | `{ roundId, action: "save" }` | `200`, all drawn stops added to itinerary once, `saved: true` | `400` date outside edited trip; `409` stale/unrevealed round |
| DELETE | `{ roundId }` | `200 { box: null }`, resets current round | `403` non-organizer; `409` stale round |

Settings are `{ destination, date, startTime, budget, availableMinutes, maxStops, preferences }`:

- Destination: required, up to 120 characters. Date: within the trip. Start: `HH:MM`, required.
- Budget: activity costs per person in USD, 0–10,000, up to two decimal places; excludes transport.
- Available time: integer 15–720 minutes, ending no later than midnight. Maximum stops: integer 1–5.
- Preferences: nonempty array of `Sightseeing`, `Food`, `Outdoors`, `Culture`, `Adventure`, `Relaxation`.

Options are `{ title, place, category, cost, durationMinutes, note }`. Title/place are required, up to 120
characters; note is optional, up to 500. Cost has the same bounds as budget; duration is an integer 15–720.
The server assigns identity and destination, and requires each submission to fit the current settings.

Before reveal, `ownOptions` contains only the caller's ideas, `submissions` contains member ids/counts,
and `revealedOptions` and `result` are null. Even the organizer cannot inspect others' sealed details.
After reveal, `revealedOptions` lists every current member's submitted idea (including unselected ideas),
and `result` contains selected stops with start times, total cost and total minutes. Ideas from members
who left before the draw are excluded. Membership is checked on every request.

The server shuffles matching demo/member options, greedily selects up to `maxStops` within the **combined**
budget and available minutes, and includes 15-minute transfer buffers between stops. Repeated title/place
pairs are skipped. It can return fewer stops than requested. No match leaves the round sealed. Demo ideas
cover Chicago, New York and San Francisco; prices/durations are illustrative estimates, not live data.
Other destinations work with member submissions. A new round replaces the old reveal but keeps saved plans.
The UI refreshes shared state every five seconds. Round ids prevent stale tabs from changing a new round.
