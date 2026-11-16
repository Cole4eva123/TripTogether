import { bingoAnswer, currentAdmin } from "@/lib/bingo-api";
import { withdrawChallenge } from "@/lib/bingo-store";

/** Takes a challenge off offer. Groups already playing it keep their cards. Admins only. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/bingo/challenges/[challengeId]">) {
  const admin = await currentAdmin("Only admins can withdraw challenges.");
  if (admin instanceof Response) return admin;
  const { challengeId } = await ctx.params;
  return bingoAnswer(async () => {
    await withdrawChallenge(challengeId);
    return new Response(null, { status: 204 });
  });
}
