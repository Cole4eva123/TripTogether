// What the store tests share: they run against the PostgreSQL test database (TEST_DATABASE_URL, by default the
// `triptogether_test` database of the local server in docs/backend.md), emptied and migrated afresh per test file.
// `npm test` runs the files one at a time, so they don't empty the database under each other.
import { after } from "node:test";
import { sql } from "drizzle-orm";

const url = process.env.TEST_DATABASE_URL ?? "postgres://triptogether:triptogether@localhost:5432/triptogether_test";
// Emptying the database drops every table, so refuse anything that isn't plainly a test database.
if (!new URL(url).pathname.endsWith("_test")) throw new Error(`TEST_DATABASE_URL must name a *_test database, not ${url}`);
process.env.DATABASE_URL = url;

const { closeDb, db, ready } = await import("./client.ts");
after(closeDb); // registered at the top of the file, so it runs once every test in it is done

/** Drops everything in the test database, and applies the migrations. */
export async function freshDatabase() {
  await db.execute(sql.raw("drop schema if exists drizzle cascade; drop schema public cascade; create schema public;"));
  await ready();
  return db;
}
