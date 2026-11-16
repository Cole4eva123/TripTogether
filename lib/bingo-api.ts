// What the Travel Bingo route handlers share: turning a broken rule into its response, and the admin check.
import { isAdmin } from "./auth";
import { BingoError } from "./bingo-store";
import { currentUser, fail, needLogin } from "./server";

/** Runs a handler body, answering a BingoError with its status and message. */
export async function bingoAnswer(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof BingoError) return fail(e.status, e.message);
    throw e;
  }
}

/** The logged-in admin, or the response to send instead: 401 when logged out, 403 when not an admin. */
export async function currentAdmin(refusal = "Only admins can review tasks.") {
  const me = await currentUser();
  if (!me) return needLogin();
  if (!isAdmin(me.email)) return fail(403, refusal);
  return me;
}
