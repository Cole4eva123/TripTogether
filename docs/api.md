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

## Lobby and matching

The shared lobby: people share a trip, see every other trip in real time, narrow the list down to the ones
they want, and ask to join one. When the group says yes, the applicant is in the trip, and in the
trip's chat group. The scoring lives in `lib/matching.ts`; the store is `lib/match-db.ts`; the search and the
filters over the lobby live in `lib/lobby.ts`.

**A trip is the group.** Everyone in the trip is part of it, and the trip has one chat group of its own: every
member of the trip can read and write in it. Everybody in a trip is also an owner of it: they travel together,
so they decide together who travels with them, and any member may answer a request to join. The one exception
is the person who asked: they are asking to be let in, so they don't answer their own request. A member of a
trip can't ask to join their own trip.

**Publishing is a separate thing from owning.** The publisher is whoever put the trip in the lobby, and they
are the only one who may take it down again or bring it up to date. A member who joined with an invite code
is an owner of the trip but not its publisher, so they answer requests without being able to remove it.

A post copies the trip's details when it is published, so a later edit to the trip doesn't change what the
lobby compares. A group that changes its plan can `PATCH` the post to bring it up to date, which keeps the
requests it already has. A post whose trip is deleted, or whose publisher left the trip, drops off the lobby
by itself, and any request waiting on it is turned down.

The card shows the trip as it is **now**, not as it was when the post was published: people join and leave a
trip afterwards, so the member list and the group size are read from the trip itself.

The requests live on the cards of the lobby, not on a page of their own: a request sits on the card of the
trip it is about, so it is found where the trip is, and it is never shown twice.

**A card says where the reader stands with the trip.** Someone who is one of its members is told so, and is
given the way into the trip and into its chat group. Someone who is not in it is offered the chance to ask.
Someone who published it is given the trip and the chat, and answers the requests about it.

**The lobby layout:** the left column holds the reader's own trips, one card each, with the requests about
them. A trip selector appears only when the reader is in more than one trip, and it says which of their trips
the others are compared against. The right column shows every other trip in the lobby, with a
destination/origin/note search, a window of dates, and a choice of order. Results are compared with the
selected trip, and ordered by overlapping dates, then by the score, then by the departure date. Scores only
determine the order; the cards show the actual dates in common rather than percentages.

**The filters are for the whole lobby.** The reader's own trips answer them as well, so a search that finds
one trip finds it wherever it is. A trip is never shown twice: the reader's own trips are in the left column
and everybody else's are in the right one.

Requests that have been answered are folded into history on the trip's card. A manual sync action appears
only when the published snapshot differs from the trip.

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/lobby` | none | `200 { mine: LobbyPostView[], others: LobbyPostView[], requests: RequestItem[] }` | `401` |
| POST | `/api/lobby` | `{ tripId, note }` | `201 { post }` | `400` invalid input; `404` not my trip; `409` already published |
| PATCH | `/api/lobby/:tripId` | none | `200 { post }`; the post is brought up to date with the trip | `404` not published, or not mine |
| DELETE | `/api/lobby/:tripId` | none | `204`; requests waiting on it are turned down | `404` not published, or not mine |
| POST | `/api/join-requests` | `{ postId, message? }` | `201 { request }` | `400` invalid input; `404` that trip isn't in the lobby; `409` I'm already in it, its trip is over, or I have a request waiting |
| GET | `/api/join-requests/:id` | none | `200 { request }` | `404` no such request, or I'm not party to it |
| PATCH | `/api/join-requests/:id` | `{ action: "accept" \| "decline" \| "withdraw" }` | `200 { request }` | `400`; `403` only a member of the trip may answer, and only the applicant may take it back; `404`; `409` already answered |

`GET /api/lobby` takes these optional query parameters:

- `?against=<tripId>` names which of the reader's own trips the comparison is made against. It can be a trip
  the reader joined as well as one they published, because the comparison is about where the reader is going.
  Without it the best of the reader's trips is used, which is what the comparison itself does.
- `?q=<text>` searches destinations, origins and notes. The search reads the gazetteer, so it runs on the
  server and the browser gets the trips that answer, not the gazetteer.
- `?from=<YYYY-MM-DD>` and `?to=<YYYY-MM-DD>` narrow the list to the trips being travelled in that window.
  A trip that overlaps the window counts, even if it starts before it.
- `?sort=closest|soonest|soonest-end` chooses the order. `closest` is the default: the trips that share
  days with the reader's trip come first, then the closest ones, then the ones that leave soonest. A trip
  that has already been is always listed last, because there is nothing to join.

There is no `GET /api/join-requests`: the lobby already returns the requests with the posts, and a second way
to fetch them would be a second thing to keep right.

## The chat group of a trip

Every trip has a chat group, whether it was published to the lobby or not. Every member of the trip is in
it, and only they may read or write in it.

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/trips/:id/chat` | none | `200 { messages: ChatMessage[] }` | `404` not a member of the trip |
| POST | `/api/trips/:id/chat` | `{ body }` | `201 { message }` | `400`; `404` not a member of the trip |

