"use client";

import { useState } from "react";
import { api, errorText } from "@/lib/api";
import { hasEnded } from "@/lib/dates";
import type { Trip } from "@/lib/types";

/** The form that publishes one of the reader's trips to the lobby. */
export default function PublishForm({
  trips,
  publishedTripIds,
  onPublished,
}: {
  trips: Trip[];
  publishedTripIds: string[];
  onPublished: () => Promise<void>;
}) {
  const [tripId, setTripId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const unpublished = trips.filter((t) => !publishedTripIds.includes(t.id) && !hasEnded(t.endDate));
  const chosen = unpublished.some((trip) => trip.id === tripId) ? tripId : unpublished[0]?.id ?? "";

  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !chosen) return;
    setBusy(true);
    setError("");
    try {
      await api("/lobby", "POST", { tripId: chosen, note: note.trim() });
      setTripId("");
      setNote("");
      await onPublished();
    } catch (err) {
      setError(errorText(err));
    } finally {
      // The button has to come back either way, or publishing one trip locks the form for good.
      setBusy(false);
    }
  }

  if (!unpublished.length) {
    return (
      <p className="max-w-[60ch] text-muted">
        {trips.length
          ? "No upcoming unpublished trips."
          : "You have no trips yet. Make one on your trips page, then publish it here."}
      </p>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid content-start gap-1.5">
        <label htmlFor="tripId" className="text-[12px] font-semibold text-muted">
          Which trip are you publishing?
        </label>
        <select
          id="tripId"
          name="tripId"
          value={chosen}
          disabled={busy}
          onChange={(e) => setTripId(e.target.value)}
          required
        >
          {unpublished.map((t) => (
            <option key={t.id} value={t.id}>
              {`${t.destination} · ${t.startDate} to ${t.endDate}`}
            </option>
          ))}
        </select>
      </div>
      <div className="grid content-start gap-1.5">
        <label htmlFor="note" className="text-[12px] font-semibold text-muted">
          Tell other groups about it
        </label>
        <textarea
          id="note"
          name="note"
          rows={2}
          maxLength={500}
          disabled={busy}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Travel style, interests, or a little about your plans."
        />
      </div>
      <p className="text-[11px] leading-relaxed text-muted">Keep names and contact details for the group chat.</p>
      {error && (
        <p className="font-semibold text-red" role="alert">
          {error}
        </p>
      )}
      <div>
        <button className="btn" disabled={busy}>
          Publish to the lobby
        </button>
      </div>
    </form>
  );
}
