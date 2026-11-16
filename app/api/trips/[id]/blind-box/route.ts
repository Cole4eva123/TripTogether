import { blindBoxFor, BlindBoxError, changeBlindBox, resetBlindBox, startBlindBox } from "@/lib/blind-box-store";
import { fail, memberTrip, readJson } from "@/lib/server";

type Member = Exclude<Awaited<ReturnType<typeof memberTrip>>, Response>;
const privately = { "Cache-Control": "private, no-store" };

/** Checks membership, runs `write`, and answers with the box as it now is. */
function respond(write: (m: Member, body: Record<string, unknown>) => Promise<void>, status = 200) {
  return async function handle(req: Request, ctx: RouteContext<"/api/trips/[id]/blind-box">): Promise<Response> {
    const m = await memberTrip((await ctx.params).id);
    if (m instanceof Response) return m;
    try {
      await write(m, await readJson(req));
      return Response.json({ box: await blindBoxFor(m) }, { status, headers: privately });
    } catch (error) {
      if (error instanceof BlindBoxError) return fail(error.status, error.message);
      throw error;
    }
  };
}

export const GET = respond(async () => {});
export const POST = respond(startBlindBox, 201);
export const PATCH = respond(changeBlindBox);
export const DELETE = respond((m, body) => resetBlindBox(m, body.roundId));
