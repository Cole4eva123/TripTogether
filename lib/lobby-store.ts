// The shared lobby (feature 2): trips their organizers share, requests to join them, and each trip's chat group.
// In PostgreSQL like the rest (tables in lib/db/schema.ts); how close two trips are is lib/matching.ts, and the
// search and order of the lobby is lib/lobby.ts. Deleting a trip or an account takes its rows with it (cascades).
import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { hasEnded, sharedWindow } from "./dates.ts";
import { db, isUniqueViolation, ready } from "./db/client.ts";
import { lobbyPosts, lobbyRequests, tripMembers, tripMessages, trips, users } from "./db/schema.ts";
import { lobbyForTrip } from "./lobby.ts";
import { similarity } from "./matching.ts";
import { isId, tripsFor } from "./store.ts";
import type {
  ChatMessage,
  JoinRequest,
  LobbyFilters,
  LobbyPost,
  LobbyPostView,
  LobbyView,
  Member,
  RequestItem,
  Trip,
} from "./types.ts";

/** A rule broken by a request, with the status and message the API answers with. */
export class LobbyError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const refuse = (status: number, message: string): never => {
  throw new LobbyError(status, message);
};

// --- Reading ---

const memberCount = sql<number>`(select count(*)::int from ${tripMembers} where ${tripMembers.tripId} = ${trips.id})`;
type TripRow = typeof trips.$inferSelect;

const toPost = (postId: string, t: TripRow, count: number, note: string, publishedAt: Date | null): LobbyPost => ({
  id: postId,
  tripId: t.id,
  origin: t.origin,
  destination: t.destination,
  startDate: t.startDate,
  endDate: t.endDate,
  memberCount: count,
  note,
  publishedAt: publishedAt?.toISOString() ?? "",
});

/** The posts, each with its trip as it is now, oldest first. */
async function postsWhere(where?: SQL) {
  const rows = await db
    .select({ p: lobbyPosts, t: trips, count: memberCount })
    .from(lobbyPosts)
    .innerJoin(trips, eq(trips.id, lobbyPosts.tripId))
    .where(where)
    .orderBy(asc(lobbyPosts.publishedAt));
  return rows.map((r) => ({ post: toPost(r.p.id, r.t, r.count, r.p.note, r.p.publishedAt), organizerId: r.t.ownerId }));
}

/** The requests, newest first, each with the trip it is about and that trip's post if it is still up. */
async function requestsWhere(where?: SQL) {
  const rows = await db
    .select({ r: lobbyRequests, name: users.name, t: trips, count: memberCount, p: lobbyPosts })
    .from(lobbyRequests)
    .innerJoin(users, eq(users.id, lobbyRequests.applicantId))
    .innerJoin(trips, eq(trips.id, lobbyRequests.tripId))
    .leftJoin(lobbyPosts, eq(lobbyPosts.tripId, lobbyRequests.tripId))
    .where(where)
    .orderBy(desc(lobbyRequests.createdAt));
  return rows.map((row) => ({
    request: toRequest(row.r, row.name),
    trip: toPost(row.p?.id ?? "", row.t, row.count, row.p?.note ?? "", row.p?.publishedAt ?? null),
    organizerId: row.t.ownerId,
    gone: !row.p,
  }));
}

const toRequest = (r: typeof lobbyRequests.$inferSelect, applicantName: string): JoinRequest => ({
  id: r.id,
  tripId: r.tripId,
  applicantId: r.applicantId,
  applicantName,
  message: r.message,
  status: r.status,
  score: r.score,
  createdAt: r.createdAt.toISOString(),
  respondedAt: r.respondedAt?.toISOString() ?? null,
  closedBy: r.closedBy,
});

/** The members of each trip, in the order they joined. */
async function membersOf(tripIds: string[]): Promise<Map<string, Member[]>> {
  const byTrip = new Map(tripIds.map((id) => [id, [] as Member[]]));
  if (!tripIds.length) return byTrip;
  const rows = await db
    .select({ tripId: tripMembers.tripId, id: users.id, name: users.name })
    .from(tripMembers)
    .innerJoin(users, eq(users.id, tripMembers.userId))
    .where(inArray(tripMembers.tripId, tripIds))
    .orderBy(asc(tripMembers.joinedAt));
  for (const r of rows) byTrip.get(r.tripId)!.push({ id: r.id, name: r.name });
  return byTrip;
}

