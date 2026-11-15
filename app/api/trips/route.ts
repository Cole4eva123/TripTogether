import { createTrip, tripsFor } from "@/lib/store";
import { currentUser, fail, needLogin, readJson } from "@/lib/server";
import { parseTripInput } from "@/lib/validate";

export async function GET() {
  const me = await currentUser();
  if (!me) return needLogin();
  return Response.json({ trips: await tripsFor(me.id) });
}

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return needLogin();
  const input = parseTripInput(await readJson(req));
  if (typeof input === "string") return fail(400, input);
  return Response.json({ trip: await createTrip(me.id, input) }, { status: 201 });
}
