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

Each region (a city) has a library of things to do there. Admins publish **challenges**: a title and a region's
tasks at fixed squares of a 3×3, 4×4 or 5×5 card. A trip takes one challenge on at a time, and its members check
squares off as they do them; a full row, column or diagonal is a Bingo. Anyone can send a task in; it joins the
library once an admin approves it. Admins are the accounts listed in `ADMIN_EMAILS`.

The rules are pure functions in `lib/bingo.ts`, the store is `lib/bingo-store.ts`, and the shapes are in
`lib/bingo-types.ts`: `BingoChallenge`, `BingoCard`, `BingoCell`, `BingoTask`, `BingoRegion`. The library starts
with the tasks in `lib/bingo-catalog.ts`, and each of its regions with a starter challenge of its first nine.

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/trips/:id/bingo` | none | `200 { card, challenges: BingoChallenge[], suggestedRegion, viewer: { id, admin, maySwitch } }`; `card` is `null` before the trip takes a challenge on | `404` trip |
| POST | `/api/trips/:id/bingo` | `{ challengeId }` | `201 { card }`: the challenge's squares, unchecked; replaces the trip's card | `400` no challenge; `403` switching when not the trip's organizer or an admin; `404` trip, or a challenge not on offer; `409` another member picked the trip's first challenge at the same moment |
| PATCH | `/api/trips/:id/bingo/cells/:cellId` | `{ action: "complete" \| "undo" }` | `200 { card }` | `400` bad action; `403` undoing a square someone else checked off, unless an admin; `404` trip, or a square not on its card; `409` someone changed the square since it was read |
| GET | `/api/bingo/challenges?region=` | none | `200 { challenges }`, the published ones, newest first | `401` |
| POST | `/api/bingo/challenges` | `{ region, title, description?, size, taskIds }` | `201 { challenge }` | `400` invalid input, or a task not approved in that region; `403` not an admin |
| DELETE | `/api/bingo/challenges/:challengeId` | none | `204`; off offer, cards playing it keep their squares | `403` not an admin; `404` not on offer |
| GET | `/api/bingo/tasks?region=` | none | `200 { regions, tasks, mine, isAdmin, pendingCount }`: every region, the approved tasks of `region` (empty without it), everything I sent in, and how many tasks wait for review (0 unless I'm an admin) | `401` |
| POST | `/api/bingo/tasks` | `{ region, title, description }` | `201 { task }`: waiting for review, or approved at once when an admin adds it | `400` invalid input; `409` the region already has it, or it's already waiting |
| PATCH | `/api/bingo/tasks/:taskId` | `{ region, title, description }` | `200 { task }`; cards that have it show the new wording | `400`; `403` not an admin; `404` not in the library; `409` the region already has that title |
| DELETE | `/api/bingo/tasks/:taskId` | none | `204`; no new challenge can use it, the challenges that have it are withdrawn, cards that have it keep it, its sender sees it turned down | `403` not an admin; `404` not in the library |
| GET | `/api/bingo/review` | none | `200 { tasks }`, the ones waiting, oldest first | `403` not an admin |
| PATCH | `/api/bingo/review/:taskId` | `{ action: "approve" \| "reject", note? }` | `200 { task }` | `400`; `403` not an admin; `404`; `409` already reviewed |

- A trip plays one challenge at a time. Any member may pick the first one. Only the trip's organizer or an admin
  may switch to another (`403` otherwise), since switching clears every square; picking the same one again
  starts it over. There is no random draw and no swapping a square.
- Taking a challenge on copies its squares onto the trip's card, so withdrawing the challenge later leaves the
  card as it is.
- A challenge's `taskIds` are one per square in position order (row by row from 0), `size²` of them, none twice,
  each an approved task of its region. A region written another way ("chicago, il") joins the library's spelling.
- `suggestedRegion` is the region the trip's destination names ("Chicago, IL" is in Chicago), or `null`; the
  challenges of that region come first in `challenges`.
- A square checked off is its member's: only they, or an admin, may undo it. Checking off a square already done
  changes nothing. `viewer` says who is asking, so a page offers Undo only on the squares they may undo (a cell's
  `completedById`, or every one when `admin` is true), and `maySwitch` says whether they may switch challenges.
- A card's `cells` come in position order. `completed` counts the squares checked off, and `lines` lists every
  finished line as its positions, so `lines.length` is the number of Bingos.
- A task sent in under another spelling of an existing region joins that region. Titles are compared without case.
  A rejected task keeps the admin's `reviewNote` and may be sent in again.

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

## Lobby and matching

The shared lobby: a trip's organizer shares it, everyone sees the trips in the lobby compared with their own,
and asks to join one. When the organizer says yes, the applicant is in the trip, and in its chat group. The
store is `lib/lobby-store.ts`, the scoring `lib/matching.ts`, the search and order `lib/lobby.ts`; the tables
are `lobby_posts`, `lobby_requests` and `trip_messages`, which go with their trip (and with an account) when
it is deleted.

**The organizer decides.** Only the trip's organizer (`trip.ownerId`) shares it, takes it out of the lobby,
and accepts or declines requests. Every member sees the requests about their trip, with the applicant's name
and message. A member of a trip can't ask to join it, and nobody answers their own request.

**A post is the trip as it is now.** It stores only the trip and the organizer's note; where, when and how many
are read from the trip each time, so an edited plan shows at once.

**What is public.** On another group's card the members are counted, not named. Your own trips list their
members by name, and the requests about them name the applicant.

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/lobby` | none | `200 LobbyView` | `400` bad dates |
| POST | `/api/lobby` | `{ tripId, note }` | `201 { post }` | `400` invalid input; `403` not the organizer; `404` not my trip; `409` already in the lobby, or the trip is over |
| DELETE | `/api/lobby/:tripId` | none | `204`; requests still waiting close with `closedBy: "gone"` | `403` not the organizer; `404` not my trip, or not in the lobby |
| POST | `/api/join-requests` | `{ postId, message? }` | `201 { request }` | `400` invalid input; `404` not in the lobby; `409` I'm already in it, it's over, or I have a request waiting |
| GET | `/api/join-requests/:id` | none | `200 { request }` | `404` no such request, or I'm neither the applicant nor in the trip |
| PATCH | `/api/join-requests/:id` | `{ action: "accept" \| "decline" \| "withdraw" }` | `200 { request }` | `400`; `403` only the organizer answers, nobody answers their own request, only the applicant withdraws; `404`; `409` already answered, or accepting into a trip that is over |

