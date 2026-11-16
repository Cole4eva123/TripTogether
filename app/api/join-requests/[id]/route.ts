import { publicRequest } from "@/lib/lobby-privacy";
import { withLobbyBackend } from "@/lib/lobby-backend";
import { canAnswer, isParty, requestFor, respondToRequest, withdrawRequest } from "@/lib/match-db";
import { currentUser, fail, needLogin, readJson } from "@/lib/server";
/**
 * One request to join a trip: whether it is still open, who asked, and what they said.
 */
async function handleGET(_req: Request, ctx: RouteContext<"/api/join-requests/[id]">) {
    const me = await (await currentUser());
    if (!me)
        return needLogin();
    const request = (await requestFor((await ctx.params).id, me.id));
    if (!request)
        return fail(404, "That request doesn't exist, or you're not part of it.");
    return Response.json({ request: publicRequest(request) });
}
async function handlePATCH(req: Request, ctx: RouteContext<"/api/join-requests/[id]">) {
    const me = await (await currentUser());
    if (!me)
        return needLogin();
    const id = (await ctx.params).id;
    const body = await (await readJson(req));
    const action = body.action;
    if (action !== "accept" && action !== "decline" && action !== "withdraw") {
        return fail(400, "Say whether you're accepting, declining, or taking the request back.");
    }
    // Taking back a request is the applicant's move: the request is theirs.
    if (action === "withdraw") {
        const request = (await withdrawRequest(id, me.id));
        if (!request) {
            const found = (await requestFor(id, me.id));
            if (!found)
                return fail(404, "That request doesn't exist, or you're not part of it.");
            if (found.applicantId !== me.id) return fail(403, "Only the person who asked can take the request back.");
            return fail(409, "This request was already answered.");
        }
        return Response.json({ request: publicRequest(request) });
    }
    // Answering is the group's move: everybody in the trip is an owner of it, so any of them may decide who
    // travels with them. The person who asked can't answer their own request.
    const request = (await respondToRequest(id, me.id, action));
    if (!request) {
        const found = (await requestFor(id, me.id));
        if (!found)
            return fail(404, "That request doesn't exist, or you're not part of it.");
        if (!(await isParty(found, me.id))) {
            return fail(403, "Only somebody in the trip can answer this request.");
        }
        if (!(await canAnswer(found, me.id))) {
            return fail(403, "You asked to join this trip, so you can't answer your own request.");
        }
        return fail(409, "This request was already answered.");
    }
    return Response.json({ request: publicRequest(request) });
}

export const GET = withLobbyBackend(handleGET);
export const PATCH = withLobbyBackend(handlePATCH);
