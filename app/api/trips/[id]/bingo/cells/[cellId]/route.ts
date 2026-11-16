import { isAdmin } from "@/lib/auth";
import { bingoAnswer } from "@/lib/bingo-api";
import { markCell, replaceCell } from "@/lib/bingo-store";
import { fail, memberTrip, readJson } from "@/lib/server";

/**
 * Checks a square off, takes the check back, or swaps its task. Any member may check a square off; a square
 * already checked off may be undone or swapped only by the member who did it, or by an admin.
 */
export async function PATCH(req: Request, ctx: RouteContext<"/api/trips/[id]/bingo/cells/[cellId]">) {
  const { id, cellId } = await ctx.params;
  const m = await memberTrip(id);
  if (m instanceof Response) return m;
  const { action, taskId } = await readJson(req);
  if (action !== "complete" && action !== "undo" && action !== "replace") {
    return fail(400, "Say whether you're checking the square off, undoing it, or swapping its task.");
  }
  if (taskId !== undefined && taskId !== null && typeof taskId !== "string") return fail(400, "Pick a task to swap in.");
  const actor = { id: m.me.id, admin: isAdmin(m.me.email) };
  return bingoAnswer(async () =>
    Response.json({
      card:
        action === "replace"
          ? await replaceCell(m.trip.id, cellId, actor, taskId || null)
          : await markCell(m.trip.id, cellId, actor, action === "complete"),
    }),
  );
}
