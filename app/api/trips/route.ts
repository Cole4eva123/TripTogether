import { createTrip, tripsFor } from "@/lib/mock-db";
import { currentUser, fail, needLogin, readJson } from "@/lib/server";
import { parseTripInput } from "@/lib/validate";

export async function GET() {
  const me = await currentUser();
  if (!me) return needLogin();
  return Response.json({ trips: tripsFor(me.id) });
}

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return needLogin();
  const input = parseTripInput(await readJson(req));
  if (typeof input === "string") return fail(400, input);
  return Response.json({ trip: createTrip(me.id, input) }, { status: 201 });
}
