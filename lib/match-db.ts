// The shared lobby and the requests about it: who published what, who asked to join, and what was said
// afterwards. PostgreSQL persists every publication, request and message. Keep the API contract stable.
//
// A trip is a group: everyone in the trip is part of it, and the trip has one chat group of its own.
// A publication puts a trip in the shared lobby, where other people can ask to join it. When the owner of
// the trip says yes, the applicant is put in the trip, and is in its chat group from then on.
import { randomUUID } from "node:crypto";
import { all, database, execute, one, requireTestDatabase, transaction } from "./postgres.ts";
import { tripExists, tripMembers, tripMemberIds, tripMemberName, tripsFor, userName, addMember } from "./lobby-backend.ts";
import { similarity } from "./matching.ts";
import { lobbyForTrip } from "./lobby.ts";
import { hasEnded, sharedWindow } from "./dates.ts";
import type { ChatMessage, JoinRequest, LobbyFilters, LobbyPost, LobbyPostView, LobbyView, MatchBasis, RequestItem, } from "./types.ts";
const postColumns = `id, trip_id as tripId, owner_id as ownerId, owner_name as ownerName,
  origin, destination, start_date as startDate, end_date as endDate,
  member_count as memberCount, note, published_at as publishedAt`;
const requestColumns = `id, post_id as postId, trip_id as tripId, applicant_id as applicantId,
  applicant_name as applicantName, message, status, score, created_at as createdAt,
  responded_at as respondedAt, closed_by as closedBy`;
const readPosts = async () => (await all<LobbyPost>(`select ${postColumns} from shared_lobby_posts order by rowid`)).map((post) => ({ ...post }));
const readRequests = async () => (await all<JoinRequest>(`select ${requestColumns} from shared_lobby_requests order by rowid`)).map((request) => ({ ...request }));
const readMessages = async () => (await all<ChatMessage>(`select id, trip_id as tripId, sender_id as senderId, sender_name as senderName, body, sent_at as sentAt from shared_lobby_messages order by sent_at, rowid`)).map((message) => ({ ...message }));
/** Test-only reset of the lobby tables. */
export async function resetStore() {
    requireTestDatabase();
    (await transaction(() => database().exec("delete from shared_lobby_messages; delete from shared_lobby_requests; delete from shared_lobby_posts;")));
}
const findPost = async (id: string) => {
    const post = (await one<LobbyPost>(`select ${postColumns} from shared_lobby_posts where id = ?`, id));
    return post ? { ...post } : undefined;
};
const findRequest = async (id: string) => {
    const request = (await one<JoinRequest>(`select ${requestColumns} from shared_lobby_requests where id = ?`, id));
    return request ? { ...request } : undefined;
};
const postOfTrip = async (tripId: string) => {
    const post = (await one<LobbyPost>(`select ${postColumns} from shared_lobby_posts where trip_id = ?`, tripId));
    return post ? { ...post } : undefined;
};
/**
 * Drops the posts whose trip is gone or whose publisher has left the trip, and closes the requests that
 * pointed at them. Called before reading, so the lobby never shows a trip that isn't there.
 */
async function prune() {
    const posts = await readPosts();
    const requests = await readRequests();
    const messages = await readMessages();
    const ids = [...new Set([...posts.map(p => p.tripId), ...requests.map(r => r.tripId), ...messages.map(m => m.tripId)])];
    const live = new Map(await Promise.all(ids.map(async id => [id, { exists: await tripExists(id), members: await tripMemberIds(id) }] as const)));
    for (const post of posts) {
      const group = live.get(post.tripId)!;
      if (!group.exists || !group.members.includes(post.ownerId)) await execute("delete from shared_lobby_posts where id = ?", post.id);
    }
    for (const request of requests) {
      if (request.status !== "accepted" || live.get(request.tripId)?.members.includes(request.applicantId)) continue;
      await execute("update shared_lobby_requests set status = 'declined', closed_by = 'left', responded_at = ? where id = ? and status = 'accepted'", new Date().toISOString(), request.id);
    }
    for (const id of ids) if (!live.get(id)?.exists) await execute("delete from shared_lobby_messages where trip_id = ?", id);
}
/**
 * The lobby as one person sees it: their own groups' trips, the other groups' trips, and the requests about
 * the trips they are in.
 *
 * `againstPostId` is which of the reader's own published trips the comparison is made against. When it is
 * not given, the best of their posts is used, which is the comparison the request itself uses. The rule is
 * the same in both places, so the card and the request always talk about the same trip.
 */
