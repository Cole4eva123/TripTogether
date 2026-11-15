import { currentAdmin } from "@/lib/bingo-api";
import { pendingTasks } from "@/lib/bingo-store";

/** The tasks waiting for review. Admins only. */
export async function GET() {
  const admin = await currentAdmin();
  if (admin instanceof Response) return admin;
  return Response.json({ tasks: await pendingTasks() });
}
