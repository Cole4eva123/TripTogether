import type { FuelGrade, RegionPrice } from "./types.ts";

export const EIA_PRICE_ENDPOINT = "https://api.eia.gov/v2/petroleum/pri/gnd/data/";
// These are state facets in this dataset; cities, US and PADD regions are intentionally excluded.
export const EIA_STATE_AREAS = ["SCA", "SCO", "SFL", "SMA", "SMN", "SNY", "SOH", "STX", "SWA"] as const;
export const EIA_PRODUCTS: Record<FuelGrade, string> = { regular: "EPMR", midgrade: "EPMM", premium: "EPMP", diesel: "EPD2D" };

export function eiaPriceUrl(key: string, grade: FuelGrade, now = Date.now()): string {
  const url = new URL(EIA_PRICE_ENDPOINT);
  const values = {
    api_key: key, frequency: "weekly", "data[0]": "value", "facets[product][0]": EIA_PRODUCTS[grade],
    "facets[process][0]": "PTE", start: new Date(now - 8 * 86400000).toISOString().slice(0, 10),
    end: new Date(now).toISOString().slice(0, 10), "sort[0][column]": "period", "sort[0][direction]": "desc", length: "200",
  };
  for (const [name, value] of Object.entries(values)) url.searchParams.set(name, value);
  EIA_STATE_AREAS.forEach((area, index) => url.searchParams.set(`facets[duoarea][${index}]`, area));
  return url.href;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parseEiaStatePrices(value: unknown, grade: FuelGrade, now = Date.now()): RegionPrice[] {
  const body = record(value), response = record(body?.response);
  if (body?.error || response?.frequency !== "weekly" || !Array.isArray(response.data)) return [];
  const reports = new Map<string, RegionPrice>();
  for (const raw of response.data) {
    const row = record(raw);
    if (!row || typeof row.duoarea !== "string" || !EIA_STATE_AREAS.some(area => area === row.duoarea)) continue;
    const state = row.duoarea.slice(1), product = EIA_PRODUCTS[grade];
    const series = `${grade === "diesel" ? "EMD" : "EMM"}_${product}_PTE_${row.duoarea}_DPG`;
    if (row.product !== product || row.process !== "PTE" || row.series !== series || row.units !== "$/GAL") continue;
    if (typeof row.period !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.period)) continue;
    const time = Date.parse(row.period);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== row.period || now - time > 7 * 86400000 || time - now > 86400000) continue;
    if (typeof row.value !== "number" && (typeof row.value !== "string" || !row.value.trim())) continue;
    const price = Number(row.value);
    if (!Number.isFinite(price) || price < 0.5 || price > 15) continue;
    const previous = reports.get(state);
    if (previous && Date.parse(previous.observedAt!) >= time) continue;
    reports.set(state, {
      state, average: price, count: 0, kind: "regional report", observedAt: new Date(time).toISOString(), change: null,
      source: { title: `EIA weekly ${grade} state average`, url: `https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=${series}&f=W` },
    });
  }
  return [...reports.values()];
}

/** EIA state reports win for their states; no regional/national report is assigned to another state. */
export function mergeStateReports(primary: RegionPrice[], fallback: RegionPrice[], requestedStates?: string[]): RegionPrice[] {
  const result = new Map(primary.map(report => [report.state, report]));
  for (const report of fallback) if (!result.has(report.state)) result.set(report.state, report);
  return [...result.values()].filter(report => !requestedStates || requestedStates.includes(report.state));
}
