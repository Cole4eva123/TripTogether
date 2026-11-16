import { parseChallengeInput } from "@/lib/bingo";
import { bingoAnswer, currentAdmin } from "@/lib/bingo-api";
import { challenges, publishChallenge } from "@/lib/bingo-store";
import { currentUser, fail, needLogin, readJson } from "@/lib/server";

/** The published challenges, every region's or one region's (?region=), newest first. */
export async function GET(req: Request) {
  if (!(await currentUser())) return needLogin();
  const region = new URL(req.url).searchParams.get("region")?.trim() || undefined;
  return Response.json({ challenges: await challenges(region) });
}

/** Publishes a challenge for every group to take on. Admins only. */
export async function POST(req: Request) {
  const admin = await currentAdmin("Only admins can publish challenges.");
  if (admin instanceof Response) return admin;
  const input = parseChallengeInput(await readJson(req));
  if (typeof input === "string") return fail(400, input);
  return bingoAnswer(async () => Response.json({ challenge: await publishChallenge(admin.id, input) }, { status: 201 }));
}
