import { checkLogin, startSession } from "@/lib/mock-db";
import { fail, readJson, setSession } from "@/lib/server";

export async function POST(req: Request) {
  const { email, password } = await readJson(req);
  const user =
    typeof email === "string" && typeof password === "string"
      ? checkLogin(email.trim().toLowerCase(), password)
      : null;
  if (!user) return fail(401, "That email and password don't match an account.");
  await setSession(startSession(user.id));
  return Response.json({ user });
}
