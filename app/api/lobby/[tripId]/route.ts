import { publicPost } from "@/lib/lobby-privacy";
import { withLobbyBackend } from "@/lib/lobby-backend";
import { refreshPost, unpublishPost } from "@/lib/match-db";
import { currentUser, fail, needLogin } from "@/lib/server";
/**
 * Refreshes a post from the trip it speaks for. A group that changed its plan can say so here, rather than
 * taking the post down and publishing it again, which would throw away the requests it already has.
 */
async function handlePATCH(_req: Request, ctx: RouteContext<"/api/lobby/[tripId]">) {
    const me = await (await currentUser());
    if (!me)
        return needLogin();
    const tripId = (await ctx.params).tripId;
    const post = (await refreshPost(me.id, tripId));
    if (!post)
        return fail(404, "That trip isn't in the lobby, or it isn't yours to update.");
    return Response.json({ post: publicPost(post) });
}
/** Takes a trip off the lobby. The requests waiting on it are turned down. */
async function handleDELETE(_req: Request, ctx: RouteContext<"/api/lobby/[tripId]">) {
    const me = await (await currentUser());
    if (!me)
        return needLogin();
    const tripId = (await ctx.params).tripId;
    if (!(await unpublishPost(me.id, tripId))) {
        return fail(404, "That trip isn't in the lobby, or it isn't yours to take down.");
    }
    return new Response(null, { status: 204 });
}

export const PATCH = withLobbyBackend(handlePATCH);
export const DELETE = withLobbyBackend(handleDELETE);
