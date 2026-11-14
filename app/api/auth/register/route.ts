import { createUser, startSession } from "@/lib/mock-db";
import { fail, readJson, setSession } from "@/lib/server";

export async function POST(req: Request) {
  const { name, email, password } = await readJson(req);
  if (typeof name !== "string" || !name.trim()) return fail(400, "Enter your name.");
  if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email.trim()))
    return fail(400, "Enter a valid email address.");
  if (typeof password !== "string" || password.length < 8)
    return fail(400, "Use a password with at least 8 characters.");

  const user = createUser(name.trim(), email.trim().toLowerCase(), password);
  if (!user) return fail(409, "An account with this email already exists. Log in instead.");
  await setSession(startSession(user.id));
  return Response.json({ user }, { status: 201 });
}
