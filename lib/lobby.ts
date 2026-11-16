import { placeMatchesQuery } from "./place-search.ts";
import type { LobbyFilters, LobbyPostView } from "./types.ts";

/**
 * The lobby as the page shows it: the reader's own groups' trips, and the other groups' trips, filtered by
 * the search and the date range, and ordered by how close they are.
 *
 * This runs on the server. The comparison itself is worked out in `lib/match-db.ts`, and the search needs
 * the gazetteer, which is far too big to send to a browser. Having either of them worked out in two places
 * would be two things to keep right, so the server does both and the page only draws what it is given.
 */
export type LobbyPage = {
  /** The trips of the reader's own groups, in the order they were published. */
  mine: LobbyPostView[];
  /** The other groups' trips, filtered and ordered. */
  others: LobbyPostView[];
};

/**
 * The lobby, split into the reader's own trips and everyone else's.
 *
 * The reader's own trips are listed as they were published, so the reader can find the one they are looking
 * for. Everyone else's trips come first in the order they can be travelled together: the ones that share
 * days with the reader's trip, then the closest ones, then the ones that start soonest. A trip that has
 * already been is still listed, because a person may be publishing again for a later trip, but it goes to
 * the end: there is nothing to join.
 */
export function lobbyForTrip(posts: LobbyPostView[], query: string, filters?: Partial<LobbyFilters>): LobbyPage {
  const from = filters?.from ?? "";
  const to = filters?.to ?? "";
  const sort = filters?.sort ?? "closest";
  // The reader's own trips answer the same filters as everybody else's: the filters are for the lobby, and
  // the reader's trips are in it. A search that hid them would hide a trip the reader is in.
  const mine = posts
    .filter((post) => post.mine && matchesQuery(post, query) && matchesDates(post, from, to))
    .sort(comparator(sort));
  const others = posts
    .filter((post) => !post.mine && matchesQuery(post, query) && matchesDates(post, from, to))
    .sort(comparator(sort));
  return { mine, others };
}

/** The order the trips are shown in. */
function comparator(sort: LobbyFilters["sort"]) {
  if (sort === "soonest") {
    return (a: LobbyPostView, b: LobbyPostView) =>
      Number(a.ended) - Number(b.ended) || a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate) || a.id.localeCompare(b.id);
  }
  if (sort === "soonest-end") {
    return (a: LobbyPostView, b: LobbyPostView) =>
      Number(a.ended) - Number(b.ended) || a.endDate.localeCompare(b.endDate) || a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id);
  }
  return (a: LobbyPostView, b: LobbyPostView) =>
    Number(a.ended) - Number(b.ended) ||
    Number(a.datesClash) - Number(b.datesClash) ||
    b.score - a.score ||
    a.startDate.localeCompare(b.startDate) ||
    a.id.localeCompare(b.id);
}

/**
 * Whether a trip falls inside the date range the reader asked for.
 *
 * The range is the window the trip is travelled in, not the day it leaves: a trip that leaves on the 5th and
 * is back on the 20th is in the range when the range covers any of those days.
 */
export function matchesDates(post: LobbyPostView, from: string, to: string): boolean {
  if (from && post.endDate < from) return false;
  if (to && post.startDate > to) return false;
  return true;
}

/**
 * Whether a post answers the search.
 *
 * Every word has to be accounted for, and a word can be answered by different parts of the post: "denver"
 * by the destination, "hiking" by the note. The destination is looked up in the gazetteer, so the search
 * finds the place rather than the spelling of it: "北京" finds "Beijing" and "nyc" finds "New York City".
 */
export function matchesQuery(post: LobbyPostView, query: string): boolean {
  const text = query.trim();
  if (!text) return true;
  const words = text.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const rest = [post.origin, post.note].join(" ").toLocaleLowerCase();
  return words.every(
    (word) => placeMatchesQuery(post.destination, word) || rest.includes(word),
  );
}
