import { validLobbyDate } from "@/lib/lobby-dates";
import { publicLobby, publicPost } from "@/lib/lobby-privacy";
import { withLobbyBackend } from "@/lib/lobby-backend";
import { lobbyFor, publishPost } from "@/lib/match-db";
import { currentUser, fail, needLogin, readJson } from "@/lib/server";
import { parsePublishInput } from "@/lib/validate";
import type { LobbyFilters } from "@/lib/types";
/**
 * The lobby as the reader sees it: their own groups' trips, the other groups' trips, and the requests
 * about the trips they are in.
 *
 * `?against=` names which of the reader's own trips the comparison is made against, by its trip id. The
 * reader picks it in the page, and the scores on the cards follow that pick. It can be a trip the reader
 * joined as well as one they published. Without it the best of the reader's trips is used, which is what the
 * comparison itself does.
 *
 * `?q=` is what the reader searched for, `?from=` and `?to=` are the window of dates they want, and `?sort=`
 * is the order they want. The search reads the gazetteer, so it happens here too: the browser gets the trips
 * that answer, not the gazetteer.
 */
async function handleGET(req: Request) {
    const me = await (await currentUser());
    if (!me)
        return needLogin();
    const params = new URL(req.url).searchParams;
    const against = params.get("against") || undefined;
    const query = params.get("q") ?? "";
    const filters: Partial<LobbyFilters> = {
        from: params.get("from") ?? "",
        to: params.get("to") ?? "",
        sort: parseSort(params.get("sort")),
    };
    if (filters.from && !validLobbyDate(filters.from) || filters.to && !validLobbyDate(filters.to) || filters.from && filters.to && filters.from > filters.to) return fail(400, "Choose valid dates, with the end on or after the start.");
    return Response.json(publicLobby(await lobbyFor(me.id, against, query, filters)));
}
/** The order the lobby can be shown in. An order nobody asked for falls back to the closest first. */
function parseSort(value: string | null): LobbyFilters["sort"] {
    return value === "soonest" || value === "soonest-end" ? value : "closest";
}
async function handlePOST(req: Request) {
    const me = await (await currentUser());
    if (!me)
        return needLogin();
    const input = parsePublishInput(await (await readJson(req)));
    if (typeof input === "string")
        return fail(400, input);
    const post = (await publishPost(me.id, input.tripId, input.note));
    if (!post) {
        const already = (await lobbyFor(me.id)).mine.some((p) => p.tripId === input.tripId);
        return fail(already ? 409 : 404, already ? "That trip is already in the lobby." : "That trip isn't yours, or it's gone.");
    }
    return Response.json({ post: publicPost(post) }, { status: 201 });
}

export const GET = withLobbyBackend(handleGET);
export const POST = withLobbyBackend(handlePOST);
