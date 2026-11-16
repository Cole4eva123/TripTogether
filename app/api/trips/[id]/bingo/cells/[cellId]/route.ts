import { isAdmin } from "@/lib/auth";
import { bingoAnswer } from "@/lib/bingo-api";
import { markCell } from "@/lib/bingo-store";
import { fail, memberTrip, readJson } from "@/lib/server";

/**
 * Checks a square off, or takes the check back. Any member may check a square off; only the member who did, or an
 * admin, may undo it.
 */
export async function PATCH(req: Request, ctx: RouteContext<"/api/trips/[id]/bingo/cells/[cellId]">) {
  const { id, cellId } = await ctx.params;
  const m = await memberTrip(id);
  if (m instanceof Response) return m;
  const { action } = await readJson(req);
  if (action !== "complete" && action !== "undo") return fail(400, "Say whether you're checking the square off or undoing it.");
  const actor = { id: m.me.id, admin: isAdmin(m.me.email) };
  return bingoAnswer(async () => Response.json({ card: await markCell(m.trip.id, cellId, actor, action === "complete") }));
}
