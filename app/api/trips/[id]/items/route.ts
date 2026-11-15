import { addItem } from "@/lib/store";
import { fail, memberTrip, readJson } from "@/lib/server";
import { parsePlanInput } from "@/lib/validate";

export async function POST(req: Request, ctx: RouteContext<"/api/trips/[id]/items">) {
  const m = await memberTrip((await ctx.params).id);
  if (m instanceof Response) return m;
  const input = parsePlanInput(await readJson(req), m.trip);
  if (typeof input === "string") return fail(400, input);
  return Response.json({ item: await addItem(m.trip.id, m.me.id, input) }, { status: 201 });
}
