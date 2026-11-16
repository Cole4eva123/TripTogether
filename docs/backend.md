# Backend

The route handlers in `app/api/` keep the contract in `docs/api.md`; behind them, data lives in PostgreSQL
through Drizzle ORM, and accounts and sessions go through Better Auth.

## Running it

Nothing to install: `npm run dev` works as before. Without `DATABASE_URL`, the app runs **PGlite** (PostgreSQL
compiled to WebAssembly, inside the Node process) and keeps its files in `.data/pglite` (git-ignored). Delete that
folder to start over. Only one process may open it at a time, so stop `npm run dev` before running a second one.

To use a real PostgreSQL instead (the README's target), start the one in `docker-compose.yml` and point the app at it:

```sh
docker compose up -d
echo 'DATABASE_URL=postgres://triptogether:triptogether@localhost:5432/triptogether' >> .env.local
```

The app applies pending migrations itself on the first request, on either database.

## Settings (`.env.local`)

| Name | What it does | Default |
|---|---|---|
| `DATABASE_URL` | `postgres://…` for a PostgreSQL server; `memory://` for a throwaway in-memory PGlite | PGlite in `.data/pglite` |
| `BETTER_AUTH_SECRET` | Signs the session cookie. Any long random string (`openssl rand -base64 32`) | Better Auth's dev-only secret, with a warning |
| `BETTER_AUTH_URL` | The address the app is served from | `http://localhost:3000` |
| `ADMIN_EMAILS` | Comma-separated emails of the people who review Travel Bingo tasks | nobody |

Who may do what, and how admins differ from trip organizers: `docs/roles.md`.

## Files

- `lib/db/schema.ts` — every table. After changing it, run `npm run db:generate` and commit the new file in
  `drizzle/`.
- `lib/db/client.ts` — the connection, opened on first use (never on import: `next dev` loads route modules in
  worker processes too, and PGlite's folder can't be shared).
- `lib/auth.ts` — Better Auth. Its own endpoints are not mounted; `app/api/auth/*` call `auth.api.*` so the
  `/api/auth/*` contract stays as written. Passwords are hashed by Better Auth; the session is its signed,
  httpOnly cookie, stored in the `sessions` table.
- `lib/store.ts` — trips, members and the itinerary. Same functions as `lib/mock-db.ts`, async.

`lib/mock-db.ts` is no longer used by any route. It stays, unchanged, until every branch
has moved over (see `docs/merge-notes-bingo-backend.md`).

## Tests

`npm test` runs the store tests (`lib/store.test.ts`) against an in-memory PGlite with the real migrations, so
they need no database either.