All of them answer `401` when logged out. `GET /api/lobby` takes optional `?against=<tripId>` (which of my
trips the others are compared with; the best match without it), `?q=` (searches destinations, by any of their
names in the gazetteer, origins and notes), `?from=`/`?to=` (`YYYY-MM-DD`; trips travelled in that window) and
`?sort=closest|soonest|soonest-end` (closest: shared days first, then the score, then the start date; a trip
that is over always comes last).

`LobbyView` is `{ mine, others, requests, pendingRequestCount, publishedTripIds }`:

- `mine` and `others` are `LobbyPostView`s: a `LobbyPost` (`id, tripId, origin, destination, startDate,
  endDate, memberCount, note, publishedAt`) plus `mine` (I'm in the trip), `organizedByMe`, `score` (0 to 100
  against the best of my trips), `reasons`, `datesClash`, `ended`, `members`, `basis` (which of my trips it
  was compared with, and the days in common) and `myRequest` (my latest request about it).
- `requests` are `RequestItem`s, `{ request, role, mayAnswer, trip, members, gone }`: `role` is `"member"`
  (I'm in the trip) or `"applicant"`; `mayAnswer` is true for the organizer while it's pending; `gone` says
  the trip is no longer in the lobby (`trip.id` is then `""`).
- `pendingRequestCount` counts the requests I can answer; the navigation polls it every five seconds.
- `publishedTripIds` are my trips in the lobby, whatever the filters.

A `JoinRequest` is `{ id, tripId, applicantId, applicantName, message, status, score, createdAt, respondedAt,
closedBy }`. It starts `pending` and ends `accepted`, or `declined` with `closedBy` saying why: `"answerer"`
(the organizer said no), `"asked"` (the applicant took it back) or `"gone"` (the trip left the lobby). It keeps
saying `accepted` if the applicant later leaves the trip. One open request per person and trip, enforced by
the database; accepting someone who has joined meanwhile with the invite code just keeps them in.

## The chat group of a trip

Every trip has a chat group, whether or not it is in the lobby; only its members read and write in it.

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/trips/:id/chat` | none | `200 { messages: ChatMessage[] }`, oldest first | `404` not a member |
| POST | `/api/trips/:id/chat` | `{ body }` (1 to 2000 characters) | `201 { message }` | `400`; `404` not a member |

A `ChatMessage` is `{ id, tripId, senderId, senderName, body, sentAt }`. The page polls every three seconds.

## Places

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/places?q=<text>` | none | `200 { places: PlaceSuggestion[] }` | `401` |

The gazetteer is far too big to send to a browser, so the place search runs on the server and the browser gets
a short list of names to pick from. A suggestion is `{ name, country, region, weight }`: `name` is the place
people write, `country` and `region` say which one it is (so a second "Springfield" can be told apart), and
`weight` is how strongly the place claims the name, which orders the list. An empty search finds nothing.

Places come from a GeoNames gazetteer compiled into `lib/places.json.gz`. It is loaded on the server only, and
used for three things:

- the place search (`/api/places`),
- comparing two destinations by distance, so "Chicago" and "Chicago Heights" are near each other and "Chicago"
  and "Nashville" are not.

A place can be found by any of its names: "Beijing", "北京" and "Peking" all lead to the same city. A name the
gazetteer doesn't know is still usable; it is compared as text.
