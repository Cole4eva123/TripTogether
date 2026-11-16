"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import BingoAdminLinks from "@/components/bingo/AdminLinks";
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
    <main className="mx-auto max-w-240 px-4 pt-4 pb-16">
      <h1>Your trips</h1>

      <div className="mt-6 flex flex-wrap items-start gap-x-8 gap-y-4">
        <Link href="/trips/new" className="btn mt-[29px] max-sm:mt-0">
          New trip
        </Link>
        <form className="grid max-w-90 flex-[1_1_280px] gap-1.5" onSubmit={join}>
          <label htmlFor="code" className="font-semibold text-muted">Or join one with a code</label>
          <div className="flex gap-2">
            <input
              id="code"
              name="code"
              className="font-bold tracking-[0.12em] uppercase placeholder:font-normal"
              placeholder="K7Q2MX"
              maxLength={6}
              autoComplete="off"
              spellCheck={false}
              required
            />
            <button className="btn btn-quiet" disabled={joining}>
              Join trip
            </button>
          </div>
          {joinError && (
            <p className="font-semibold text-red" role="alert">
              {joinError}
            </p>
          )}
        </form>
      </div>

      {loadError && (
        <p className="font-semibold text-red" role="alert">
          {loadError}
        </p>
      )}
      {trips?.length === 0 && (
        <p className="mt-10 max-w-[48ch] text-muted">
          No trips yet. Start one with <strong>New trip</strong>, or enter the invite code a friend sent you.
        </p>
      )}
      {!!trips?.length && (
        <ul className="road road-signs mt-20 max-w-180 gap-14">
          {trips.map((t) => (
            <li key={t.id}>
              <TripSign trip={t} href={`/trips/${t.id}`} />
            </li>
          ))}
        </ul>
      )}
      <BingoAdminLinks />
    </main>
  );
}
