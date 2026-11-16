import { isAdmin } from "@/lib/auth";
import { parseCardInput, regionFor } from "@/lib/bingo";
import { bingoAnswer } from "@/lib/bingo-api";
import { cardFor, createCard, regions } from "@/lib/bingo-store";
import { fail, memberTrip, readJson } from "@/lib/server";

/**
 * The trip's card (null before one is drawn), the regions to draw from, the one its destination is in, and who
 * is asking (so the page offers Undo and redrawing only where they're allowed).
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/trips/[id]/bingo">) {
  const m = await memberTrip((await ctx.params).id);
  if (m instanceof Response) return m;
  const [card, all] = await Promise.all([cardFor(m.trip.id), regions()]);
  const suggestedRegion = regionFor(m.trip.destination, all.map((r) => r.region));
  const admin = isAdmin(m.me.email);
  return Response.json({
    card,
    regions: all,
    suggestedRegion,
    viewer: { id: m.me.id, admin, mayRedraw: admin || m.trip.ownerId === m.me.id },
  });
}

/** Draws a card from a region's tasks. Any member draws the first; only the creator or an admin replaces one. */
export async function POST(req: Request, ctx: RouteContext<"/api/trips/[id]/bingo">) {
  const m = await memberTrip((await ctx.params).id);
  if (m instanceof Response) return m;
  const input = parseCardInput(await readJson(req));
  if (typeof input === "string") return fail(400, input);
  return bingoAnswer(async () =>
    Response.json({ card: await createCard(m.trip.id, m.me.id, input.region, input.size, isAdmin(m.me.email) || m.trip.ownerId === m.me.id) }, { status: 201 }),
  );
}
