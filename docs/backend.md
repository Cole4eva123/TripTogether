# Backend

The route handlers in `app/api/` keep the contract in `docs/api.md`; behind them, data lives in PostgreSQL
through Drizzle ORM, and accounts and sessions go through Better Auth. PostgreSQL is the only database: there is
no in-process stand-in, and without `DATABASE_URL` the first request fails with a message saying so.

## Running it

Start PostgreSQL 18 locally with Apple's `container` CLI (once; the data stays in the `triptogether-pg` volume),
and create the database the tests use:

```sh
container volume create triptogether-pg
container run -d --name triptogether-pg -p 127.0.0.1:5432:5432 -v triptogether-pg:/var/lib/postgresql \
  -e POSTGRES_USER=triptogether -e POSTGRES_PASSWORD=triptogether -e POSTGRES_DB=triptogether \
  docker.io/library/postgres:18
container exec triptogether-pg psql -U triptogether -c "create database triptogether_test"
```

After a reboot, `container system start` and then `container start triptogether-pg`. With Docker instead,
`docker compose up -d` starts the same server from `docker-compose.yml` (create `triptogether_test` the same way,
with `docker compose exec db psql …`).

Then point the app at it in `.env.local` and run `npm run dev`:

```sh
DATABASE_URL=postgres://triptogether:triptogether@localhost:5432/triptogether
BETTER_AUTH_SECRET=<openssl rand -base64 32>
```

The app applies pending migrations itself on the first request.

## Settings (`.env.local`)

| Name | What it does | Default |
|---|---|---|
| `DATABASE_URL` | The PostgreSQL server, `postgres://…` | none: required |
| `BETTER_AUTH_SECRET` | Signs the session cookie. Any long random string (`openssl rand -base64 32`) | Better Auth's dev-only secret, with a warning |
| `BETTER_AUTH_URL` | The address the app is served from | `http://localhost:3000` |
| `ADMIN_EMAILS` | Comma-separated emails of the people who review Travel Bingo tasks | nobody |

Who may do what, and how admins differ from trip organizers: `docs/roles.md`.

## Files

- `lib/db/schema.ts` — every table. After changing it, run `npm run db:generate` and commit the new file in
  `drizzle/`.
- `lib/db/client.ts` — the pool, opened on the first query rather than on import, so `next build` and the
  worker processes of `next dev` don't need a database.
- `lib/auth.ts` — Better Auth. Its own endpoints are not mounted; `app/api/auth/*` call `auth.api.*` so the
  `/api/auth/*` contract stays as written. Passwords are hashed by Better Auth; the session is its signed,
  httpOnly cookie, stored in the `sessions` table.
- `lib/store.ts` — trips, members and the itinerary.
- `lib/bingo-store.ts` — Travel Bingo.

## Tests

`npm test` runs the store tests against the `triptogether_test` database of the same server (override with
`TEST_DATABASE_URL`, which must name a `*_test` database). Each store test file empties that database and
applies the migrations afresh (`lib/db/test-db.ts`), so the files run one at a time.
