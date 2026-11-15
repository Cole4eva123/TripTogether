import { deleteTrip, updateTrip } from "@/lib/store";
import { fail, memberTrip, noContent, readJson } from "@/lib/server";
import { parseTripInput } from "@/lib/validate";

export async function GET(_req: Request, ctx: RouteContext<"/api/trips/[id]">) {
  const m = await memberTrip((await ctx.params).id);
  if (m instanceof Response) return m;
  return Response.json({ trip: m.trip, members: m.members, items: m.items });
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/trips/[id]">) {
  const m = await memberTrip((await ctx.params).id);
  if (m instanceof Response) return m;
  if (m.trip.ownerId !== m.me.id) return fail(403, "Only the organizer can edit this trip.");
  const input = parseTripInput(await readJson(req));
  if (typeof input === "string") return fail(400, input);
  return Response.json({ trip: await updateTrip(m.trip.id, input) });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/trips/[id]">) {
  const m = await memberTrip((await ctx.params).id);
  if (m instanceof Response) return m;
  if (m.trip.ownerId !== m.me.id) return fail(403, "Only the organizer can delete this trip.");
  await deleteTrip(m.trip.id);
  return noContent();
}
