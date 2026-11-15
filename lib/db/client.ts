// The database connection. With DATABASE_URL set (postgres://…), the app talks to that PostgreSQL server,
// e.g. the one in docker-compose.yml. Without it, it runs PGlite: the same PostgreSQL, compiled to WebAssembly
// and running inside the Node process, keeping its files in .data/pglite, so nothing has to be installed.
// DATABASE_URL=memory:// gives a throwaway in-memory PGlite, which the tests use.
//
// PGlite lets only one process at a time open its folder. `next dev` loads route modules in short-lived worker
// processes too (to read their config), so the connection opens on the first query, never on import: a module
// that is only loaded never touches the folder.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzleLite } from "drizzle-orm/pglite";
import { migrate as migrateLite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import * as schema from "./schema.ts";

type PgDb = ReturnType<typeof drizzlePg<typeof schema>>;
type Conn = { db: PgDb; migrate: () => Promise<void>; ready?: Promise<void> };

function connect(): Conn {
  const url = process.env.DATABASE_URL ?? "";
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  if (/^postgres(ql)?:\/\//.test(url)) {
    const db = drizzlePg(new Pool({ connectionString: url }), { schema });
    return { db, migrate: () => migratePg(db, { migrationsFolder }) };
  }
  let client: PGlite;
  if (url === "memory://") client = new PGlite();
  else {
    const dir = path.join(process.cwd(), ".data", "pglite");
    mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  const db = drizzleLite(client, { schema });
  // Both drivers expose the same query builder; the app is written against the node-postgres type.
  return { db: db as unknown as PgDb, migrate: () => migrateLite(db, { migrationsFolder }) };
}

// On globalThis so a dev-server hot reload reuses the connection: two PGlite instances on one folder would
// corrupt it, and every reload would otherwise open another pool.
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
  c.ready ??= c.migrate().catch((e) => {
    c.ready = undefined; // let the next request try again instead of failing forever
    throw e;
  });
  return c.ready;
}