export async function lobbyFor(meId: string, againstTripId?: string, query = "", filters?: Partial<LobbyFilters>): Promise<LobbyView> {
    (await prune());
    const posts = (await readPosts());
    const myTripIds = new Set((await tripsFor(meId)).map((trip) => trip.id));
    const requests = (await listRequestsFor(meId));
    // What the reader's own trips look like to the comparison. Every trip they are in counts, whether they
    // published it or joined it: the comparison is about where the reader is going, not about what they put
    // in the lobby.
    const myProfiles = (await tripProfilesFor(meId));
    // The reader's own requests, so a card can say "you asked to join this" without a second fetch.
    const myRequestsByTrip = new Map<string, JoinRequest>();
    for (const item of requests) {
        if (item.role !== "applicant")
            continue;
        const existing = myRequestsByTrip.get(item.request.tripId);
        // The newest request wins: an old one that was turned down shouldn't hide the new one.
        if (!existing || existing.createdAt <= item.request.createdAt) {
            myRequestsByTrip.set(item.request.tripId, item.request);
        }
    }
    const views: LobbyPostView[] = (await Promise.all(posts.map(async (post) => {
        const inGroup = myTripIds.has(post.tripId);
        if (inGroup) {
            return {
                ...post,
                mine: true,
                publishedByMe: post.ownerId === meId,
                score: 0,
                reasons: [],
                datesClash: false,
                ended: hasEnded(post.endDate),
                // The group as it is now: people join and leave a trip after it was published.
                members: (await tripMembers(post.tripId)),
                basis: null,
                myRequest: null,
            };
        }
        // The reader's own trip that this one is compared against: the one they picked, or else the one that
        // matches it best, so the score is the best they could get out of their trips.
        const bestPost = (await chosenPost(myProfiles, post, againstTripId));
        let best: {
            score: number;
            reasons: string[];
            basis: MatchBasis | null;
        } = {
            score: 0,
            reasons: [],
            basis: null,
        };
        if (bestPost) {
            const s = (await liveSimilarity(bestPost, post));
            const window = sharedWindow(bestPost, post);
            best = {
                score: s.score,
                reasons: s.reasons,
                basis: {
                    tripId: bestPost.tripId,
                    destination: bestPost.destination,
                    startDate: bestPost.startDate,
                    endDate: bestPost.endDate,
                    overlapStart: window?.startDate ?? "",
                    overlapEnd: window?.endDate ?? "",
                    overlapDays: window?.days ?? 0,
                },
            };
        }
        return {
            ...post,
            mine: false,
            publishedByMe: false,
            score: best.score,
            reasons: best.reasons,
            datesClash: myProfiles.length > 0 && best.basis !== null && best.basis.overlapDays === 0,
            ended: hasEnded(post.endDate),
            members: (await tripMembers(post.tripId)),
            basis: best.basis,
            myRequest: myRequestsByTrip.get(post.tripId) ?? null,
        };
    })));
    // The page's own splitting and ordering, so the browser only draws what the server worked out.
    const { mine: own, others } = lobbyForTrip(views, query, filters);
    const pendingRequestCount = (await Promise.all(requests.map(async item => item.request.status === "pending" && await canAnswer(item.request, meId)))).filter(Boolean).length;
    return { mine: own, others, requests, pendingRequestCount, publishedTripIds: posts.filter(post => myTripIds.has(post.tripId)).map(post => post.tripId) };
}
/**
 * The reader's own trip that another trip is compared against: the one they picked, or else the one that
 * matches it best, so the score is the best they could get out of their trips.
 *
 * The picked trip is named by its trip id, so it can be a trip the reader joined as well as one they
 * published.
 */
async function chosenPost(own: LobbyPost[], to: LobbyPost, againstTripId?: string): Promise<LobbyPost | null> {
    if (againstTripId) {
        const picked = own.find((post) => post.tripId === againstTripId);
        if (picked)
            return picked;
    }
    let best: LobbyPost | null = null;
    let bestScore = 0;
    let bestOverlap = -1;
    for (const post of own) {
        const s = (await liveSimilarity(post, to));
        if (s.score > bestScore || (s.score === bestScore && s.overlapDays > bestOverlap)) {
            best = post;
            bestScore = s.score;
            bestOverlap = s.overlapDays;
        }
    }
    return best;
}
/**
 * The person's own trips, in the shape the comparison uses.
 *
 * Every trip they are in counts, whether they published it or joined it: the comparison is about where
 * they are going, not about what they put in the lobby. The lobby and the join request both use this, so
 * the score on the card and the score on the request are always the same number.
 */
