// What the lobby's route handlers share: the logged-in user, and a broken lobby rule turned into its response.
import { LobbyError } from "./lobby-store";
import { currentUser, fail, needLogin } from "./server";

/** Runs a handler body for the logged-in user; 401 when logged out, a LobbyError as its status and message. */
export async function lobbyAnswer(run: (me: { id: string }) => Promise<Response>): Promise<Response> {
  const me = await currentUser();
  if (!me) return needLogin();
  try {
    return await run(me);
  } catch (e) {
    if (e instanceof LobbyError) return fail(e.status, e.message);
    throw e;
  }
}
