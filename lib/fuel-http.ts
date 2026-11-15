import { FuelError } from "./fuel-validation";

export async function providerJson<T>(url: string, label: string, init: RequestInit = {}, timeout = 45000): Promise<T> {
  try {
    const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeout) });
    if (!response.ok) {
      const hint = response.status === 429 ? " Too many requests; wait a minute before trying again." :
        response.status === 401 || response.status === 402 || response.status === 403 ? " Check the server's API key, balance and service access." : " Try again later.";
      throw new FuelError(`${label} returned HTTP ${response.status}.${hint}`,502);
    }
    return await response.json() as T;
  } catch (e) {
    if (e instanceof FuelError) throw e;
    throw new FuelError(`Could not reach ${label}. Check the server connection and try again.`,502);
  }
}
export function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.href : null; } catch { return null; }
}
