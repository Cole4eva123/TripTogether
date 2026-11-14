# API contract

The frontend calls these endpoints and nothing else (`lib/api.ts`). They live in `app/api/` as Next.js route
handlers. Today they run on `lib/mock-db.ts`, an in-memory store that empties on every restart.

**Building the real backend:** replace `lib/mock-db.ts` (and `currentUser` in `lib/server.ts`) with a database. Keep
every path, status code and response shape below, and the frontend needs no changes.

## Conventions

- Bodies are JSON. Shapes are in `lib/types.ts`: `User`, `Trip`, `Member`, `TripInput`.
- Dates are `YYYY-MM-DD` strings, with no time or time zone.
- Every error is `{ "error": string }`, written for the person using the app. The frontend shows it as-is.
- The session is an httpOnly cookie, `tt_session`, set by register and login. Every endpoint outside `/api/auth`
  returns `401 { error }` without it.
- A trip someone isn't a member of answers `404`, the same as a trip that doesn't exist, so trip ids aren't
  probeable.
- Validate trip bodies with `parseTripInput` from `lib/validate.ts` (tested in `lib/validate.test.ts`). It drops
  unknown fields, so a body can't set `ownerId` or `inviteCode`.

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
| GET | `/api/trips/:id` | none | `200 { trip, members: Member[] }` | `404` |
| PATCH | `/api/trips/:id` | `TripInput` (all four fields) | `200 { trip }` | `400`; `403` not the owner; `404` |
| DELETE | `/api/trips/:id` | none | `204` | `403` not the owner; `404` |

`TripInput` is `{ origin, destination, startDate, endDate }`. `endDate` may equal `startDate`, not precede it.

## Members

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/api/trips/join` | `{ code }` | `200 { trip }`; joining a trip I'm already in also succeeds | `404` no trip with that code |
| DELETE | `/api/trips/:id/members/me` | none | `204`, I leave the trip | `404`; `409` the owner can't leave (delete the trip instead) |

Invite codes are 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O, 1/I/L), unique, generated when the
trip is created. The join endpoint trims and uppercases the code before looking it up.
