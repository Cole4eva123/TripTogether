"use client";

import { useState } from "react";
import { api, errorText } from "@/lib/api";
import { dayLabel, type PlanDay } from "@/lib/itinerary";
import type { PlanItem } from "@/lib/types";

/** Adds a plan to a day, or edits one (`item`). Any member can do either. */
export default function PlanForm({
  tripId,
  date,
  days,
  item,
  onDone,
  onCancel,
}: {
  tripId: string;
  date: string;
  days: PlanDay[];
  item?: PlanItem;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const f = (name: string) => `${item?.id ?? date}-${name}`; // field ids unique on the page

  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await (item
        ? api(`/trips/${tripId}/items/${item.id}`, "PATCH", body)
        : api(`/trips/${tripId}/items`, "POST", body));
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
      return;
    }
    await onDone(); // outside the try: the plan is saved, so a failed reload mustn't invite a duplicate resubmit
  }

  return (
    <form className="grid w-full gap-3.5 rounded-md border-2 border-green bg-white p-4" onSubmit={submit}>
      <div className="grid grid-cols-[minmax(0,1fr)_150px] gap-3 max-sm:grid-cols-1">
        <div className="grid content-start gap-1.5">
          <label htmlFor={f("date")}>Day</label>
          <select id={f("date")} name="date" defaultValue={date}>
            {days
              .filter((d) => d.n !== null)
              .map((d) => (
                <option key={d.date} value={d.date}>
                  Day {d.n}, {dayLabel(d.date)}
                </option>
              ))}
          </select>
        </div>
        <div className="grid content-start gap-1.5">
          <label htmlFor={f("time")}>
            Time <span className="text-[14px] text-muted">optional</span>
          </label>
          <input id={f("time")} name="time" type="time" defaultValue={item?.time ?? ""} />
        </div>
      </div>
      <div className="grid content-start gap-1.5">
        <label htmlFor={f("title")}>What</label>
        <input
          id={f("title")}
          name="title"
          defaultValue={item?.title}
          placeholder="Art Institute"
          maxLength={120}
          required
        />
      </div>
      <div className="grid content-start gap-1.5">
        <label htmlFor={f("place")}>
          Where <span className="text-[14px] text-muted">optional</span>
        </label>
        <input
          id={f("place")}
          name="place"
          defaultValue={item?.place}
          placeholder="111 S Michigan Ave"
          maxLength={120}
        />
      </div>
      <div className="grid content-start gap-1.5">
        <label htmlFor={f("note")}>
          Note <span className="text-[14px] text-muted">optional</span>
        </label>
        <textarea id={f("note")} name="note" defaultValue={item?.note} rows={2} maxLength={1000} />
      </div>
      {error && (
        <p className="font-semibold text-red" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button className="btn" disabled={busy}>
          {item ? "Save plan" : "Add plan"}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
