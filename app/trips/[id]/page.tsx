"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMe } from "@/components/me";
import TripSign from "@/components/TripSign";
import { api, errorText } from "@/lib/api";
import type { Member, Trip } from "@/lib/types";

export default function TripPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const router = useRouter();
  const [data, setData] = useState<{ trip: Trip; members: Member[] } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api<{ trip: Trip; members: Member[] }>(`/trips/${id}`).then(setData, (e) => setError(errorText(e)));
  }, [id]);

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

  const { trip, members } = data;
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

      <div className="detail">
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
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions actions-end">
        {isOwner ? (
          <>
            <Link href={`/trips/${trip.id}/edit`} className="btn btn-quiet">
              Edit trip
            </Link>
            <button
              className="btn btn-danger"
              onClick={() =>
                removeAndExit(`Delete the trip to ${trip.destination} for everyone? This can't be undone.`, `/trips/${trip.id}`)
              }
            >
              Delete trip
            </button>
          </>
        ) : (
          <button
            className="btn btn-danger"
            onClick={() =>
              removeAndExit(`Leave the trip to ${trip.destination}? You'll need the code to rejoin.`, `/trips/${trip.id}/members/me`)
            }
          >
            Leave trip
          </button>
        )}
      </div>
    </main>
  );
}
