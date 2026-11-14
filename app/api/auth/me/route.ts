import { currentUser, needLogin } from "@/lib/server";

export async function GET() {
  const user = await currentUser();
  return user ? Response.json({ user }) : needLogin();
}
