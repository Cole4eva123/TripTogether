import type { FuelGrade, Price, Source, Station } from "./types.ts";

export function quoteDate(value: unknown, maxAgeHours = 72, now = Date.now()): string | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now + 3600000 && now - time <= maxAgeHours * 3600000 ? new Date(time).toISOString() : null;
}
function sourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}
const addressKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Research must identify the station and grade explicitly; a regional price can never pass this gate. */
export function parseStationQuote(raw: unknown, stations: Pick<Station, "id" | "address">[], grade: FuelGrade, sources: Source[], now = Date.now()): { id: string; price: Price } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  const station = stations.find(station => station.id === entry.id);
  if (!station || !station.address.trim() || typeof entry.address !== "string" || addressKey(entry.address) !== addressKey(station.address) || entry.fuelGrade !== grade) return null;
  const url = sourceUrl(entry.sourceUrl), source = sources.find(source => sourceUrl(source.url) === url);
  const observedAt = quoteDate(entry.observedAt, 72, now);
  if (!url || !source || !observedAt || typeof entry.pricePerGallon !== "number" || !Number.isFinite(entry.pricePerGallon) || entry.pricePerGallon < 0.5 || entry.pricePerGallon > 15) return null;
  return { id: station.id, price: { perGallon: entry.pricePerGallon, source, observedAt } };
}
