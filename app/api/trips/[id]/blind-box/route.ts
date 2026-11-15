import { addItem } from "@/lib/mock-db";
import { blindBoxFor, BlindBoxError, changeBlindBox, resetBlindBox, startBlindBox } from "@/lib/blind-box-store";
import { fail, memberTrip, readJson } from "@/lib/server";

export async function GET(_req: Request, ctx: RouteContext<"/api/trips/[id]/blind-box">) {
  const m = await memberTrip((await ctx.params).id);
  if (m instanceof Response) return m;
  return Response.json({ box: blindBoxFor(m) }, { headers: { "Cache-Control": "private, no-store" } });
}

async function write(req: Request, ctx: RouteContext<"/api/trips/[id]/blind-box">) {
  const m = await memberTrip((await ctx.params).id);
  if (m instanceof Response) return m;
  const body = await readJson(req);
  try {
    if (req.method === "POST") startBlindBox(m, body);
    else if (req.method === "DELETE") resetBlindBox(m, body.roundId);
    else changeBlindBox(m, body, (plans) => { for (const plan of plans) addItem(m.trip.id, m.me.id, plan); });
    return Response.json({ box: blindBoxFor(m) }, { status: req.method === "POST" ? 201 : 200, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof BlindBoxError) return fail(error.status, error.message);
    throw error;
  }
}

export const POST = write;
export const PATCH = write;
export const DELETE = write;
