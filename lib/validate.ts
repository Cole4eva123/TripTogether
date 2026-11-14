import type { TripInput } from "./types";

const isDay = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v; // rejects 2026-02-31

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Checks a trip body from a request. Returns the cleaned input, or the message to show the user. */
export function parseTripInput(body: Record<string, unknown>): TripInput | string {
  const origin = text(body.origin);
  const destination = text(body.destination);
  const { startDate, endDate } = body;
  if (!origin) return "Enter where the trip starts.";
  if (!destination) return "Enter where the trip is going.";
  if (!isDay(startDate) || !isDay(endDate)) return "Pick a start date and an end date.";
  if (endDate < startDate) return "The trip has to end on or after the day it starts.";
  return { origin, destination, startDate, endDate };
}
