import { lobbyAnswer } from "@/lib/lobby-api";
import { unpublishPost } from "@/lib/lobby-store";
import { noContent } from "@/lib/server";

/** The trip's organizer takes it out of the lobby; the requests still waiting close. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/lobby/[tripId]">) {
  return lobbyAnswer(async (me) => {
    await unpublishPost(me.id, (await ctx.params).tripId);
    return noContent();
  });
}
