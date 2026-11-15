import { parseCardInput, regionFor } from "@/lib/bingo";
import { bingoAnswer } from "@/lib/bingo-api";
import { cardFor, createCard, regions } from "@/lib/bingo-store";
import { fail, memberTrip, readJson } from "@/lib/server";

/** The trip's card (null before one is drawn), the regions to draw from, and the one its destination is in. */
export async function GET(_req: Request, ctx: RouteContext<"/api/trips/[id]/bingo">) {
  const m = await memberTrip((await ctx.params).id);
  if (m instanceof Response) return m;
  const [card, all] = await Promise.all([cardFor(m.trip.id), regions()]);
  const suggestedRegion = regionFor(m.trip.destination, all.map((r) => r.region));
  return Response.json({ card, regions: all, suggestedRegion });
}

/** Draws a card from a region's tasks, replacing the trip's current card. Any member may. */
export async function POST(req: Request, ctx: RouteContext<"/api/trips/[id]/bingo">) {
  const m = await memberTrip((await ctx.params).id);
  if (m instanceof Response) return m;
  const input = parseCardInput(await readJson(req));
  if (typeof input === "string") return fail(400, input);
  return bingoAnswer(async () =>
    Response.json({ card: await createCard(m.trip.id, m.me.id, input.region, input.size) }, { status: 201 }),
  );
}