async function tripProfilesFor(userId: string): Promise<LobbyPost[]> {
    return (await tripsFor(userId)).map((trip) => ({
        id: trip.id,
        tripId: trip.id,
        ownerId: trip.ownerId,
        ownerName: "",
        origin: trip.origin,
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        memberCount: trip.memberCount,
        note: "",
        publishedAt: "",
    }));
}
/**
 * Publishes one of the user's trips to the lobby, copying its details in. Null when the trip isn't theirs
 * or is already published.
 */
export async function publishPost(ownerId: string, tripId: string, note: string): Promise<LobbyPost | null> {
    return (await transaction(async () => (await publishWithinTransaction(ownerId, tripId, note))));
}
async function publishWithinTransaction(ownerId: string, tripId: string, note: string): Promise<LobbyPost | null> {
    (await prune());
    if (!(await tripExists(tripId)) || (await tripMemberName(tripId, ownerId)) === null)
        return null;
    if ((await postOfTrip(tripId)))
        return null;
    const trip = (await tripsFor(ownerId)).find((t) => t.id === tripId);
    if (!trip)
        return null;
    const post: LobbyPost = {
        id: randomUUID(),
        tripId,
        ownerId,
        ownerName: (await tripMemberName(tripId, ownerId))!,
        origin: trip.origin,
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        memberCount: trip.memberCount,
        note,
        publishedAt: new Date().toISOString(),
    };
    (await execute(`insert into shared_lobby_posts (id, trip_id, owner_id, owner_name, origin, destination,
    start_date, end_date, member_count, note, published_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, post.id, tripId, ownerId, post.ownerName, post.origin, post.destination, post.startDate, post.endDate, post.memberCount, note, post.publishedAt));
    return post;
}
/**
 * Refreshes a post from the trip it speaks for, so a group that changed its plan can say so without taking
 * the post down and publishing it again. The note stays: it is what the publisher wrote, not what the trip
 * says. Null when the post isn't there or isn't the publisher's.
 */
export async function refreshPost(ownerId: string, tripId: string): Promise<LobbyPost | null> {
    return (await transaction(async () => (await refreshWithinTransaction(ownerId, tripId))));
}
async function refreshWithinTransaction(ownerId: string, tripId: string): Promise<LobbyPost | null> {
    (await prune());
    const post = (await postOfTrip(tripId));
    if (!post || post.ownerId !== ownerId)
        return null;
    const trip = (await tripsFor(ownerId)).find((t) => t.id === tripId);
    if (!trip)
        return null;
    post.origin = trip.origin;
    post.destination = trip.destination;
    post.startDate = trip.startDate;
    post.endDate = trip.endDate;
    post.memberCount = trip.memberCount;
    (await execute("update shared_lobby_posts set origin = ?, destination = ?, start_date = ?, end_date = ?, member_count = ? where id = ?", post.origin, post.destination, post.startDate, post.endDate, post.memberCount, post.id));
    return post;
}
/** Takes a post off the lobby. False when the post isn't there or isn't the user's. */
export async function unpublishPost(ownerId: string, tripId: string): Promise<boolean> {
    (await prune());
    return (await execute("delete from shared_lobby_posts where trip_id = ? and owner_id = ?", tripId, ownerId)) > 0;
}
/** How close two trips are, out of 100, with the reasons behind it. */
async function liveSimilarity(a: LobbyPost, b: LobbyPost) {
    return similarity({ ...a, memberCount: (await tripMembers(a.tripId)).length }, { ...b, memberCount: (await tripMembers(b.tripId)).length });
}
/**
 * Asks to join a trip that is in the lobby.
 *
 * Null when the trip isn't in the lobby, when the applicant is already in it, when the trip is over, or
 * when they have already asked and haven't been answered.
 */
export async function createJoinRequest(applicantId: string, postId: string, message: string): Promise<JoinRequest | null> {
    return (await transaction(async () => (await createWithinTransaction(applicantId, postId, message))));
}
async function createWithinTransaction(applicantId: string, postId: string, message: string): Promise<JoinRequest | null> {
    (await prune());
    const to = (await findPost(postId));
    if (!to)
        return null;
    // You can't ask to join a trip you are already in.
    if ((await tripMemberIds(to.tripId)).includes(applicantId))
        return null;
    // A trip that is over can't be joined any more.
    if (hasEnded(to.endDate))
        return null;
    // One person asks once: a request that is still open stands in the way of asking again. A request that
    // was turned down or taken back doesn't, because asking again is allowed after one.
    const standing = (await readRequests()).find((request) => request.tripId === to.tripId && request.applicantId === applicantId && request.status === "pending");
    if (standing)
        return null;
    // How close the applicant's own trips are to this one. It says nothing about whether they may ask: they
    // may ask to join any trip in the lobby. It only orders the lobby and says why a trip was worth a look.
    //
    // Every trip they are in counts, whether they published it or not, because the question is where they are
    // going, not what they put in the lobby. This is the same comparison the card makes, so the two always
    // give the same answer.
    const own = (await tripProfilesFor(applicantId));
    const score = own.length ? Math.max(...(await Promise.all(own.map(async (post) => (await liveSimilarity(post, to)).score)))) : 0;
    const request: JoinRequest = {
        id: randomUUID(),
        postId: to.id,
        tripId: to.tripId,
        applicantId,
        // The applicant's own name, not the name of anybody in the trip they are asking about.
        applicantName: await userName(applicantId),
        message,
        status: "pending",
        score,
        createdAt: new Date().toISOString(),
        respondedAt: null,
        closedBy: null,
    };
    (await execute(`insert into shared_lobby_requests (id, post_id, trip_id, applicant_id, applicant_name, message,
    status, score, created_at, responded_at, closed_by) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, request.id, request.postId, request.tripId, request.applicantId, request.applicantName, request.message, request.status, request.score, request.createdAt, request.respondedAt, request.closedBy));
    return request;
}
/**
 * The requests the person is party to: the ones about the trips they are in, and the ones they made.
 *
 * A request sits on the card of the trip it is about, so it is found where the trip is, and it is never
 * shown twice.
 */
