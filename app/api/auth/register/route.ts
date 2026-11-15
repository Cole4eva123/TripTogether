import { headers } from "next/headers";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { ready } from "@/lib/db/client";
import { fail, readJson } from "@/lib/server";

export async function POST(req: Request) {
  const { name, email, password } = await readJson(req);
  if (typeof name !== "string" || !name.trim()) return fail(400, "Enter your name.");
  if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email.trim()))
    return fail(400, "Enter a valid email address.");
  if (typeof password !== "string" || password.length < 8)
    return fail(400, "Use a password with at least 8 characters.");

  await ready();
  try {
    // Better Auth hashes the password, creates the user and signs them in (the cookie is set by nextCookies).
    const { user } = await auth.api.signUpEmail({
      body: { name: name.trim(), email: email.trim().toLowerCase(), password },
      headers: await headers(),
    });
    return Response.json({ user: { id: user.id, name: user.name, email: user.email } }, { status: 201 });
  } catch (e) {
    if (e instanceof APIError && e.body?.code?.startsWith("USER_ALREADY_EXISTS"))
      return fail(409, "An account with this email already exists. Log in instead.");
    throw e;
  }
}
