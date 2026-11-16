import { qualifiedPlaceName, searchPlaces } from "@/lib/place-search";
import { currentUser, needLogin } from "@/lib/server";

/**
 * The places that answer to what the reader typed.
 *
 * The gazetteer is far too big to send to a browser, so the search runs here and the browser gets a short
 * list of names to pick from. `name` is the full name of what was typed when that is itself a place, so a
 * form can tell a value it was handed (a saved trip's destination) is one it may send back.
 */
export async function GET(req: Request) {
  const me = await currentUser();
  if (!me) return needLogin();
  const query = new URL(req.url).searchParams.get("q") ?? "";
  return Response.json({ places: searchPlaces(query), name: qualifiedPlaceName(query) });
}
