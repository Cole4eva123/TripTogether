"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ChatPanel from "@/components/lobby/ChatPanel";
import { useMe } from "@/components/me";
import { api, errorText } from "@/lib/api";
import type { Member, Trip } from "@/lib/types";

/** The chat group of a trip. Everyone in the trip is in it. */

/** How often the trip is fetched again, in milliseconds. */
const POLL_MS = 5000;

type TripData = { trip: Trip; members: Member[] };

export default function TripChatPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const [data, setData] = useState<TripData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      api<TripData>(`/trips/${id}`).then((d) => {
        setData(d);
        setError("");
      }),
    [id],
  );

  useEffect(() => {
    load().catch((e) => setError(errorText(e)));
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      load().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // The session is still being checked, or the trip hasn't arrived yet. Show that, rather than nothing:
  // a blank page reads as a broken app.
  if (!me || !data || data.trip.id !== id) {
    return (
      <main className="mx-auto grid max-w-240 gap-6 px-4 pt-4 pb-16">
        <p>
          <Link href="/trips" className="link-btn">
            Back to your trips
          </Link>
        </p>
        {error ? (
          <p className="font-semibold text-red" role="alert">
            {error}
          </p>
        ) : (
          <p className="text-muted">Loading the conversation…</p>
        )}
      </main>
    );
  }

  const { trip, members } = data;
  const names = members.length
    ? members.map((m) => (m.id === me.id ? `${m.name} (you)` : m.name)).join(", ")
    : "no one yet";

  return (
    <main className="mx-auto grid max-w-240 gap-6 px-4 pt-4 pb-16">
      <header className="grid gap-3">
        <p>
          <Link href={`/trips/${trip.id}`} className="link-btn">
            Back to the trip
          </Link>
        </p>
        <h1>{`Chat · ${trip.destination}`}</h1>
        {/* Who is in the trip, so the reader knows who they are talking to. Everyone in the trip is in
            this conversation, because the trip is the chat group. */}
        <p className="text-muted">{`In this trip: ${names}.`}</p>
        <p className="text-muted">Work out the details here, then agree on the plan.</p>
      </header>

      {error && (
        <p className="font-semibold text-red" role="alert">
          {error}
        </p>
      )}

      <ChatPanel tripId={trip.id} meId={me.id} onError={setError} />
    </main>
  );
}
