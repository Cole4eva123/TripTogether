// Helpers for the route handlers in app/api.
import { cookies, headers } from "next/headers";
import { auth } from "./auth";
import { ready } from "./db/client";
import { tripFor } from "./store";

/** The name of the mock store's session cookie. Better Auth now names and signs its own cookie. */
export const SESSION_COOKIE = "tt_session";

export const fail = (status: number, error: string) => Response.json({ error }, { status });

export const needLogin = () => fail(401, "Log in to continue.");

export const noContent = () => new Response(null, { status: 204 });

export async function currentUser() {
  await ready();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email } = session.user;
  return { id, name, email };
}

/**
 * The logged-in user and the trip they're a member of, or the response to send instead: 401 when logged out,
 * 404 when the trip doesn't exist or they aren't a member (the two look the same, so ids can't be probed).
 */
export async function memberTrip(id: string) {
  const me = await currentUser();
  if (!me) return needLogin();
  const found = await tripFor(id, me.id);
  if (!found) return fail(404, "This trip doesn't exist, or you're not a member of it.");
  return { me, ...found };
}

export async function setSession(id: string) {
  (await cookies()).set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
}

/** The request's JSON body as an object; anything else (bad JSON, an array, a string) reads as {}. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}
