// Shapes for Travel Bingo (feature 4), shared by its API and its pages. The endpoints are in docs/api.md under
// "Travel Bingo". Kept apart from lib/types.ts so this feature doesn't touch the files the others share.

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
  completedAt: string | null; // ISO
};

/** A trip's Bingo card, with the progress worked out. */
export type BingoCard = {
  id: string;
  tripId: string;
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
  regions: BingoRegion[];
  suggestedRegion: string | null; // the region that matches the trip's destination, if one does
};
