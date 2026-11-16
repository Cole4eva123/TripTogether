import { addTripMessage, messagesForTrip } from "@/lib/lobby-store";
import { fail, memberTrip, readJson } from "@/lib/server";
import { parseChatInput } from "@/lib/validate";

/** The trip's chat group: only its members read and write in it. */
export async function GET(_req: Request, ctx: RouteContext<"/api/trips/[id]/chat">) {
  const m = await memberTrip((await ctx.params).id);
  if (m instanceof Response) return m;
  return Response.json({ messages: await messagesForTrip(m.trip.id) });
}

export async function POST(req: Request, ctx: RouteContext<"/api/trips/[id]/chat">) {
  const m = await memberTrip((await ctx.params).id);
  if (m instanceof Response) return m;
  const input = parseChatInput(await readJson(req));
  if (typeof input === "string") return fail(400, input);
  return Response.json({ message: await addTripMessage(m.trip.id, m.me.id, input.body) }, { status: 201 });
}
