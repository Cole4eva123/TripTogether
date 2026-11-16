import { validLobbyDate } from "@/lib/lobby-dates";
import { lobbyAnswer } from "@/lib/lobby-api";
import { lobbyFor, publishPost } from "@/lib/lobby-store";
import { fail, readJson } from "@/lib/server";
import type { LobbyFilters } from "@/lib/types";
import { parsePublishInput } from "@/lib/validate";

/**
 * The lobby as the reader sees it. `?against=` is which of their trips the others are compared with (by trip
 * id; the best match without it), `?q=` a search, `?from=`/`?to=` a window of dates, `?sort=` the order.
 */
export async function GET(req: Request) {
  return lobbyAnswer(async (me) => {
    const params = new URL(req.url).searchParams;
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? "";
    if ((from && !validLobbyDate(from)) || (to && !validLobbyDate(to)) || (from && to && from > to)) {
      return fail(400, "Choose valid dates, with the end on or after the start.");
    }
    const sort = params.get("sort");
    const filters: Partial<LobbyFilters> = { from, to, sort: sort === "soonest" || sort === "soonest-end" ? sort : "closest" };
    return Response.json(await lobbyFor(me.id, params.get("against") || undefined, params.get("q") ?? "", filters));
  });
}

/** The trip's organizer shares it in the lobby. */
export async function POST(req: Request) {
  return lobbyAnswer(async (me) => {
    const input = parsePublishInput(await readJson(req));
    if (typeof input === "string") return fail(400, input);
    return Response.json({ post: await publishPost(me.id, input.tripId, input.note) }, { status: 201 });
  });
}
