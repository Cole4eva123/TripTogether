import { bingoAnswer, currentAdmin } from "@/lib/bingo-api";
import { reviewTask } from "@/lib/bingo-store";
import { fail, readJson } from "@/lib/server";

/** Approves a pending task into the library, or turns it down with an optional note. Admins only. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/bingo/review/[taskId]">) {
  const admin = await currentAdmin();
  if (admin instanceof Response) return admin;
  const { action, note } = await readJson(req);
  if (action !== "approve" && action !== "reject") return fail(400, "Say whether you're approving or rejecting it.");
  const why = typeof note === "string" ? note.trim() : "";
  if (why.length > 300) return fail(400, "Keep the note under 300 characters.");
  const { taskId } = await ctx.params;
  return bingoAnswer(async () => Response.json({ task: await reviewTask(taskId, admin.id, action, why) }));
}
