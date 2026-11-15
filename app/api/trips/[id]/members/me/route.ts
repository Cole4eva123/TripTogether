import { leaveTrip } from "@/lib/store";
import { fail, memberTrip, noContent } from "@/lib/server";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/trips/[id]/members/me">) {
  const m = await memberTrip((await ctx.params).id);
  if (m instanceof Response) return m;
  if (m.trip.ownerId === m.me.id)
    return fail(409, "Organizers can't leave their own trip. Delete the trip instead.");
  await leaveTrip(m.trip.id, m.me.id);
  return noContent();
}
