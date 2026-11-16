"use client";

import type { LobbyFilters, Trip } from "@/lib/types";

type Props = {
  query: string;
  from: string;
  to: string;
  sort: LobbyFilters["sort"];
  against: string;
  /** The reader's trips the others can be compared with. */
  trips: Trip[];
  onQuery: (value: string) => void;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onSort: (value: LobbyFilters["sort"]) => void;
  onAgainst: (tripId: string) => void;
  onReset: () => void;
};

const sorts: Record<LobbyFilters["sort"], string> = {
  closest: "Closest match first",
  soonest: "Leaving soonest",
  "soonest-end": "Back soonest",
};

const field = "grid min-w-0 gap-1 text-[14px] text-muted";

/** Narrows down everyone else's trips: a search, a window of dates, which trip to compare with, and the order. */
export default function LobbyFiltersBar(p: Props) {
  const active = !!(p.query || p.from || p.to || p.against || p.sort !== "closest");
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className={`${field} flex-[2_1_180px]`}>
        Search
        <input type="search" placeholder="Destination, departure city or note" value={p.query} onChange={(e) => p.onQuery(e.target.value)} />
      </label>
      <label className={`${field} flex-[1_1_130px]`}>
        Earliest date
        <input type="date" value={p.from} max={p.to || undefined} onChange={(e) => p.onFrom(e.target.value)} />
      </label>
      <label className={`${field} flex-[1_1_130px]`}>
        Latest date
        <input type="date" value={p.to} min={p.from || undefined} onChange={(e) => p.onTo(e.target.value)} />
      </label>
      {p.trips.length > 1 && (
        <label className={`${field} flex-[1_1_170px]`}>
          Compare with
          <select value={p.against} onChange={(e) => p.onAgainst(e.target.value)}>
            <option value="">Whichever of my trips fits best</option>
            {p.trips.map((trip) => <option key={trip.id} value={trip.id}>{`${trip.destination}, from ${trip.startDate}`}</option>)}
          </select>
        </label>
      )}
      <label className={`${field} flex-[1_1_160px]`}>
        Order
        <select value={p.sort} onChange={(e) => p.onSort(e.target.value as LobbyFilters["sort"])}>
          {Object.entries(sorts).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
        </select>
      </label>
      {active && <button type="button" className="link-btn mb-2.5 text-[14px]" onClick={p.onReset}>Clear filters</button>}
    </div>
  );
}
