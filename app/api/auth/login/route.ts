import { headers } from "next/headers";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { ready } from "@/lib/db/client";
import { fail, readJson } from "@/lib/server";

const noMatch = () => fail(401, "That email and password don't match an account.");

export async function POST(req: Request) {
  const { email, password } = await readJson(req);
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) return noMatch();
  await ready();
  try {
    const { user } = await auth.api.signInEmail({
      body: { email: email.trim().toLowerCase(), password },
      headers: await headers(),
    });
    return Response.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (e) {
    // Better Auth answers a wrong password, an unknown email and a malformed email all as a client error.
    if (e instanceof APIError && e.statusCode >= 400 && e.statusCode < 500) return noMatch();
    throw e;
  }
}
