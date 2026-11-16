import { lotteryBoxFor, LotteryBoxError, changeLotteryBox, resetLotteryBox, startLotteryBox } from "@/lib/lottery-box-store";
import { fail, memberTrip, readJson } from "@/lib/server";

type Member = Exclude<Awaited<ReturnType<typeof memberTrip>>, Response>;
const privately = { "Cache-Control": "private, no-store" };

/** Checks membership, runs `write`, and answers with the box as it now is. */
function respond(write: (m: Member, body: Record<string, unknown>) => Promise<void>, status = 200) {
  return async function handle(req: Request, ctx: RouteContext<"/api/trips/[id]/lottery-box">): Promise<Response> {
    const m = await memberTrip((await ctx.params).id);
    if (m instanceof Response) return m;
    try {
      await write(m, await readJson(req));
      return Response.json({ box: await lotteryBoxFor(m) }, { status, headers: privately });
    } catch (error) {
      if (error instanceof LotteryBoxError) return fail(error.status, error.message);
      throw error;
    }
  };
}

export const GET = respond(async () => {});
export const POST = respond(startLotteryBox, 201);
export const PATCH = respond(changeLotteryBox);
export const DELETE = respond((m, body) => resetLotteryBox(m, body.roundId));
