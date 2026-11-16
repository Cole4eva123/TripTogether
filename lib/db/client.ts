// The database connection: the PostgreSQL server in DATABASE_URL (postgres://…), e.g. the one started with
// Apple's `container` CLI (docs/backend.md). There is no fallback: without DATABASE_URL the first query fails.
//
// The pool opens on the first query, never on import, so `next build` and the worker processes `next dev` loads
// route modules in don't need a database.
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "./schema.ts";

type PgDb = ReturnType<typeof drizzle<typeof schema>>;
type Conn = { db: PgDb; pool: Pool; ready?: Promise<void> };

function connect(): Conn {
  const url = process.env.DATABASE_URL ?? "";
  if (!/^postgres(ql)?:\/\//.test(url)) {
    throw new Error("Set DATABASE_URL to a PostgreSQL server (postgres://…) in .env.local. See docs/backend.md.");
  }
  const pool = new Pool({ connectionString: url });
  return { db: drizzle(pool, { schema }), pool };
}

// On globalThis so a dev-server hot reload reuses the pool instead of opening another one.
const g = globalThis as { __tripDb?: Conn };
const conn = () => (g.__tripDb ??= connect());

/** The database. A stand-in until first use, when the real connection opens (see the note at the top). */
export const db: PgDb = new Proxy({} as PgDb, {
  get(_target, prop) {
    const real = conn().db;
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
  has: (_target, prop) => prop in conn().db,
});
export type Db = PgDb;

/** Resolves once the tables are up to date. Every store function awaits it before its first query. */
export function ready(): Promise<void> {
  const c = conn();
  c.ready ??= migrate(c.db, { migrationsFolder: path.join(process.cwd(), "drizzle") }).catch((e) => {
    c.ready = undefined; // let the next request try again instead of failing forever
    throw e;
  });
  return c.ready;
}

/** Closes the pool, so a test process can exit. */
export const closeDb = () => g.__tripDb?.pool.end();

/** True when a query failed on a unique constraint: someone else wrote the same row first. */
export const isUniqueViolation = (e: unknown) => (e as { cause?: { code?: string } })?.cause?.code === "23505";
