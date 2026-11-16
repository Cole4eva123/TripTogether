"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { Trip } from "@/lib/types";
import { useRun } from "./shared";

/** Shares one of the trips the reader organizes, and hasn't shared yet, in the lobby. */
export default function PublishForm({
  trips,
  onPublished,
}: {
  trips: Trip[];
  onPublished: () => Promise<void>;
}) {
  const [tripId, setTripId] = useState("");
  const [note, setNote] = useState("");
  const { busy, error, run } = useRun();

  const chosen = trips.some((trip) => trip.id === tripId) ? tripId : trips[0]?.id ?? "";

  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!chosen) return;
    void run(async () => {
      await api("/lobby", "POST", { tripId: chosen, note: note.trim() });
      setTripId("");
      setNote("");
      await onPublished();
    });
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid content-start gap-1.5">
        <label htmlFor="tripId" className="text-[14px] text-muted">
          Trip to share
        </label>
        <select
          id="tripId"
          name="tripId"
          value={chosen}
          disabled={busy}
          onChange={(e) => setTripId(e.target.value)}
          required
        >
          {trips.map((t) => (
            <option key={t.id} value={t.id}>
              {`${t.destination} · ${t.startDate} to ${t.endDate}`}
            </option>
          ))}
        </select>
      </div>
      <div className="grid content-start gap-1.5">
        <label htmlFor="note" className="text-[14px] text-muted">
          A note for other groups
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
      <p className="text-[13px] text-muted">Keep names and contact details for the group chat.</p>
      {error && (
        <p className="font-semibold text-red" role="alert">
          {error}
        </p>
      )}
      <div>
        <button className="btn btn-small" disabled={busy}>
          Share in the lobby
        </button>
      </div>
    </form>
  );
}
