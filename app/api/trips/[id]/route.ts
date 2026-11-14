import { deleteTrip, tripFor, updateTrip } from "@/lib/mock-db";
import { currentUser, fail, needLogin, noContent, tripNotFound, readJson } from "@/lib/server";
import { parseTripInput } from "@/lib/validate";

export async function GET(_req: Request, ctx: RouteContext<"/api/trips/[id]">) {
  const me = await currentUser();
  if (!me) return needLogin();
  const found = tripFor((await ctx.params).id, me.id);
  return found ? Response.json(found) : tripNotFound();
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/trips/[id]">) {
  const me = await currentUser();
  if (!me) return needLogin();
  const { id } = await ctx.params;
  const found = tripFor(id, me.id);
  if (!found) return tripNotFound();
  if (found.trip.ownerId !== me.id) return fail(403, "Only the organizer can edit this trip.");
  const input = parseTripInput(await readJson(req));
  if (typeof input === "string") return fail(400, input);
  return Response.json({ trip: updateTrip(id, input) });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/trips/[id]">) {
  const me = await currentUser();
  if (!me) return needLogin();
  const { id } = await ctx.params;
  const found = tripFor(id, me.id);
  if (!found) return tripNotFound();
  if (found.trip.ownerId !== me.id) return fail(403, "Only the organizer can delete this trip.");
  deleteTrip(id);
  return noContent();
}
