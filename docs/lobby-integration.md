# Shared lobby integration boundary

This branch starts at clean dev `9b6339f`. It ships feature 2 only. Authentication, sessions, trip CRUD,
shared membership, itinerary, TripForm, TripSign and global styles remain byte-for-byte at that baseline.
The two shared-page changes are only the lobby navigation entry and the trip chat entry.
The homepage has no “Go to the shared lobby” button; it matches baseline.

## Technology

Next.js 16, React 19, TypeScript, Tailwind v4, Next API routes, PostgreSQL, Drizzle ORM and drizzle-kit.
Only shared_lobby_posts, shared_lobby_requests and shared_lobby_messages are created by this module's versioned migrations.
Migration bookkeeping lives in its own shared_lobby_migrations schema, separate from team migrations.
There is no SQLite/PGlite or in-memory business storage fallback in feature 2.
Better Auth and shared PostgreSQL accounts/trips remain the team lead's responsibility, per the user's decision.
The baseline README's technology table is preserved rather than rewritten to disguise missing integration.

## What the team must connect

`lib/lobby-backend.config.ts` deliberately exports null. Replace that with an implementation of
SharedLobbyBackend from lib/lobby-backend.ts, using the team's PostgreSQL trip/user store:

- tripsFor: current trips with live membership counts;
- tripMembers: current member ids and names;
- tripExists: whether the trip still exists;
- userName: the current user's display name;
- addMember: insert membership using the supplied transactionExecute function. This is required for atomic
  acceptance + membership insertion. Both modules must use the same PostgreSQL database and transaction.

The team must supply session identity and memberTrip through its shared lib/server.ts, without changing the
existing API response contract. Feature 2 does not replace this file or provide a competing login system.
Until connected, feature endpoints return explicit HTTP 503 instead of silently pretending integration works.
SharedBackend fixtures under tests/fixtures are test-only and are never imported by app routes.

The feature checks lifecycle against current shared membership when reading the lobby/requests. Team deletion
or leave hooks can call the same checks inside their transaction for immediate cleanup; no trigger is added to
shared user/trip/member tables by this feature. Cross-module foreign keys can only be added after team ids and
schema are confirmed. The module keeps independent copies of applicant names and publication details.

## Local verification

npm ci
npm run db:generate  # only when the three feature table definitions change
npm test            # needs dedicated PostgreSQL triptogether_test_lobby on localhost:55433
npm run typecheck
npm run lint
npm run build

Integration browser checks need the configured team adapter and a running server. Run with
BASE_URL=<configured preview URL> npm run test:browser:all. They are not a claim that unconfigured baseline
shared modules are production-ready.

