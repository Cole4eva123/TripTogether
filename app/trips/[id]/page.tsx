"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Itinerary from "@/components/Itinerary";
import { useMe } from "@/components/me";
import TripSign from "@/components/TripSign";
import { api, errorText } from "@/lib/api";
import type { Member, PlanItem, Trip } from "@/lib/types";

type TripData = { trip: Trip; members: Member[]; items: PlanItem[] };

export default function TripPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const router = useRouter();
  const [data, setData] = useState<TripData | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // Also reloads after an itinerary change, so plans added by others show up too.
  const load = useCallback(
    () =>
      api<TripData>(`/trips/${id}`).then((d) => {
        setData(d);
        setError(""); // Next may restore this page with an error from an earlier visit
      }),
    [id],
  );

  useEffect(() => {
    load().catch((e) => setError(errorText(e)));
  }, [load]);

  if (!data || !me)
    return (
      <main className="page">
        {error && (
          <>
            <p className="error" role="alert">
              {error}
            </p>
            <Link href="/trips">Back to your trips</Link>
          </>
        )}
      </main>
    );

  const { trip, members, items } = data;
  const isOwner = trip.ownerId === me.id;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(trip.inviteCode);
      setCopied(true);
    } catch {
      setError("Couldn't copy here. Select the code above and copy it yourself.");
    }
  }

  async function removeAndExit(confirmText: string, path: string) {
    if (!confirm(confirmText)) return;
    try {
      await api(path, "DELETE");
      router.replace("/trips");
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <main className="page">
      <Link href="/trips" className="back">
        Back to your trips
      </Link>
      <TripSign trip={trip} />
      {isOwner && (
        <Link href={`/trips/${trip.id}/edit`} className="btn btn-quiet btn-small trip-edit">
          Edit trip
        </Link>
      )}

      <div className="trip-layout">
        <Itinerary trip={trip} items={items} onChange={load} />

        <aside className="trip-side">
          <section>
            <h2>Travelers</h2>
            <ul className="members">
              {members.map((m) => (
                <li key={m.id}>
                  <span>
                    {m.name}
                    {m.id === me.id && <span className="muted"> (you)</span>}
                  </span>
                  {m.id === trip.ownerId && <span className="muted">Organizer</span>}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2>Invite your group</h2>
            <p className="muted">Send this code to friends. They enter it on their trips page to join.</p>
            <p className="code">{trip.inviteCode}</p>
            <button className="btn btn-quiet" onClick={copyCode}>
              {copied ? "Copied" : "Copy code"}
            </button>
          </section>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <section className="trip-exit">
            {isOwner ? (
              <button
                className="link-btn link-danger"
                onClick={() =>
                  removeAndExit(
                    `Delete the trip to ${trip.destination} for everyone? This can't be undone.`,
                    `/trips/${trip.id}`,
                  )
                }
              >
                Delete trip
              </button>
            ) : (
              <button
                className="link-btn link-danger"
                onClick={() =>
                  removeAndExit(
                    `Leave the trip to ${trip.destination}? You'll need the code to rejoin.`,
                    `/trips/${trip.id}/members/me`,
                  )
                }
              >
                Leave trip
              </button>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
