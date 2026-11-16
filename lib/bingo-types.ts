// Shapes for Travel Bingo (feature 4), shared by its API and its pages. The endpoints are in docs/bingo.md.
// Kept apart from lib/types.ts so this feature doesn't touch the files the others share.

export type BingoTaskStatus = "pending" | "approved" | "rejected";

/** One thing to do in a region, from the task library. */
export type BingoTask = {
  id: string;
  region: string;
  title: string;
  description: string;
  status: BingoTaskStatus;
  submittedBy: string | null; // the name of the person who sent it in; null for the tasks the app ships with
  reviewNote: string; // why it was turned down, when it was
  createdAt: string; // ISO
};

/** One square on a card. */
export type BingoCell = {
  id: string;
  position: number; // 0 … size²−1, row by row
  task: Pick<BingoTask, "id" | "title" | "description">;
  completedBy: string | null; // the name of the member who checked it off
  completedById: string | null; // their user id; null if not done, or if they have deleted their account
  completedAt: string | null; // ISO
};

/** A challenge an admin published: a region's tasks at fixed squares, which any group can take on. */
export type BingoChallenge = {
  id: string;
  region: string;
  title: string;
  description: string;
  size: number; // 3 means 3×3
  tasks: Pick<BingoTask, "id" | "title" | "description">[]; // one per square, in position order
  createdBy: string | null; // the admin's name; null for the starter challenges the app ships with
  createdAt: string; // ISO
};

/** A trip's Bingo card: the challenge it took on, with the progress worked out. */
export type BingoCard = {
  id: string;
  tripId: string;
  challenge: Pick<BingoChallenge, "id" | "title">;
  region: string;
  size: number; // 3 means 3×3
  cells: BingoCell[]; // in position order
  completed: number; // squares checked off
  lines: number[][]; // every finished row, column or diagonal, as positions
  createdBy: string | null;
  createdAt: string; // ISO
};

/** A region in the library and how many approved tasks it has. */
export type BingoRegion = { region: string; taskCount: number };

/** What the trip's Bingo page loads. */
export type BingoView = {
  card: BingoCard | null;
  challenges: BingoChallenge[]; // every published one, those of suggestedRegion first
  suggestedRegion: string | null; // the region that matches the trip's destination, if one does
  // Who is looking: an admin may undo any square, others only their own; the trip's organizer and admins may
  // switch the trip to another challenge.
  viewer: { id: string; admin: boolean; maySwitch: boolean };
};