/** Another group's members, counted but not named: the lobby is public. */
const unnamed = (members: Member[]) => members.map((_, i) => ({ id: `traveler-${i + 1}`, name: "" }));

/**
 * Which of the reader's trips another trip is compared against: the one they picked, or else the one that
 * matches it best (by score, then by days shared), so the score is the best their trips can get.
 */
function basisFor(own: Trip[], to: LobbyPost, againstTripId?: string) {
  const picked = own.find((t) => t.id === againstTripId);
  if (picked) return picked;
  let best: Trip | null = null;
  let bestScore = 0;
  let bestOverlap = -1;
  for (const t of own) {
    const s = similarity(t, to);
    if (s.score > bestScore || (s.score === bestScore && s.overlapDays > bestOverlap)) {
      [best, bestScore, bestOverlap] = [t, s.score, s.overlapDays];
    }
  }
  return best;
}

/**
 * The lobby as one person sees it: the trips of theirs that are in it, everyone else's (filtered and ordered,
 * compared with their own trips), and the requests about the trips they are in or that they made.
 * ponytail: reads and scores every post on each call; page or prefilter by date if the lobby grows.
 */
export async function lobbyFor(
  meId: string,
  againstTripId?: string,
  query = "",
  filters?: Partial<LobbyFilters>,
): Promise<LobbyView> {
  const own = await tripsFor(meId);
  const ownIds = own.map((t) => t.id);
  const [posts, requests] = await Promise.all([
    postsWhere(),
    requestsWhere(or(eq(lobbyRequests.applicantId, meId), ownIds.length ? inArray(lobbyRequests.tripId, ownIds) : undefined)),
  ]);
  const members = await membersOf([...new Set([...posts.map((p) => p.post.tripId), ...requests.map((r) => r.trip.tripId)])]);

  const items: RequestItem[] = requests.map(({ request, trip, organizerId, gone }) => {
    const member = ownIds.includes(request.tripId);
    const group = members.get(trip.tripId)!;
    return {
      request,
      role: member ? "member" : "applicant",
      mayAnswer: member && organizerId === meId && request.status === "pending",
      trip,
      members: member ? group : unnamed(group),
      gone,
    };
  });

  const views: LobbyPostView[] = posts.map(({ post, organizerId }) => {
    const group = members.get(post.tripId)!;
    const ended = hasEnded(post.endDate);
    if (ownIds.includes(post.tripId)) {
      return { ...post, mine: true, organizedByMe: organizerId === meId, score: 0, reasons: [], datesClash: false, ended, members: group, basis: null, myRequest: null };
    }
    const mine = basisFor(own, post, againstTripId);
    const match = mine && similarity(mine, post);
    const window = mine && sharedWindow(mine, post);
    return {
      ...post,
      mine: false,
      organizedByMe: false,
      score: match?.score ?? 0,
      reasons: match?.reasons ?? [],
      datesClash: !!mine && !window,
      ended,
      members: unnamed(group),
      basis: mine && {
        tripId: mine.id,
        destination: mine.destination,
        startDate: mine.startDate,
        endDate: mine.endDate,
        overlapStart: window?.startDate ?? "",
        overlapEnd: window?.endDate ?? "",
        overlapDays: window?.days ?? 0,
      },
      // Newest first, so a request turned down earlier doesn't hide the one made since.
      myRequest: items.find((i) => i.role === "applicant" && i.request.tripId === post.tripId)?.request ?? null,
    };
  });

  return {
    ...lobbyForTrip(views, query, filters),
    requests: items,
    pendingRequestCount: items.filter((i) => i.mayAnswer).length,
    publishedTripIds: posts.filter((p) => ownIds.includes(p.post.tripId)).map((p) => p.post.tripId),
  };
}