The messages are kept for as long as the trip is: the trip is the chat group, so the conversation goes with
it. The frontend polls the messages every three seconds rather than holding a socket open, and polls the
lobby every five seconds, so a new message and a new request arrive by themselves.

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
- resolving a place name typed into the trip form into a known place,
- comparing two destinations by distance, so "Chicago" and "Chicago Heights" are near each other and "Chicago"
  and "Nashville" are not.

A place can be found by any of its names: "Beijing", "北京" and "Peking" all lead to the same city. A name the
gazetteer doesn't know is still usable; it is compared as text.

`LobbyPostView` is a `LobbyPost` plus `mine` (I'm in the trip that was published), `publishedByMe`
(I published it, so I can take it down), `score` (0 to 100 against the best of
my trips, 0 when I have none), `reasons` (why it matched, in plain words), `datesClash` (it shares no
days with any of my trips), `ended` (the trip is over, so it can't be joined), `members` (the group as it is
now), `basis` (which of my own trips it was compared against, and the days the two share), and `myRequest`
(the request I made about this trip, if I have one).

`RequestItem` is `{ request, role, post, trip, members, gone, lastMessage }`. `role` is `"owner"` or
`"applicant"`, from the reader's side: `"owner"` means the reader is in the trip the request is about,
`"applicant"` means the reader is the one who asked. `"owner"` is about being in the group, not about having
published it: everybody in a trip is an owner of it. `post` and `trip` are the publication and the trip the
request is about, `members` is who is in the trip now, and `gone` says the trip is no longer in the lobby.

`JoinRequest` carries `applicantId` and `applicantName`: the person who asked, copied in because they are
not a member of the trip yet, so a request has to keep saying who asked even after it has been answered.

A chat message is written by a person, not by a trip, so `ChatMessage.senderName` is the name of whoever
wrote it.

When a trip leaves the lobby, a request waiting on it is turned down — the trip went away rather than being
answered, so `closedBy` is `"gone"` and nobody reads it as a refusal. An **accepted** request stands: the
applicant is already in the trip, and the trip is still there. It closes as well if the applicant then leaves
the trip: they aren't in it any more, so the request that let them in closes with `closedBy: "left"`.

## The life of a request

A request starts `pending` and ends one of three ways: a member of the trip accepts it (`accepted`), turns
it down (`declined`), or the applicant takes it back (`declined`, `closedBy: "asked"`). `closedBy` is one of
`"asked"`, `"answerer"`, `"gone"` or `"left"`.

Accepting a request puts the applicant in the trip, and so in its chat group. Declining it does not. One
person can ask to join as many trips as they like, and be in all of them: the requests are per person and
trip, and the membership is per trip.

## Database and schema versions

The schema in `docs/db-schema.sql` is applied automatically on the first connection. The file carries a
version in `PRAGMA user_version`; a database written by an older version is brought up to date when it is
opened, without losing users, trips, publications, requests or messages. `lib/migration.test.ts` writes an old
database by hand and checks that the conversation in it survives the upgrade.

Version 3 is what the lobby is built on now: a request is a person asking to join a trip, and the
conversation belongs to the trip rather than to a pair of groups. A database from version 1 or 2 is brought
up to it: an old request becomes a request to join the trip it was about, the people of the group that asked
are put in that trip (which is what "agreed to travel together" meant), and the old conversations move onto
the trip they were about.

The database is one PostgreSQL file. The default is `.data/triptogether.sqlite`; `TRIPTOGETHER_DB_PATH` selects a
different path, and `:memory:` keeps everything in memory, which is what the tests use.


Integration: until the team configures lib/lobby-backend.config.ts, feature endpoints return 503. The baseline shared backend is intentionally unchanged.


### Lobby privacy

Public lobby responses redact publisher names and ids, member names and personal ids, and applicant names
and personal ids. Members are anonymous count entries. Applications use per-request references such as
Request A1B2C3, including POST/GET/PATCH responses. The response keeps request and trip ids required for
permitted actions, and never includes a last-message chat preview. Internal membership, authorization and
stored names remain unchanged; authenticated trip chat is separate. Public notes and application messages
remain user-authored, with the publish form advising users to keep names/contact details for group chat.

### Pending application reminders

GET /api/lobby includes pendingRequestCount, computed from pending requests the authenticated reader can
answer. It ignores the current search/date filter and excludes applicants answering their own requests.
The navigation polls this same endpoint approximately every five seconds; lobby refreshes also update it
immediately after actions. These are in-app reminders, not system push notifications.
