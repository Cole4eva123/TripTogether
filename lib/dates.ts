// The days a trip covers, and the days two trips share.
//
// Dates in the app are plain `YYYY-MM-DD` strings with no time and no time zone, so everything here works in
// UTC and never shifts a day because of where the reader is sitting. A trip from the 27th to the 30th is
// four days, whichever way round the world you read it from.

const DAY_MS = 86_400_000;

/** The date `days` after `date`, or before it when `days` is negative. */
export const addDays = (date: string, days: number) =>
  new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);

/** Today, in UTC. */
export const today = () => new Date().toISOString().slice(0, 10);

/** How many days a trip covers, counting both ends. */
export const tripLength = (start: string, end: string) =>
  Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS) + 1;

/** A stretch of dates, the way a trip is written down. */
export type DateRange = { startDate: string; endDate: string };

/**
 * The window two trips share, or null when they share nothing. The window is the days that overlap, not the
 * days in between: two trips that start on the 27th and the 30th share the 30th, even though a week is
 * between them.
 */
export function sharedWindow(a: DateRange, b: DateRange): (DateRange & { days: number }) | null {
  const startDate = a.startDate > b.startDate ? a.startDate : b.startDate;
  const endDate = a.endDate < b.endDate ? a.endDate : b.endDate;
  if (endDate < startDate) return null;
  return { startDate, endDate, days: tripLength(startDate, endDate) };
}

/** True when a trip is over: its last day has passed. */
export const hasEnded = (end: string, on = today()) => end < on;
