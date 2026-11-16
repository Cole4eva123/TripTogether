<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# TripTogether

Next.js 16 (App Router, React 19, TypeScript). Product scope and the stack (技术栈 table): `README.md`.

- Styling is Tailwind CSS v4 utility classes in the markup. `app/globals.css` holds only the theme (palette,
  breakpoints, font), element defaults, and the road-atlas component classes built from pseudo-elements and
  layered shadows (`btn`, `link-btn`, `sign*`, `road*`, `marker`). Add new styles as utilities, not CSS rules.
- Backend: PostgreSQL only (local, in Apple's `container` or Docker) through Drizzle ORM, auth through Better Auth.
  No embedded stand-in such as PGlite. Setup, settings and tests: `docs/backend.md`. Deployment is out of scope for now.

## Commands

- `npm run dev` (port 3000), `npm run lint`, `npm run typecheck`, `npm test` (node:test on `lib/*.test.ts`, one file at a time; the store tests need
  the local PostgreSQL and its `triptogether_test` database)
- `sh scripts/seed.sh http://localhost:3000` fills a running dev server with demo users and trips

## Layout

- `app/api/` — route handlers. Their contract (paths, status codes, shapes, error messages) is `docs/api.md`.
  The frontend depends only on that contract, through `lib/api.ts`.
- `lib/db/schema.ts` — every table; `npm run db:generate` turns a change into a migration in `drizzle/`, which the
  app applies on the first request. `lib/db/client.ts` is the pool; `lib/db/test-db.ts` sets up the store tests.
- `lib/store.ts` — trips, members and the itinerary. `lib/auth.ts` — Better Auth, called from `app/api/auth/*`.
- Travel Bingo: `lib/bingo.ts` (the rules, pure), `lib/bingo-store.ts` (task library, review queue, cards),
  `app/api/bingo/**`, `app/api/trips/[id]/bingo/**`, `app/trips/bingo/**`, `app/trips/[id]/bingo`,
  `components/bingo/**`. Admins are the emails in `ADMIN_EMAILS`; roles are in `docs/roles.md`.
- `lib/validate.ts` — trip and plan-item input validation, shared by every write.
- `lib/itinerary.ts` — groups plan items into the trip's days (pure, tested).
- `app/login`, `app/register`, `app/trips/**` — client-component pages. `app/trips/layout.tsx` checks the session
  and redirects to `/login`.

## Design

A road atlas: contour-map paper (`public/contours.svg`), roads with a dashed yellow centre line, US highway
guide signs. Each trip is a green guide sign (`components/TripSign.tsx`) with its invite code on a tab like an
exit number, hung off a road on the trips list. The itinerary (`components/Itinerary.tsx`) is a road with a
mile-marker post per day. Font Overpass. The palette is the `@theme` block in `app/globals.css`, and it replaces Tailwind's default colours,
so use `text-muted`, `bg-green`, `border-line` and so on. Breakpoints are `sm` 600px and `md` 860px, used
desktop-first as `max-sm:` and `max-md:`. For a font size, write `text-[18px]`, not `text-lg`: the scale classes
also set a line-height. Signs and roads are the loud
elements; keep the rest quiet. UI copy is English, sentence case.

## Next 16 gotchas met so far

- A client page using `useParams()` needs a Suspense boundary: `app/trips/[id]/loading.tsx` provides it.
- A layout must not return `null` while loading (instant-navigation validation drops the page segment).
