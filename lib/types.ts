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
 * A trip shared in the lobby by its organizer. Where, when and who are read from the trip each time, so a
 * changed plan shows at once; the note is the post's own.
 */
export type LobbyPost = {
  id: string;
  tripId: string;
  origin: string;
  destination: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  memberCount: number;
  note: string; // the organizer's message to other people
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

/** A request to join a trip, answered by the trip's organizer. */
export type JoinRequest = {
  id: string;
  tripId: string; // the trip being asked about
  applicantId: string; // the person who asked
  applicantName: string;
  message: string; // what the applicant said
  status: RequestStatus;
  score: number; // how close the applicant's own trips were to this one, when the request was made
  createdAt: string; // ISO
  respondedAt: string | null; // ISO
  // Why a declined request closed, so "turned down" and "taken back" read differently on each side.
  // "gone" means the trip was taken out of the lobby, which is nobody's answer.
  closedBy: "answerer" | "gone" | "asked" | null;
};

/**
 * A request as one person sees it: `member` when they are in the trip it is about (they see it; only the
 * organizer may answer it), `applicant` when they asked.
 */
export type RequestItem = {
  request: JoinRequest;
  role: "member" | "applicant";
  mayAnswer: boolean; // the reader is the trip's organizer and the request is still open
  trip: LobbyPost; // the trip as it is now; `id` is "" when it is no longer in the lobby
  members: Member[]; // the trip's members as they are now
  gone: boolean; // the trip is no longer in the lobby
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
  mine: boolean; // I'm in this trip
  organizedByMe: boolean; // I'm its organizer, so I take it down and answer requests
  score: number; // the best match against any of my trips, 0 when I have none
  reasons: string[]; // why it matched, in plain words
  datesClash: boolean; // it shares no days with any of my trips
  ended: boolean; // the trip is over, so it can't be joined any more
  members: Member[]; // the group as it is now; on other groups' trips the names are left out
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
  pendingRequestCount: number; // open requests the reader can answer
  publishedTripIds: string[]; // the reader's trips in the lobby, whatever the filters, so none is offered twice
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
