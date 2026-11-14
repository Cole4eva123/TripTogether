"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import TripSign from "@/components/TripSign";
import { api, errorText } from "@/lib/api";
import type { Trip } from "@/lib/types";

export default function TripsPage() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

  // Next keeps this page's state when you navigate away; drop a failed join's message when it does.
  useLayoutEffect(() => () => setJoinError(""), []);

  useEffect(() => {
    api<{ trips: Trip[] }>("/trips").then(
      ({ trips }) => {
        setTrips(trips);
        setLoadError(""); // Next may restore this page with an error from an earlier visit
      },
      (e) => setLoadError(errorText(e)),
    );
  }, []);

  async function join(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setJoining(true);
    setJoinError("");
    try {
      const code = new FormData(e.currentTarget).get("code");
      const { trip } = await api<{ trip: Trip }>("/trips/join", "POST", { code });
      router.push(`/trips/${trip.id}`);
    } catch (err) {
      setJoinError(errorText(err));
      setJoining(false);
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1>Your trips</h1>
        <Link href="/trips/new" className="btn">
          New trip
        </Link>
      </div>

      <form className="join" onSubmit={join}>
        <label htmlFor="code">Got an invite code?</label>
        <div className="join-row">
          <input
            id="code"
            name="code"
            className="code-input"
            placeholder="K7Q2MX"
            maxLength={6}
            autoComplete="off"
            spellCheck={false}
            required
          />
          <button className="btn" disabled={joining}>
            Join trip
          </button>
        </div>
        {joinError && (
          <p className="error" role="alert">
            {joinError}
          </p>
        )}
      </form>

      {loadError && (
        <p className="error" role="alert">
          {loadError}
        </p>
      )}
      {trips?.length === 0 && (
        <p className="empty">
          No trips yet. Start one with <strong>New trip</strong>, or enter the invite code a friend sent you.
        </p>
      )}
      {!!trips?.length && (
        <ul className="road road-signs">
          {trips.map((t) => (
            <li key={t.id}>
              <TripSign trip={t} href={`/trips/${t.id}`} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
