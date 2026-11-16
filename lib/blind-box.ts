import { categories, type BlindBoxOption, type BlindBoxOptionInput, type BlindBoxResult, type BlindBoxSettings } from "./blind-box-types.ts";
import { parsePlanInput } from "./validate.ts";
import type { Trip } from "./types.ts";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const money = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10000 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;
const integer = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
export const timeMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function parseBlindBoxSettings(body: Record<string, unknown>, trip: Pick<Trip, "startDate" | "endDate">): BlindBoxSettings | string {
  const destination = text(body.destination);
  if (!destination || destination.length > 120) return "Enter a destination of up to 120 characters.";
  const plan = parsePlanInput({ date: body.date, time: body.startTime, title: "Mystery itinerary" }, trip);
  if (typeof plan === "string") return plan;
  if (!plan.time) return "Pick a start time.";
  if (!money(body.budget)) return "Enter an activity budget from $0 to $10,000, with up to two decimal places.";
  if (!integer(body.availableMinutes, 15, 720)) return "Choose 15 to 720 available minutes.";
  if (timeMinutes(plan.time) + body.availableMinutes > 1440) return "Keep the available time within the selected day.";
  if (!integer(body.maxStops, 1, 5)) return "Choose 1 to 5 stops.";
  if (!Array.isArray(body.preferences) || !body.preferences.length || body.preferences.some((p) => !categories.includes(p))) return "Choose at least one activity preference.";
  return { destination, date: plan.date, startTime: plan.time, budget: body.budget, availableMinutes: body.availableMinutes, maxStops: body.maxStops, preferences: [...new Set(body.preferences)] };
}

export function parseBlindBoxOption(body: Record<string, unknown>): BlindBoxOptionInput | string {
  const title = text(body.title), place = text(body.place), note = text(body.note);
  if (!title || title.length > 120) return "Enter an activity title of up to 120 characters.";
  if (!place || place.length > 120) return "Enter a place of up to 120 characters.";
  if (note.length > 500) return "Keep the note under 500 characters.";
  if (!categories.includes(body.category as BlindBoxOptionInput["category"])) return "Choose an activity category.";
  if (!money(body.cost)) return "Enter a cost from $0 to $10,000, with up to two decimal places.";
  if (!integer(body.durationMinutes, 15, 720)) return "Choose an activity duration of 15 to 720 minutes.";
  return { title, place, note, category: body.category as BlindBoxOptionInput["category"], cost: body.cost, durationMinutes: body.durationMinutes };
}

// Match a city or the same city followed by a region, without matching unrelated substrings.
export function destinationKey(destination: string) {
  const key = destination.normalize("NFKC").trim().toLowerCase().split(/[,，]/)[0].trim().replace(/\s+/g, " ");
  return ({ nyc: "new york", "new york city": "new york", sf: "san francisco", "芝加哥": "chicago", "纽约": "new york", "旧金山": "san francisco" } as Record<string, string>)[key] ?? key;
}

export function eligibleOptions(settings: BlindBoxSettings, options: BlindBoxOption[]) {
  return options.filter((option) => destinationKey(option.destination) === destinationKey(settings.destination) && settings.preferences.includes(option.category) && Math.round(option.cost * 100) <= Math.round(settings.budget * 100) && option.durationMinutes <= settings.availableMinutes);
}

/** Shuffle eligible candidates, then take up to maxStops within the combined limits. */
export function drawBlindBox(settings: BlindBoxSettings, options: BlindBoxOption[], randomIndex = (max: number) => Math.floor(Math.random() * max)): BlindBoxResult | null {
  const pool = [...eligibleOptions(settings, options)];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const stops: BlindBoxResult["stops"] = [];
  const seen = new Set<string>();
  let cents = 0, minutes = 0;
  for (const option of pool) {
    const key = `${option.title.trim().toLowerCase()}|${option.place.trim().toLowerCase()}`;
    const gap = stops.length ? 15 : 0;
    const nextCost = cents + Math.round(option.cost * 100);
    if (seen.has(key) || nextCost > Math.round(settings.budget * 100) || minutes + gap + option.durationMinutes > settings.availableMinutes) continue;
    stops.push({ ...option, time: clock(timeMinutes(settings.startTime) + minutes + gap) });
    seen.add(key);
    cents = nextCost;
    minutes += gap + option.durationMinutes;
    if (stops.length === settings.maxStops) break;
  }
  return stops.length ? { stops, totalCost: cents / 100, totalMinutes: minutes } : null;
}
