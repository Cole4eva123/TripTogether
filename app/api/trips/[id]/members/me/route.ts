import { leaveTrip, tripFor } from "@/lib/mock-db";
import { currentUser, fail, needLogin, noContent, tripNotFound } from "@/lib/server";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/trips/[id]/members/me">) {
  const me = await currentUser();
  if (!me) return needLogin();
  const { id } = await ctx.params;
  const found = tripFor(id, me.id);
  if (!found) return tripNotFound();
  if (found.trip.ownerId === me.id)
    return fail(409, "Organizers can't leave their own trip. Delete the trip instead.");
  leaveTrip(id, me.id);
  return noContent();
}
