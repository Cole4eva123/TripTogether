// Accounts, passwords and sessions, through Better Auth on the same database. The app doesn't mount Better Auth's
// own endpoints: the routes under app/api/auth keep the contract in docs/database.md and call `auth.api.*` here.
// Passwords are stored hashed (accounts.password); the session is Better Auth's signed, httpOnly cookie.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db/client";
import * as schema from "./db/schema";

type Auth = ReturnType<typeof create>;
const g = globalThis as { __tripAuth?: Auth };

function create() {
  return betterAuth({
    // Set BETTER_AUTH_SECRET in .env.local (see .env.example); Better Auth falls back to a dev-only secret.
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
    emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
    plugins: [nextCookies()], // lets auth.api calls in route handlers set and clear the cookie
  });
}

/** Better Auth, created on first use so that merely loading a route module doesn't open the database. */
export const auth: Auth = new Proxy({} as Auth, {
  get: (_target, prop) => Reflect.get((g.__tripAuth ??= create()), prop),
});

/** The emails in ADMIN_EMAILS (comma separated). Admins review the tasks people send in for Travel Bingo. */
export const isAdmin = (email: string) =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
