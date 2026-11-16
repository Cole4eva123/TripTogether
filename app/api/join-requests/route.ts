import { lobbyAnswer } from "@/lib/lobby-api";
import { createJoinRequest, pendingRequestCount } from "@/lib/lobby-store";
import { fail, readJson } from "@/lib/server";
import { parseJoinRequestInput } from "@/lib/validate";

/** How many requests wait for the reader's answer, for the nav's badge. */
export async function GET() {
  return lobbyAnswer(async (me) => Response.json({ pendingRequestCount: await pendingRequestCount(me.id) }));
}

/** Asks to join a trip in the lobby. The requests themselves come with the lobby (GET /api/lobby). */
export async function POST(req: Request) {
  return lobbyAnswer(async (me) => {
    const input = parseJoinRequestInput(await readJson(req));
    if (typeof input === "string") return fail(400, input);
    return Response.json({ request: await createJoinRequest(me.id, input.postId, input.message) }, { status: 201 });
  });
}
