import type { PlanInput, Trip, TripInput } from "./types";

const MAX_TRIP_DAYS = 60;
const DAY_MS = 86_400_000;

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
  if ((Date.parse(endDate) - Date.parse(startDate)) / DAY_MS >= MAX_TRIP_DAYS)
    return `Keep a trip to ${MAX_TRIP_DAYS} days or fewer.`;
  return { origin, destination, startDate, endDate };
}

const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** Checks a plan item body against the trip it belongs to. Returns the cleaned input, or the message to show. */
export function parsePlanInput(
  body: Record<string, unknown>,
  trip: Pick<Trip, "startDate" | "endDate">,
): PlanInput | string {
  const title = text(body.title);
  const place = text(body.place);
  const note = text(body.note);
  const time = text(body.time) || null;
  const { date } = body;
  if (!title) return "Say what the plan is.";
  if (!isDay(date) || date < trip.startDate || date > trip.endDate) return "Pick a day within the trip.";
  if (time && !isTime(time)) return "Use a time like 14:30, or leave it empty.";
  if (title.length > 120 || place.length > 120 || note.length > 1000)
    return "That's too long. Keep the plan under 120 characters and the note under 1000.";
  return { date, time, title, place, note };
}
