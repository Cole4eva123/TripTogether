import { joinTrip } from "@/lib/mock-db";
import { currentUser, fail, needLogin, readJson } from "@/lib/server";

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return needLogin();
  const { code } = await readJson(req);
  const trip = typeof code === "string" ? joinTrip(code.trim().toUpperCase(), me.id) : null;
  if (!trip) return fail(404, "No trip uses that code. Check it with whoever shared it.");
  return Response.json({ trip });
}
