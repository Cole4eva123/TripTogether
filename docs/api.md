# API contract

The frontend calls these endpoints and nothing else (`lib/api.ts`). They live in `app/api/` as Next.js route
handlers, backed by PostgreSQL through Drizzle, with accounts through Better Auth (`docs/backend.md`). Every path,
status code and response shape below is the one the earlier in-memory store answered, so the frontend needed
no changes.

## Conventions

- Bodies are JSON. Shapes are in `lib/types.ts`: `User`, `Trip`, `Member`, `TripInput`, `PlanItem`, `PlanInput`.
- Dates are `YYYY-MM-DD` strings, with no time or time zone.
- Every error is `{ "error": string }`, written for the person using the app. The frontend shows it as-is.
- The session is Better Auth's signed httpOnly cookie, `better-auth.session_token`, set by register and login.
  Every endpoint outside `/api/auth` returns `401 { error }` without it.
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

Emails are trimmed and lowercased before they're stored or compared. Better Auth stores passwords hashed.

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

## Travel Bingo

Each region has a library of things to do there. A trip draws a Bingo card from its region's library; members
check squares off as they do them, and a full row, column or diagonal is a Bingo. Anyone can send a task in; it
joins the library once an admin approves it. Admins are the accounts listed in `ADMIN_EMAILS`.

The rules are pure functions in `lib/bingo.ts`, the store is `lib/bingo-store.ts`, and the shapes are in
`lib/bingo-types.ts`: `BingoCard`, `BingoCell`, `BingoTask`, `BingoRegion`. The library starts with the tasks in
`lib/bingo-catalog.ts`.

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/trips/:id/bingo` | none | `200 { card, regions: BingoRegion[], suggestedRegion, viewer: { id, admin, mayRedraw } }`; `card` is `null` before one is drawn | `404` trip |
| POST | `/api/trips/:id/bingo` | `{ region, size? }` | `201 { card }`; replaces the trip's card | `400` no region, size not 3/4/5, or the region has too few tasks; `403` replacing a card when not the trip's creator or an admin; `404` trip |
| PATCH | `/api/trips/:id/bingo/cells/:cellId` | `{ action: "complete" \| "undo" \| "replace", taskId? }` | `200 { card }` | `400` bad action, or `taskId` not in the card's region; `403` undoing or swapping a square someone else checked off, unless an admin; `404` trip, or a square not on its card; `409` that task is already on the card, or no task is left to swap in |
| GET | `/api/bingo/tasks?region=` | none | `200 { regions, tasks, mine, isAdmin, pendingCount }`: every region, the approved tasks of `region` (empty without it), everything I sent in, and how many tasks wait for review (0 unless I'm an admin) | `401` |
| POST | `/api/bingo/tasks` | `{ region, title, description }` | `201 { task }`: waiting for review, or approved at once when an admin adds it | `400` invalid input; `409` the region already has it, or it's already waiting |
| PATCH | `/api/bingo/tasks/:taskId` | `{ region, title, description }` | `200 { task }`; cards that have it show the new wording | `400`; `403` not an admin; `404` not in the library; `409` the region already has that title |
| DELETE | `/api/bingo/tasks/:taskId` | none | `204`; no new card draws it, cards that have it keep it, its sender sees it turned down | `403` not an admin; `404` not in the library |
| GET | `/api/bingo/review` | none | `200 { tasks }`, the ones waiting, oldest first | `403` not an admin |
| PATCH | `/api/bingo/review/:taskId` | `{ action: "approve" \| "reject", note? }` | `200 { task }` | `400`; `403` not an admin; `404`; `409` already reviewed |

- Any member may draw the first card, check off, and swap a square nobody has checked off. Only the trip's
  creator or an admin may draw a new card over an existing one (`403` otherwise), since it clears every square. A square checked off is
  its member's: only they, or an admin, may undo it or swap its task. Checking off a square already done changes
  nothing. Drawing again replaces the card and its progress.
- `size` is 3 (the default), 4 or 5; the card holds `size²` different tasks, so the region needs at least that
  many approved ones.
- `suggestedRegion` is the region the trip's destination names ("Chicago, IL" is in Chicago), or `null`.
- `viewer` is who is asking, so a page can offer Undo only on the squares they may undo: their own (a cell's
  `completedById`), or every one when `admin` is true; and `mayRedraw` says whether they may draw a new card.
- A card's `cells` come in position order, row by row from 0. `completed` counts the squares checked off, and
  `lines` lists every finished line as its positions, so `lines.length` is the number of Bingos.
- `replace` without `taskId` swaps in a random task from the region that isn't on the card. Either way the square
  starts over, unchecked.
- A task sent in under another spelling of an existing region ("chicago, il") joins that region. Titles are
  compared without case. A rejected task keeps the admin's `reviewNote` and may be sent in again.

## Travel blind box

`/api/trips/:id/blind-box` uses the same session and membership checks (`401` / `404`) as the itinerary.
Types live in `lib/blind-box-types.ts`. All successes return `{ box: BlindBoxView | null }` and are private,
uncached responses. State is in PostgreSQL (`lib/blind-box-store.ts`); deleting a trip
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
The UI refreshes shared state every five seconds. Round ids prevent stale tabs from changing a new round, and
writes to a round run one at a time (its row is locked), so two saves still add the stops once.
