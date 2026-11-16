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
      <main className="mx-auto max-w-240 px-4 pt-4 pb-16">
        {error && (
          <>
            <p className="font-semibold text-red" role="alert">
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
    <main className="mx-auto max-w-240 px-4 pt-4 pb-16">
      <Link href="/trips" className="mb-14 inline-block">
        Back to your trips
      </Link>
      <TripSign trip={trip} />
      <Link
        href={`/trips/route-planner?${new URLSearchParams({ origin: trip.origin, destination: trip.destination, startDate: trip.startDate })}`}
        className="btn btn-quiet btn-small mt-4 mr-3"
      >
        Plan fuel stops
      </Link>
      {isOwner && (
        <Link href={`/trips/${trip.id}/edit`} className="btn btn-quiet btn-small mt-4">
          Edit trip
        </Link>
      )}

      <div className="mt-12 grid grid-cols-[minmax(0,1fr)_280px] gap-14 max-md:grid-cols-1 max-md:gap-10">
        <Itinerary trip={trip} items={items} onChange={load} />

        <aside className="grid content-start gap-9">
          <section className="grid justify-items-start gap-3">
            <h2>Take a surprise detour</h2>
            <p className="text-muted">Share hidden ideas and draw a mystery itinerary within your budget and time.</p>
            <Link href={`/trips/${trip.id}/lottery-box`} className="btn btn-quiet">Open travel lottery box</Link>
          </section>

          <section className="grid justify-items-start gap-3">
            <h2>Travelers</h2>
            <ul className="w-full">
              {members.map((m) => (
                <li key={m.id} className="flex justify-between gap-3 border-b border-line py-2.5">
                  <span>
                    {m.name}
                    {m.id === me.id && <span className="text-muted"> (you)</span>}
                  </span>
                  {m.id === trip.ownerId && <span className="text-muted">Organizer</span>}
                </li>
              ))}
            </ul>
            <Link href={`/trips/${trip.id}/chat`} className="btn btn-small justify-self-start">
              Open the chat group
            </Link>
          </section>

          <section className="grid justify-items-start gap-3">
            <h2>Invite your group</h2>
            <p className="text-muted">Send this code to friends. They enter it on their trips page to join.</p>
            <p className="text-[36px] leading-[1.1] font-extrabold tracking-[0.12em]">{trip.inviteCode}</p>
            <button className="btn btn-quiet" onClick={copyCode}>
              {copied ? "Copied" : "Copy code"}
            </button>
          </section>

          <section className="grid justify-items-start gap-3">
            <h2>Travel Bingo</h2>
            <p className="text-muted">Draw a card of things to do in {trip.destination} and check them off together.</p>
            <Link href={`/trips/${trip.id}/bingo`} className="btn btn-quiet">
              Open Bingo card
            </Link>
          </section>

          {error && (
            <p className="font-semibold text-red" role="alert">
              {error}
            </p>
          )}
          <section className="grid justify-items-start gap-3 border-t border-line pt-4">
            {isOwner ? (
              <button
                className="link-btn text-red"
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
                className="link-btn text-red"
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
