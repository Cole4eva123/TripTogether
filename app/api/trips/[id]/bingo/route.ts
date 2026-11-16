import { isAdmin } from "@/lib/auth";
import { regionFor } from "@/lib/bingo";
import { bingoAnswer } from "@/lib/bingo-api";
import { cardFor, challenges, chooseChallenge } from "@/lib/bingo-store";
import { fail, memberTrip, readJson } from "@/lib/server";

/**
 * The trip's card (null before it takes a challenge on), the challenges on offer, the region of its destination
 * among them, and who is asking (so the page offers Undo and switching only where they're allowed).
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/trips/[id]/bingo">) {
  const m = await memberTrip((await ctx.params).id);
  if (m instanceof Response) return m;
  const [card, all] = await Promise.all([cardFor(m.trip.id), challenges()]);
  const suggestedRegion = regionFor(m.trip.destination, [...new Set(all.map((c) => c.region))]);
  const admin = isAdmin(m.me.email);
  return Response.json({
    card,
    challenges: all,
    suggestedRegion,
    viewer: { id: m.me.id, admin, maySwitch: admin || m.trip.ownerId === m.me.id },
  });
}

/** Takes a challenge on. Any member picks the first; only the organizer or an admin switches to another. */
export async function POST(req: Request, ctx: RouteContext<"/api/trips/[id]/bingo">) {
  const m = await memberTrip((await ctx.params).id);
  if (m instanceof Response) return m;
  const { challengeId } = await readJson(req);
  if (typeof challengeId !== "string" || !challengeId) return fail(400, "Pick a challenge to take on.");
  const maySwitch = isAdmin(m.me.email) || m.trip.ownerId === m.me.id;
  return bingoAnswer(async () => Response.json({ card: await chooseChallenge(m.trip.id, m.me.id, challengeId, maySwitch) }, { status: 201 }));
}
