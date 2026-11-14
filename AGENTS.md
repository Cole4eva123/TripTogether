<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# TripTogether

Next.js 16 (App Router, React 19, TypeScript, plain CSS in `app/globals.css`). Product scope: `README.md`.

## Commands

- `npm run dev` (port 3000), `npm run lint`, `npm run typecheck`, `npm test` (node:test on `lib/*.test.ts`)
- `sh scripts/seed.sh http://localhost:3000` fills a running dev server with demo users and trips

## Layout

- `app/api/` — route handlers. Their contract (paths, status codes, shapes, error messages) is `docs/api.md`.
  The frontend depends only on that contract, through `lib/api.ts`.
- `lib/mock-db.ts` — in-memory store behind the route handlers, standing in for the real backend. Replace it with
  a database; keep the contract.
- `lib/validate.ts` — trip and plan-item input validation, shared by every write.
- `lib/itinerary.ts` — groups plan items into the trip's days (pure, tested).
- `app/login`, `app/register`, `app/trips/**` — client-component pages. `app/trips/layout.tsx` checks the session
  and redirects to `/login`.

## Design

A road atlas: contour-map paper (`public/contours.svg`), roads with a dashed yellow centre line, US highway
guide signs. Each trip is a green guide sign (`components/TripSign.tsx`) with its invite code on a tab like an
exit number, hung off a road on the trips list. The itinerary (`components/Itinerary.tsx`) is a road with a
mile-marker post per day. Font Overpass. Tokens at the top of `app/globals.css`. Signs and roads are the loud
elements; keep the rest quiet. UI copy is English, sentence case.

## Next 16 gotchas met so far

- A client page using `useParams()` needs a Suspense boundary: `app/trips/[id]/loading.tsx` provides it.
- A layout must not return `null` while loading (instant-navigation validation drops the page segment).
