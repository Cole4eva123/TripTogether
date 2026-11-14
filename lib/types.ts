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
