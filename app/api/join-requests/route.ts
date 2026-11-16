import { publicRequest } from "@/lib/lobby-privacy";
import { withLobbyBackend } from "@/lib/lobby-backend";
import { createJoinRequest, lobbyFor } from "@/lib/match-db";
import { currentUser, fail, needLogin, readJson } from "@/lib/server";
import { parseJoinRequestInput } from "@/lib/validate";
/**
 * Asks to join a trip that is in the shared lobby.
 *
 * The lobby carries the list of requests, so there is no endpoint that only returns them: a page that wants
 * the requests already has the lobby, and a second way to fetch them would be a second thing to keep right.
 */
async function handlePOST(req: Request) {
    const me = await (await currentUser());
    if (!me)
        return needLogin();
    const input = parseJoinRequestInput(await (await readJson(req)));
    if (typeof input === "string")
        return fail(400, input);
    const request = (await createJoinRequest(me.id, input.postId, input.message));
    if (!request) {
        const lobby = (await lobbyFor(me.id));
        const post = [...lobby.others, ...lobby.mine].find((p) => p.id === input.postId);
        if (!post)
            return fail(404, "That trip isn't in the lobby.");
        // You're already in it.
        if (post.mine)
            return fail(400, "You're already in this trip.");
        // A trip that is over can't be joined.
        if (post.ended)
            return fail(409, "That trip is already over.");
        // One request at a time: the one that's still open is the one to answer.
        if (post.myRequest?.status === "pending") {
            return fail(409, "You've already asked to join this trip. Wait for an answer.");
        }
        return fail(400, "You can't ask to join this trip.");
    }
    return Response.json({ request: publicRequest(request) }, { status: 201 });
}

export const POST = withLobbyBackend(handlePOST);
