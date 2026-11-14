import { cookies } from "next/headers";
import { endSession } from "@/lib/mock-db";
import { noContent, SESSION_COOKIE } from "@/lib/server";

export async function POST() {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) endSession(id);
  jar.delete(SESSION_COOKIE);
  return noContent();
}