export async function listRequestsFor(meId: string): Promise<RequestItem[]> {
    (await prune());
    const myTripIds = new Set((await tripsFor(meId)).map((trip) => trip.id));
    const messages = (await readMessages());
    const posts = (await readPosts());
    const postOf = (tripId: string) => posts.find((post) => post.tripId === tripId);
    return (await Promise.all((await readRequests()).map(async (request): Promise<RequestItem | null> => {
        // Being in the trip makes the reader an owner of it: everybody in a group is an owner of that group,
        // and they answer the requests about it together.
        const owner = myTripIds.has(request.tripId);
        const applicant = request.applicantId === meId;
        // The reader has to be one of the two parties, or the request isn't theirs to read.
        if (!owner && !applicant)
            return null;
        // Somebody who is both in the trip and the one who asked can't be: a member was already in.
        const post = postOf(request.tripId);
        const trip = post ?? { ...fallbackTrip(request) };
        const last = messages.filter((message) => message.tripId === request.tripId);
        return {
            request,
            role: owner ? "owner" : "applicant",
            post: post ?? { ...fallbackTrip(request) },
            trip,
            members: (await tripMembers(request.tripId)),
            gone: !post,
            lastMessage: last[last.length - 1] ?? null,
        };
    }))).filter((item): item is RequestItem => item !== null)
        .sort((a, b) => b.request.createdAt.localeCompare(a.request.createdAt));
}
/**
 * A trip for a request whose publication is gone. The request has to keep saying which trip it was about,
 * so it keeps the details it was made with.
 */
function fallbackTrip(request: JoinRequest): LobbyPost {
    return {
        id: request.postId,
        tripId: request.tripId,
        ownerId: "",
        ownerName: "",
        origin: "",
        destination: "",
        startDate: "",
        endDate: "",
        memberCount: 0,
        note: "",
        publishedAt: request.createdAt,
    };
}
/** The request, for one of the two parties. Null when it isn't there, or when the person isn't party to it. */
export async function requestFor(id: string, userId: string): Promise<JoinRequest | null> {
    (await prune());
    const request = (await findRequest(id));
    if (!request)
        return null;
    if (!(await isParty(request, userId)))
        return null;
    return request;
}
/**
 * True when the person is party to the request: they are in the trip it is about, or they are the one who
 * asked to join.
 */
