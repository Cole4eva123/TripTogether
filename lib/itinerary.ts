import type { PlanItem, Trip } from "./types";

/** A day on the itinerary. `n` is its day number in the trip, or null when it falls outside the trip's dates. */
export type PlanDay = { date: string; n: number | null; items: PlanItem[] };

const DAY_MS = 86_400_000;
const addDay = (d: string) => new Date(Date.parse(d) + DAY_MS).toISOString().slice(0, 10);

/**
 * Every day of the trip, plus any day an item still sits on outside the trip's dates (left behind when the
 * organizer moved the dates), in date order. Within a day, "any time" items come first, then by time.
 */
export function planDays(trip: Pick<Trip, "startDate" | "endDate">, items: PlanItem[]): PlanDay[] {
  const dates = new Set<string>();
  for (let d = trip.startDate; d <= trip.endDate; d = addDay(d)) dates.add(d);
  for (const item of items) dates.add(item.date);
  return [...dates].sort().map((date) => ({
    date,
    n:
      date < trip.startDate || date > trip.endDate
        ? null
        : (Date.parse(date) - Date.parse(trip.startDate)) / DAY_MS + 1,
    items: items.filter((i) => i.date === date).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")),
  }));
}

const dayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** "Fri, Nov 27" from YYYY-MM-DD. */
export const dayLabel = (d: string) => dayFmt.format(new Date(`${d}T00:00:00Z`));
