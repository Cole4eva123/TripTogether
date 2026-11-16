import { withLobbyBackend } from "@/lib/lobby-backend";
import { addTripMessage, messagesForTrip } from "@/lib/match-db";
import { fail, memberTrip, readJson } from "@/lib/server";
import { parseChatInput } from "@/lib/validate";
/**
 * The chat group of a trip. Every member of the trip is in it, and only they may read or write in it.
 *
 * The messages are kept for as long as the trip is: the trip is the chat group, so the conversation goes
 * with it.
 */
async function handleGET(_req: Request, ctx: RouteContext<"/api/trips/[id]/chat">) {
    const m = await (await memberTrip((await ctx.params).id));
    if (m instanceof Response)
        return m;
    return Response.json({ messages: (await messagesForTrip(m.trip.id)) });
}
async function handlePOST(req: Request, ctx: RouteContext<"/api/trips/[id]/chat">) {
    const m = await (await memberTrip((await ctx.params).id));
    if (m instanceof Response)
        return m;
    const input = parseChatInput(await (await readJson(req)));
    if (typeof input === "string")
        return fail(400, input);
    return Response.json({ message: (await addTripMessage(m.trip.id, m.me.id, input.body)) }, { status: 201 });
}

export const GET = withLobbyBackend(handleGET);
export const POST = withLobbyBackend(handlePOST);