export async function isParty(request: JoinRequest, userId: string): Promise<boolean> {
    if (request.applicantId === userId)
        return true;
    return (await tripMemberIds(request.tripId)).includes(userId);
}
/**
 * True when the person is in the trip the request is about, and so may answer it.
 *
 * Everybody in a group is an owner of it, so membership is the whole of the test. The person who asked to
 * join is the one exception: they are asking to be let in, so they don't answer their own request.
 */
export async function canAnswer(request: JoinRequest, userId: string): Promise<boolean> {
    if (request.applicantId === userId)
        return false;
    return (await tripMemberIds(request.tripId)).includes(userId);
}
/**
 * Answers a request: accepts it or turns it down.
 *
 * A trip is a group, and everybody in a group is an owner of it: they chose to travel together, they share
 * the itinerary and the chat, and they decide together who travels with them. So any member of the trip
 * may answer a request about it, not only the person who put it in the lobby. The publisher is the one who
 * put the trip in the lobby, which is a different thing and is kept to itself: they may take it down again.
 *
 * Null when the person isn't in the trip the request is about, or when the request was already answered.
 */
export async function respondToRequest(id: string, userId: string, action: "accept" | "decline"): Promise<JoinRequest | null> {
 return transaction(() => respondWithinTransaction(id, userId, action));
}
async function respondWithinTransaction(id: string, userId: string, action: "accept" | "decline"): Promise<JoinRequest | null> {
    (await prune());
    const request = (await findRequest(id));
    if (!request)
        return null;
    // The applicant can't answer their own request, and nobody outside the trip can answer at all.
    if (request.applicantId === userId)
        return null;
    if (!(await tripMemberIds(request.tripId)).includes(userId))
        return null;
    const changed = (await execute(`update shared_lobby_requests set status = ?, closed_by = 'answerer', responded_at = ?
    where id = ? and status = 'pending'`, action === "accept" ? "accepted" : "declined", new Date().toISOString(), id));
    if (!changed)
        return null;
    // The applicant is now a member of the trip, and so of its chat group.
    if (action === "accept") {
        await addMember(request.tripId, request.applicantId, execute);
    }
    return (await findRequest(id))!;
}
/**
 * Takes back a request that hasn't been answered yet. Only the applicant may do that: the request is
 * theirs, and changing their mind should be enough to call it off. The request stays in the record, marked
 * as taken back, so both sides can see what happened. Null when the person wasn't the applicant, or when
 * the request was already answered.
 */
export async function withdrawRequest(id: string, userId: string): Promise<JoinRequest | null> {
    (await prune());
    const changed = (await execute(`update shared_lobby_requests set status = 'declined', closed_by = 'asked', responded_at = ?
    where id = ? and status = 'pending' and applicant_id = ?`, new Date().toISOString(), id, userId));
    return changed ? (await findRequest(id))! : null;
}
/**
 * The conversation in a trip. Every member of the trip is in it.
 *
 * The messages are kept for as long as the trip is: the trip is the chat group, so the conversation goes
 * with it.
 */
export async function messagesForTrip(tripId: string): Promise<ChatMessage[]> {
    await prune();
    return (await readMessages()).filter((message) => message.tripId === tripId);
}
/** Adds a line to the conversation in a trip. Only a member of the trip may write in it. */
export async function addTripMessage(tripId: string, senderId: string, body: string): Promise<ChatMessage> {
    return (await transaction(async () => {
        if (!(await tripMemberIds(tripId)).includes(senderId)) {
            throw new Error("You are not a member of this trip.");
        }
        const text = body.trim();
        if (!text || text.length > 2000)
            throw new Error("A message must contain between 1 and 2000 characters.");
        const message: ChatMessage = {
            id: randomUUID(),
            tripId,
            senderId,
            // A message is written by a person, not by a group: the name is the one of whoever wrote it.
            senderName: await userName(senderId),
            body: text,
            sentAt: new Date().toISOString(),
        };
        (await execute("insert into shared_lobby_messages (id, trip_id, sender_id, sender_name, body, sent_at) values (?, ?, ?, ?, ?, ?)", message.id, message.tripId, message.senderId, message.senderName, message.body, message.sentAt));
        return message;
    }));
}
