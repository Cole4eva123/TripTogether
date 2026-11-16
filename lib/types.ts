// Shapes shared by the frontend and the API. docs/api.md describes the endpoints that return them.

export type User = { id: string; name: string; email: string };

export type Trip = {
  id: string;
  origin: string;
  destination: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  inviteCode: string;
  ownerId: string;
  memberCount: number;
};

export type Member = { id: string; name: string };

export type TripInput = Pick<Trip, "origin" | "destination" | "startDate" | "endDate">;

/** One thing planned on one day of a trip. `time` is "HH:MM" (24-hour) or null for "any time that day". */
export type PlanItem = {
  id: string;
  date: string; // YYYY-MM-DD
  time: string | null;
  title: string;
  place: string;
  note: string;
  addedBy: string; // the name of the member who added it
};

export type PlanInput = Pick<PlanItem, "date" | "time" | "title" | "place" | "note">;

// --- The shared lobby (feature 2) ---

/**
 * A trip published to the shared lobby. Everyone in the trip is part of the group, and the post speaks for
 * all of them. The trip's details are copied in, so the post stays what it was when it was published: a
 * later change to the trip doesn't change what the lobby compares. The publisher can refresh the copy when
 * the plan changes (`PATCH /api/lobby/:tripId`).
 */
export type LobbyPost = {
  id: string;
  tripId: string; // the group this post speaks for
  ownerId: string; // the member who published it, and the one who answers requests about it
  ownerName: string;
  origin: string;
  destination: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  memberCount: number; // how many travelers the group had when it was published
  note: string; // the publisher's message to other people
  publishedAt: string; // ISO
};

/**
 * What the lobby compares: where a trip goes, when, and how many people are in it. Both a published post
 * and a live trip answer this, so the comparison doesn't care which one it is given.
 */
export type TripProfile = Pick<
  LobbyPost,
  "origin" | "destination" | "startDate" | "endDate" | "memberCount"
>;

export type RequestStatus = "pending" | "accepted" | "declined";

/**
 * A request to join a trip. The applicant is a person; the trip is the group they are asking to join.
 *
 * The applicant's name is copied in, because they are not a member of the trip yet, and a request has to
 * keep saying who asked even after it has been answered.
 */
export type JoinRequest = {
  id: string;
  postId: string; // the publication the request was made against
  tripId: string; // the trip being asked about
  applicantId: string; // the person who asked
  applicantName: string;
  message: string; // what the applicant said
  status: RequestStatus;
  score: number; // how close the applicant's own trips were to this one, when the request was made
  createdAt: string; // ISO
  respondedAt: string | null; // ISO
  // Who closed the request out, so "turned down" and "taken back" read differently on each side.
  // "gone" means the trip was taken down the lobby, which is nobody's answer.
  // "left" means the applicant was let in and then left the trip again, so they aren't in it any more.
  closedBy: "answerer" | "gone" | "asked" | "left" | null;
};

/**
 * A request as one person sees it. The request sits on the card of the trip it is about, so `role` is the
 * reader's side of it: they are in the trip it is about, or they are the one who asked to join.
 *
 * A trip is a group, and everybody in a group is an owner of it, so "owner" here means "in the trip" rather
 * than "published it". Whoever published it is tracked separately, on the post.
 */
export type RequestItem = {
  request: JoinRequest;
  role: "owner" | "applicant";
  post: LobbyPost; // the publication the request was made against
  trip: LobbyPost; // the trip itself, as it is now
  members: Member[]; // the trip's members as they are now
  gone: boolean; // the trip is no longer in the lobby
  lastMessage: ChatMessage | null;
};

export type ChatMessage = {
  id: string;
  tripId: string;
  senderId: string;
  senderName: string;
  body: string;
  sentAt: string; // ISO
};

/**
 * Which of the reader's own trips a lobby post was compared against. Without it a reader with two trips in
 * the lobby sees a score and no idea which of their trips it came from.
 */
export type MatchBasis = {
  tripId: string;
  destination: string;
  startDate: string;
  endDate: string;
  overlapStart: string; // the days the two trips share
  overlapEnd: string;
  overlapDays: number;
};

/** A lobby post as one person sees it: their own groups' posts marked, plus how close it is to their own. */
export type LobbyPostView = LobbyPost & {
  mine: boolean; // I'm in the group that published this trip
  publishedByMe: boolean; // I published it, so I may take it down again
  score: number; // the best match against any of my trips, 0 when I have none
  reasons: string[]; // why it matched, in plain words
  datesClash: boolean; // it shares no days with any of my trips
  ended: boolean; // the trip is over, so it can't be joined any more
  members: Member[]; // the group as it is now, not as it was when the post was published
  basis: MatchBasis | null; // which of my trips it was compared against
  /** A request of mine about this trip, if I have one: pending, or already answered. */
  myRequest: JoinRequest | null;
};

/**
 * The whole lobby as one person sees it: their own groups' trips, the other groups' trips, and the requests
 * about the trips they are in.
 *
 * The two lists are worked out on the server, because the comparison and the search both read the gazetteer,
 * which is far too big to send to a browser.
 */
export type LobbyView = {
  pendingRequestCount?: number; // Server-authorized pending applications the reader can answer.
  publishedTripIds?: string[]; // Unfiltered ids, so a hidden publication is not offered for publishing again.
  mine: LobbyPostView[];
  others: LobbyPostView[];
  requests: RequestItem[];
};

/** What the lobby can be narrowed down by. */
export type LobbyFilters = {
  query: string; // a place or a note
  from: string; // the earliest departure to show
  to: string; // the latest departure to show
  sort: "closest" | "soonest" | "soonest-end";
};
