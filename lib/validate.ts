import type { PlanInput, Trip, TripInput } from "./types.ts";

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

// --- Lobby and matching (feature 2) ---

/** What a body says when publishing a trip to the lobby. */
export type PublishInput = { tripId: string; note: string };

/** Checks a publish body. Returns the cleaned input, or the message to show the user. */
export function parsePublishInput(body: Record<string, unknown>): PublishInput | string {
  const tripId = text(body.tripId);
  const note = text(body.note);
  if (!tripId) return "Pick a trip to publish.";
  if (note.length > 500) return "Keep your note under 500 characters.";
  return { tripId, note };
}

/** What a body says when asking to join a trip in the lobby. */
export type JoinRequestInput = { postId: string; message: string };

/**
 * Checks a join-request body. Returns the cleaned input, or the message to show the user.
 *
 * The message is optional: a person may ask to join a trip without saying anything, and the trip's owner
 * can read the card in the lobby to see who they are.
 */
export function parseJoinRequestInput(body: Record<string, unknown>): JoinRequestInput | string {
  const postId = text(body.postId);
  const message = text(body.message);
  if (!postId) return "Pick a trip in the lobby to ask about.";
  if (message.length > 500) return "Keep your message under 500 characters.";
  return { postId, message };
}

/** Checks a chat body. Returns the cleaned text, or the message to show the user. */
export function parseChatInput(body: Record<string, unknown>): string | { body: string } {
  const message = text(body.body);
  if (!message) return "Write something first.";
  if (message.length > 2000) return "That's too long. Keep a message under 2000 characters.";
  return { body: message };
}
