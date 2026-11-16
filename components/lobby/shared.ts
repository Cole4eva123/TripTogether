import { useRef, useState } from "react";
import { errorText } from "@/lib/api";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const day = (value: string) => new Date(`${value}T00:00:00Z`);

/** A range of days, written once when it is a single day. */
export const dates = (start: string, end: string) =>
  end === start ? dateFmt.format(day(start)) : dateFmt.formatRange(day(start), day(end));

/** Runs one action at a time, keeping whether it is running and what went wrong. */
export function useRun() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // State lags a render behind, so a double click would see busy as false twice; the ref doesn't.
  const running = useRef(false);
  async function run(action: () => Promise<unknown>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try { await action(); }
    catch (e) { setError(errorText(e)); }
    finally { running.current = false; setBusy(false); }
  }
  return { busy, error, run };
}
