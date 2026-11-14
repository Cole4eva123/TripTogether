"use client";

import Link from "next/link";
import { useLayoutEffect, useState } from "react";
import { errorText } from "@/lib/api";
import type { TripInput } from "@/lib/types";

/** Origin, destination and dates, for both creating and editing a trip. */
export default function TripForm({
  initial,
  submitLabel,
  cancelHref,
  onSave,
}: {
  initial?: TripInput;
  submitLabel: string;
  cancelHref: string;
  onSave: (input: TripInput) => Promise<void>;
}) {
  const [start, setStart] = useState(initial?.startDate ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Next keeps this page's state when you navigate away; drop a failed save's message when it does.
  useLayoutEffect(() => () => setError(""), []);

  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(Object.fromEntries(new FormData(e.currentTarget)) as TripInput);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="row2">
        <div className="field">
          <label htmlFor="origin">Starting from</label>
          <input id="origin" name="origin" defaultValue={initial?.origin} placeholder="Champaign, IL" required />
        </div>
        <div className="field">
          <label htmlFor="destination">Going to</label>
          <input
            id="destination"
            name="destination"
            defaultValue={initial?.destination}
            placeholder="Chicago, IL"
            required
          />
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="startDate">Leave on</label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="endDate">Back on</label>
          <input id="endDate" name="endDate" type="date" defaultValue={initial?.endDate} min={start} required />
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button className="btn" disabled={busy}>
          {submitLabel}
        </button>
        <Link href={cancelHref} className="btn btn-quiet">
          Cancel
        </Link>
      </div>
    </form>
  );
}
