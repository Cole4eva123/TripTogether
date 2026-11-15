"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMe } from "@/components/me";
import TripForm from "@/components/TripForm";
import { api, errorText } from "@/lib/api";
import type { Trip } from "@/lib/types";

export default function EditTripPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const me = useMe();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ trip: Trip }>(`/trips/${id}`).then(
      ({ trip }) => {
        setTrip(trip);
        setError(""); // Next may restore this page with an error from an earlier visit
      },
      (e) => setError(errorText(e)),
    );
  }, [id]);

  const notOwner = trip && me && trip.ownerId !== me.id;

  return (
    <main className="mx-auto max-w-240 px-4 pt-4 pb-16 grid content-start gap-4 *:max-w-140">
      <h1>Edit trip</h1>
      {error && (
        <>
          <p className="font-semibold text-red" role="alert">
            {error}
          </p>
          <Link href="/trips">Back to your trips</Link>
        </>
      )}
      {notOwner && (
        <p className="text-muted">
          Only the organizer can edit this trip. <Link href={`/trips/${id}`}>Back to the trip</Link>
        </p>
      )}
      {trip && me && !notOwner && (
        <TripForm
          initial={trip}
          submitLabel="Save changes"
          cancelHref={`/trips/${id}`}
          onSave={async (input) => {
            await api(`/trips/${id}`, "PATCH", input);
            router.push(`/trips/${id}`);
          }}
        />
      )}
    </main>
  );
}
