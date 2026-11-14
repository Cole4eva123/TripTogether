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
