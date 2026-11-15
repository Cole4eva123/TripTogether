"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import BingoGrid from "@/components/bingo/BingoGrid";
import DrawForm from "@/components/bingo/DrawForm";
import { api, errorText } from "@/lib/api";
import type { BingoCard, BingoCell, BingoView } from "@/lib/bingo-types";
import type { Trip } from "@/lib/types";

/** A trip's Travel Bingo card: draw one from the destination's task library, then check squares off on the way. */
export default function BingoPage() {
  const { id } = useParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [view, setView] = useState<BingoView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // a square's id, or "draw"
  const [redrawing, setRedrawing] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([api<{ trip: Trip }>(`/trips/${id}`), api<BingoView>(`/trips/${id}/bingo`)]).then(([t, v]) => {
        setTrip(t.trip);
        setView(v);
        setError(""); // Next may restore this page with an error from an earlier visit
      }),
    [id],
  );

  useEffect(() => {
    load().catch((e) => setError(errorText(e)));
    // Other members check squares off too: catch up whenever the page comes back into view.
    const refresh = () => document.visibilityState === "visible" && load().catch(() => {});
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [load]);

  async function run(key: string, call: () => Promise<{ card: BingoCard }>) {
    setBusy(key);
    setError("");
    try {
      const { card } = await call();
      setView((v) => v && { ...v, card });
      setRedrawing(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const draw = (region: string, size: number) => {
    if (view?.card && !confirm("Draw a new card? The squares you've checked off on this one will be gone.")) return;
    run("draw", () => api(`/trips/${id}/bingo`, "POST", { region, size }));
  };
  const mark = (cell: BingoCell, done: boolean) =>
    run(cell.id, () => api(`/trips/${id}/bingo/cells/${cell.id}`, "PATCH", { action: done ? "complete" : "undo" }));
  const swap = (cell: BingoCell) =>
    run(cell.id, () => api(`/trips/${id}/bingo/cells/${cell.id}`, "PATCH", { action: "replace" }));

  const errorLine = error && (
    <p className="font-semibold text-red" role="alert">
      {error}
    </p>
  );

  if (!trip || !view)
    return (
      <main className="mx-auto max-w-240 px-4 pt-4 pb-16">
        {errorLine}
        {error && <Link href={`/trips/${id}`}>Back to the trip</Link>}
      </main>
    );

  const { card, regions, suggestedRegion } = view;
  const bingos = card?.lines.length ?? 0;

  return (
    <main className="mx-auto grid max-w-240 gap-8 px-4 pt-4 pb-16">
      <Link href={`/trips/${trip.id}`} className="justify-self-start">
        Back to the trip
      </Link>

      <header className="grid gap-2">
        <h1>Travel Bingo</h1>
        <p className="max-w-[60ch] text-muted">
          {card
            ? `${card.region} · ${card.size} × ${card.size} card${card.createdBy ? `, drawn by ${card.createdBy}` : ""}. Anyone in the group can check a square off. A full row, column or diagonal is a Bingo.`
            : `Draw a card of things to do in ${trip.destination}, then check them off as your group does them. A full row, column or diagonal is a Bingo.`}
        </p>
      </header>

      {card ? (
        <>
          <section className="flex flex-wrap items-center gap-x-6 gap-y-3" aria-live="polite">
            <p className="text-[22px] leading-[1.2] font-extrabold">
              {card.completed} of {card.cells.length} done
            </p>
            {bingos > 0 && <span className="sign sign-small">{bingos === 1 ? "Bingo!" : `${bingos} Bingos!`}</span>}
          </section>

          <BingoGrid card={card} busy={busy} onMark={mark} onSwap={swap} />
          {errorLine}

          <section className="grid justify-items-start gap-3 border-t border-line pt-6">
            <h2>Change the card</h2>
            <p className="max-w-[60ch] text-muted">
              Swap a single square with its &ldquo;Swap task&rdquo; link, or draw a whole new card. Know something
              that belongs here?{" "}
              <Link href={`/trips/bingo/tasks?region=${encodeURIComponent(card.region)}`}>
                Add a task for {card.region}
              </Link>
              .
            </p>
            {redrawing ? (
              <DrawForm
                regions={regions}
                initialRegion={card.region}
                label="Draw a new card"
                busy={busy === "draw"}
                onDraw={draw}
              />
            ) : (
              <button className="btn btn-quiet" onClick={() => setRedrawing(true)}>
                Draw a new card
              </button>
            )}
          </section>
        </>
      ) : (
        <section className="grid gap-4">
          <h2>Draw your card</h2>
          {suggestedRegion ? (
            <p className="max-w-[60ch] text-muted">
              The {suggestedRegion} library matches your destination, so it&rsquo;s picked for you.
            </p>
          ) : (
            <p className="max-w-[60ch] text-muted">
              There&rsquo;s no library for {trip.destination} yet. Pick a region below, or{" "}
              <Link href={`/trips/bingo/tasks?region=${encodeURIComponent(trip.destination)}`}>
                start one by adding tasks
              </Link>
              .
            </p>
          )}
          <DrawForm
            regions={regions}
            initialRegion={suggestedRegion}
            label="Draw a card"
            busy={busy === "draw"}
            onDraw={draw}
          />
          {errorLine}
        </section>
      )}
    </main>
  );
}
