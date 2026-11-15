import { deleteItem, updateItem } from "@/lib/store";
import { fail, memberTrip, noContent, readJson } from "@/lib/server";
import { parsePlanInput } from "@/lib/validate";

const itemGone = () => fail(404, "This plan was already removed.");

export async function PATCH(req: Request, ctx: RouteContext<"/api/trips/[id]/items/[itemId]">) {
  const { id, itemId } = await ctx.params;
  const m = await memberTrip(id);
  if (m instanceof Response) return m;
  const input = parsePlanInput(await readJson(req), m.trip);
  if (typeof input === "string") return fail(400, input);
  const item = await updateItem(id, itemId, input);
  return item ? Response.json({ item }) : itemGone();
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/trips/[id]/items/[itemId]">) {
  const { id, itemId } = await ctx.params;
  const m = await memberTrip(id);
  if (m instanceof Response) return m;
  return await deleteItem(id, itemId) ? noContent() : itemGone();
}