/** How many requests wait for this person's answer: the pending ones on the trips they organize. The nav polls it. */
export async function pendingRequestCount(meId: string): Promise<number> {
  await ready();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lobbyRequests)
    .innerJoin(trips, eq(trips.id, lobbyRequests.tripId))
    .where(and(eq(trips.ownerId, meId), eq(lobbyRequests.status, "pending")));
  return row.n;
}

// --- Posts ---

/** The trip, checked to be one the user organizes. 404 when they aren't in it (or it's gone), 403 when not its organizer. */
async function organizedTrip(tripId: string, userId: string, refusal: string) {
  await ready();
  const [row] = isId(tripId)
    ? await db
        .select({ t: trips, member: tripMembers.userId })
        .from(trips)
        .leftJoin(tripMembers, and(eq(tripMembers.tripId, trips.id), eq(tripMembers.userId, userId)))
        .where(eq(trips.id, tripId))
    : [];
  if (!row?.member) refuse(404, "That trip isn't yours, or it's gone.");
  if (row.t.ownerId !== userId) refuse(403, refusal);
  return row.t;
}

/** The organizer shares their trip in the lobby, with a note. */
export async function publishPost(userId: string, tripId: string, note: string): Promise<LobbyPost> {
  const trip = await organizedTrip(tripId, userId, "Only the trip's organizer can share it in the lobby.");
  if (hasEnded(trip.endDate)) refuse(409, "That trip is already over.");
  try {
    const [row] = await db.insert(lobbyPosts).values({ tripId, note }).returning({ id: lobbyPosts.id });
    return (await postsWhere(eq(lobbyPosts.id, row.id)))[0].post;
  } catch (e) {
    throw isUniqueViolation(e) ? new LobbyError(409, "That trip is already in the lobby.") : e;
  }
}

/** The organizer takes their trip out of the lobby. The requests still waiting close, as nobody's answer. */
export async function unpublishPost(userId: string, tripId: string): Promise<void> {
  await organizedTrip(tripId, userId, "Only the trip's organizer can take it out of the lobby.");
  await db.transaction(async (tx) => {
    const gone = await tx.delete(lobbyPosts).where(eq(lobbyPosts.tripId, tripId)).returning({ id: lobbyPosts.id });
    if (!gone.length) refuse(404, "That trip isn't in the lobby.");
    await tx
      .update(lobbyRequests)
      .set({ status: "declined", closedBy: "gone", respondedAt: new Date() })
      .where(and(eq(lobbyRequests.tripId, tripId), eq(lobbyRequests.status, "pending")));
  });
}

// --- Requests ---

const isMember = async (tripId: string, userId: string) =>
  (
    await db
      .select({ id: tripMembers.userId })
      .from(tripMembers)
      .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)))
  ).length > 0;

const requestById = async (id: string) => (await requestsWhere(eq(lobbyRequests.id, id)))[0]?.request;

/**
 * Asks to join a trip in the lobby. The score is how close the applicant's own trips are to it, the same
 * comparison the lobby's cards make; it orders things, it doesn't decide who may ask.
 */
export async function createJoinRequest(applicantId: string, postId: string, message: string): Promise<JoinRequest> {
  await ready();
  const [found] = isId(postId) ? await postsWhere(eq(lobbyPosts.id, postId)) : [];
  if (!found) refuse(404, "That trip isn't in the lobby any more.");
  const { post } = found;
  const own = await tripsFor(applicantId);
  if (own.some((t) => t.id === post.tripId)) refuse(409, "You're already in this trip.");
  if (hasEnded(post.endDate)) refuse(409, "That trip is already over.");
  const score = Math.max(0, ...own.map((t) => similarity(t, post).score));
  try {
    const [row] = await db
      .insert(lobbyRequests)
      .values({ tripId: post.tripId, applicantId, message, score })
      .returning({ id: lobbyRequests.id });
    return (await requestById(row.id))!;
  } catch (e) {
    // One open request per person per trip (lobby_requests_one_pending_key).
    throw isUniqueViolation(e) ? new LobbyError(409, "You've already asked to join this trip. Wait for an answer.") : e;
  }
}

