"use client";

import Link from "next/link";
import { useState } from "react";
import { BINGO_SIZES, DEFAULT_SIZE } from "@/lib/bingo";
import type { BingoRegion } from "@/lib/bingo-types";

/** Picks a region and a card size, and draws. A region without enough tasks for a size can't be picked for it. */
export default function DrawForm({
  regions,
  initialRegion,
  label,
  busy,
  onDraw,
}: {
  regions: BingoRegion[];
  initialRegion: string | null;
  label: string;
  busy: boolean;
  onDraw: (region: string, size: number) => void;
}) {
  const [region, setRegion] = useState(initialRegion ?? "");
  const [size, setSize] = useState<number>(DEFAULT_SIZE);
  const count = regions.find((r) => r.region === region)?.taskCount ?? 0;
  const tooFew = region !== "" && count < size * size;

  return (
    <form
      className="grid max-w-[60ch] gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onDraw(region, size);
      }}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 max-sm:grid-cols-1">
        <div className="grid content-start gap-1.5">
          <label htmlFor="bingo-region">Region</label>
          <select id="bingo-region" value={region} onChange={(e) => setRegion(e.target.value)} required>
            <option value="">Choose a region</option>
            {regions.map((r) => (
              <option key={r.region} value={r.region}>
                {r.region} · {r.taskCount} tasks
              </option>
            ))}
          </select>
        </div>
        <div className="grid content-start gap-1.5">
          <label htmlFor="bingo-size">Card size</label>
          <select id="bingo-size" value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {BINGO_SIZES.map((s) => (
              <option key={s} value={s}>
                {s} × {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      {tooFew && (
        <p className="text-muted">
          {region} has {count} tasks, and a {size} × {size} card needs {size * size}. Pick a smaller card, or{" "}
          <Link href={`/trips/bingo/tasks?region=${encodeURIComponent(region)}`}>add tasks for {region}</Link>.
        </p>
      )}
      <div>
        <button className="btn" disabled={busy || !region || tooFew}>
          {label}
        </button>
      </div>
    </form>
  );
}
