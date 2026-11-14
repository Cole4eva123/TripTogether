"use client";

import { useRouter } from "next/navigation";
import TripForm from "@/components/TripForm";
import { api } from "@/lib/api";
import type { Trip } from "@/lib/types";

export default function NewTripPage() {
  const router = useRouter();
  return (
    <main className="page page-narrow">
      <h1>New trip</h1>
      <p className="muted">You can change any of this later. Once it&apos;s created, you&apos;ll get a code to invite your group.</p>
      <TripForm
        submitLabel="Create trip"
        cancelHref="/trips"
        onSave={async (input) => {
          const { trip } = await api<{ trip: Trip }>("/trips", "POST", input);
          router.push(`/trips/${trip.id}`);
        }}
      />
    </main>
  );
}
