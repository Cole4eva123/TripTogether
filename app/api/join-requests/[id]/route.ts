import { lobbyAnswer } from "@/lib/lobby-api";
import { requestFor, respondToRequest, withdrawRequest } from "@/lib/lobby-store";
import { fail, readJson } from "@/lib/server";

/** One request, for the person who asked or a member of the trip. */
export async function GET(_req: Request, ctx: RouteContext<"/api/join-requests/[id]">) {
  return lobbyAnswer(async (me) => Response.json({ request: await requestFor((await ctx.params).id, me.id) }));
}

/** The organizer accepts or declines; the person who asked may withdraw. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/join-requests/[id]">) {
  return lobbyAnswer(async (me) => {
    const id = (await ctx.params).id;
    const { action } = await readJson(req);
    if (action === "withdraw") return Response.json({ request: await withdrawRequest(id, me.id) });
    if (action !== "accept" && action !== "decline") {
      return fail(400, "Say whether you're accepting, declining, or taking the request back.");
    }
    return Response.json({ request: await respondToRequest(id, me.id, action) });
  });
}
