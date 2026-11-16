import { parseTaskInput } from "@/lib/bingo";
import { bingoAnswer, currentAdmin } from "@/lib/bingo-api";
import { editTask, removeTask } from "@/lib/bingo-store";
import { fail, readJson } from "@/lib/server";

/** Rewrites a task in the library: its region, title and description. Admins only. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/bingo/tasks/[taskId]">) {
  const admin = await currentAdmin("Only admins can change the library.");
  if (admin instanceof Response) return admin;
  const input = parseTaskInput(await readJson(req));
  if (typeof input === "string") return fail(400, input);
  const { taskId } = await ctx.params;
  return bingoAnswer(async () => Response.json({ task: await editTask(taskId, input) }));
}

/** Takes a task out of the library. Cards that already have it keep it. Admins only. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/bingo/tasks/[taskId]">) {
  const admin = await currentAdmin("Only admins can change the library.");
  if (admin instanceof Response) return admin;
  const { taskId } = await ctx.params;
  return bingoAnswer(async () => {
    await removeTask(taskId, admin.id);
    return new Response(null, { status: 204 });
  });
}
