"use client";

import { useEffect, useState } from "react";
import { resultValidity, type DistanceUnit } from "@/lib/gasoline-intelligence/display";
import type { FuelGrade } from "@/lib/gasoline-intelligence/types";

type Props = {
  count: number;
  grade: FuelGrade;
  expiresAt: string;
  distanceUnit: DistanceUnit;
  onDistanceUnitChange: (unit: DistanceUnit) => void;
};

function SearchValidity({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  return <span role="timer" aria-live="off">{now === null ? "Results valid" : resultValidity(expiresAt, now)}</span>;
}

export default function FuelSearchBar({ count, grade, expiresAt, distanceUnit, onDistanceUnitChange }: Props) {
  return <div className="flex items-center justify-between gap-3">
    <p className="min-w-0 flex-1 text-[14px] text-muted">
      {count} nearby candidates · {grade} fuel · <SearchValidity expiresAt={expiresAt} />
    </p>
    <fieldset className="shrink-0">
      <legend className="sr-only">Distance unit</legend>
      <div className="relative inline-grid grid-cols-2 rounded-full border border-green bg-white p-1">
        <span aria-hidden="true" className={`pointer-events-none absolute inset-y-1 left-1 w-[calc((100%_-_8px)/2)] rounded-full bg-green transition-transform duration-200 motion-reduce:transition-none ${distanceUnit === "km" ? "translate-x-full" : "translate-x-0"}`} />
        {(["mi", "km"] as const).map(unit => <label key={unit} className="relative grid h-8 w-11 cursor-pointer">
          <input className="peer sr-only" type="radio" name="fuel-distance-unit" value={unit} checked={distanceUnit === unit} onChange={() => onDistanceUnitChange(unit)} />
          <span className="grid h-full w-full place-items-center rounded-full text-[13px] font-semibold text-green peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-asphalt">{unit}</span>
        </label>)}
      </div>
    </fieldset>
  </div>;
}