/** The request, for the applicant or a member of the trip it is about; 404 for anyone else. */
export async function requestFor(id: string, userId: string): Promise<JoinRequest> {
  await ready();
  const request = isId(id) ? await requestById(id) : undefined;
  if (!request || (request.applicantId !== userId && !(await isMember(request.tripId, userId)))) {
    refuse(404, "That request doesn't exist, or you're not part of it.");
  }
  return request!;
}

/**
 * The organizer answers a request. Letting someone in adds them to the trip, and so to its chat group, in the
 * same transaction; someone who joined meanwhile with the invite code is simply already in.
 */
export async function respondToRequest(id: string, userId: string, action: "accept" | "decline"): Promise<JoinRequest> {
  await requestFor(id, userId);
  await db.transaction(async (tx) => {
    // Locks the request, so a withdrawal or a second answer waits and then finds it answered.
    const [row] = await tx
      .select({ r: lobbyRequests, organizerId: trips.ownerId, endDate: trips.endDate })
      .from(lobbyRequests)
      .innerJoin(trips, eq(trips.id, lobbyRequests.tripId))
      .where(eq(lobbyRequests.id, id))
      .for("update", { of: lobbyRequests });
    if (!row) refuse(404, "That request doesn't exist, or you're not part of it."); // its trip was deleted meanwhile
    if (row.r.applicantId === userId) refuse(403, "You asked to join this trip, so you can't answer your own request.");
    if (row.organizerId !== userId) refuse(403, "Only the trip's organizer can answer requests.");
    if (row.r.status !== "pending") refuse(409, "This request was already answered.");
    const accept = action === "accept";
    if (accept) {
      if (hasEnded(row.endDate)) refuse(409, "That trip is already over.");
      await tx.insert(tripMembers).values({ tripId: row.r.tripId, userId: row.r.applicantId }).onConflictDoNothing();
    }
    await tx
      .update(lobbyRequests)
      .set({ status: accept ? "accepted" : "declined", closedBy: accept ? null : "answerer", respondedAt: new Date() })
      .where(eq(lobbyRequests.id, id));
  });
  return (await requestById(id))!;
}

/** The applicant takes back a request that hasn't been answered. It stays on record, marked as taken back. */
export async function withdrawRequest(id: string, userId: string): Promise<JoinRequest> {
  const request = await requestFor(id, userId);
  if (request.applicantId !== userId) refuse(403, "Only the person who asked can take the request back.");
  const changed = await db
    .update(lobbyRequests)
    .set({ status: "declined", closedBy: "asked", respondedAt: new Date() })
    .where(and(eq(lobbyRequests.id, id), eq(lobbyRequests.status, "pending")))
    .returning({ id: lobbyRequests.id });
  if (!changed.length) refuse(409, "This request was already answered.");
  return (await requestById(id))!;
}

// --- Chat ---

/** The trip's chat, oldest first. The route has checked the reader is a member. */
export async function messagesForTrip(tripId: string): Promise<ChatMessage[]> {
  await ready();
  const rows = await db
    .select({ m: tripMessages, name: users.name })
    .from(tripMessages)
    .innerJoin(users, eq(users.id, tripMessages.senderId))
    .where(eq(tripMessages.tripId, tripId))
    .orderBy(asc(tripMessages.sentAt), asc(tripMessages.id));
  return rows.map(({ m, name }) => ({ id: m.id, tripId: m.tripId, senderId: m.senderId, senderName: name, body: m.body, sentAt: m.sentAt.toISOString() }));
}

/** Adds a line to the trip's chat. The route has checked the sender is a member and the body is valid. */
export async function addTripMessage(tripId: string, senderId: string, body: string): Promise<ChatMessage> {
  await ready();
  const [row] = await db.insert(tripMessages).values({ tripId, senderId, body }).returning();
  const [sender] = await db.select({ name: users.name }).from(users).where(eq(users.id, senderId));
  return { id: row.id, tripId, senderId, senderName: sender.name, body: row.body, sentAt: row.sentAt.toISOString() };
}
