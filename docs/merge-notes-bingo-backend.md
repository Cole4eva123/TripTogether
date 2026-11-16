# Merging the `feature/bingo-backend2` branch

What `feature/bingo-backend2` changes, and what each other branch needs after it merges. The branch adds the real backend for
the base features (PostgreSQL + Drizzle + Better Auth, `docs/backend.md`) and feature 4, Travel Bingo.

It starts from `9b6339f` on `dev` ("style: move styling to Tailwind CSS v4"), before the lobby and matching
(feature 2) were merged, so it contains no lobby code and no lobby tables. Feature 2 adds its own tables to
`lib/db/schema.ts` when it moves onto this backend (see "Shared lobby" below).

## What `feature/bingo-backend2` touched in shared files

Everything else on the branch is a new file.

| File | Change | Likely conflict |
|---|---|---|
| `app/api/auth/*`, `app/api/trips/**` | import from `@/lib/store` instead of `@/lib/mock-db`; `await` added; the auth routes call Better Auth | the lobby branch edits the same route files; keep this side's store calls |
| `lib/server.ts` | `currentUser` reads the Better Auth session; `memberTrip` awaits the store | none |
| `app/trips/[id]/page.tsx` | one new "Travel Bingo" section in the sidebar, after "Invite your group" | small: BlindBox adds a section at the top of the same sidebar. Keep both |
| `app/trips/page.tsx` | two lines: the import of `components/bingo/AdminLinks` and `<BingoAdminLinks />` at the foot of `<main>` (a small admin-only line into the Bingo task library) | none expected: the lobby branches edit the top and the middle of the same file. Keep both |
| `docs/api.md` | the intro and the cookie/password lines updated for the real backend; "Travel Bingo" section appended at the end | small: other branches append their own section at the end. Keep all of them |
| `package.json`, `package-lock.json` | new dependencies and `db:generate` | gasoline adds dependencies too. Keep both lists in `package.json`, then delete `package-lock.json` and run `npm install` rather than merging the lockfile by hand |

On `dev`, after the merge: PGlite is gone (the app and the tests run on PostgreSQL only, `docs/backend.md`), and
`lib/mock-db.ts` is deleted, so a branch that still imports it moves to `lib/store.ts` as it merges.

## BlindBox

Merged into `dev`. Its rounds and sealed ideas moved to two tables (`blind_box_rounds`, one per trip, and
`blind_box_options`) that cascade from the trip, so deleting a trip deletes its box; every write locks the
round row, and saving the drawn stops adds them to the itinerary in the same transaction.

## Shared lobby (feature 2)

Merged into `dev` from `feature/shared-lobby-postgres`. Its own pool, migrations and adapter
(`lib/postgres.ts`, `lib/lobby-backend*.ts`, `lib/lobby-schema.ts`) gave way to dev's: three tables in
`lib/db/schema.ts` (`lobby_posts`, `lobby_requests`, `trip_messages`) with foreign keys that cascade from the trip
and the account, and `lib/lobby-store.ts` in place of `lib/match-db.ts`. Agreed changes made in the merge: only the
organizer shares, takes down and answers; members see requests with the applicant's name; a post stores only the
trip and its note; an accepted request stays accepted when the person leaves. The store tests written against the
in-memory fixtures (and the browser scripts) were replaced by `lib/lobby-store.test.ts`.

## Gasoline intelligence

It only uses `currentUser` / `needLogin` from `lib/server.ts`, which keep their names and signatures, so nothing
changes in code. `.env.example` (from that branch) should gain the backend settings from `docs/backend.md`:
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ADMIN_EMAILS`.

## After merging into `dev`

- `npm install`, then `npm test`, `npm run typecheck`, `npm run lint`.
- `README.md`'s stack table can mark the database, ORM and login rows as in use, and `AGENTS.md`'s layout list
  can name `lib/store.ts` and the Bingo files. Left for the merge, since other branches edit
  both files too.
- Anyone who ran the app before: nothing to migrate. The old store was in memory; the new one creates its tables
  on the first request. Log in again, since the session cookie changed.
