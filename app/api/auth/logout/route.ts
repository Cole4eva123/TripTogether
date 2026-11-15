import { cookies, headers } from "next/headers";
import { auth } from "@/lib/auth";
import { ready } from "@/lib/db/client";
import { noContent, SESSION_COOKIE } from "@/lib/server";

export async function POST() {
  await ready();
  // Ends the session in the database and clears Better Auth's cookie. Logging out twice is fine.
  await auth.api.signOut({ headers: await headers() }).catch(() => {});
  (await cookies()).delete(SESSION_COOKIE); // the mock store's old cookie, if a browser still has one
  return noContent();
}
