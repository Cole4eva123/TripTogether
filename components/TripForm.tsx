"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import PlaceField from "@/components/PlaceField";
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
  const [origin, setOrigin] = useState(initial?.origin ?? "");
  const [destination, setDestination] = useState(initial?.destination ?? "");
  const [start, setStart] = useState(initial?.startDate ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const initialStart = initial?.startDate ?? "";
  const initialOrigin = initial?.origin ?? "";
  const initialDestination = initial?.destination ?? "";

  // Next keeps this page's state when you navigate away: a successful save leaves still busy and filled in,
  // a failed one leaves its message. Reset all of it when the page is hidden so it comes back fresh.
  useLayoutEffect(() => {
    const form = formRef.current;
    return () => {
      form?.reset();
      setStart(initialStart);
      setOrigin(initialOrigin);
      setDestination(initialDestination);
      setError("");
      setBusy(false);
    };
  }, [initialStart, initialOrigin, initialDestination]);

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
    <form ref={formRef} className="mt-2 grid gap-5" onSubmit={submit}>
      <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
        <div className="grid content-start gap-1.5">
          <label htmlFor="origin">Starting from</label>
          <PlaceField id="origin" name="origin" value={origin} onChange={setOrigin} placeholder="Champaign" />
        </div>
        <div className="grid content-start gap-1.5">
          <label htmlFor="destination">Going to</label>
          <PlaceField id="destination" name="destination" value={destination} onChange={setDestination} placeholder="Chicago" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
        <div className="grid content-start gap-1.5">
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
        <div className="grid content-start gap-1.5">
          <label htmlFor="endDate">Back on</label>
          <input id="endDate" name="endDate" type="date" defaultValue={initial?.endDate} min={start} required />
        </div>
      </div>
      {error && (
        <p className="font-semibold text-red" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
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
