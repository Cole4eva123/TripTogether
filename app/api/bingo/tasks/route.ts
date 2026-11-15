import { isAdmin } from "@/lib/auth";
import { parseTaskInput } from "@/lib/bingo";
import { bingoAnswer } from "@/lib/bingo-api";
import { regions, submissionsBy, submitTask, tasksIn } from "@/lib/bingo-store";
import { currentUser, fail, needLogin, readJson } from "@/lib/server";

/** The library: its regions, the approved tasks of one region (?region=), and what the user has sent in. */
export async function GET(req: Request) {
  const me = await currentUser();
  if (!me) return needLogin();
  const region = new URL(req.url).searchParams.get("region")?.trim() ?? "";
  const [all, tasks, mine] = await Promise.all([regions(), region ? tasksIn(region) : [], submissionsBy(me.id)]);
  return Response.json({ regions: all, tasks, mine, isAdmin: isAdmin(me.email) });
}

/** Sends a task in. It waits for an admin before it joins the library. */
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return needLogin();
  const input = parseTaskInput(await readJson(req));
  if (typeof input === "string") return fail(400, input);
  return bingoAnswer(async () => Response.json({ task: await submitTask(me.id, input) }, { status: 201 }));
}
