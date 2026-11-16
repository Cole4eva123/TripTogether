"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import BingoGrid from "@/components/bingo/BingoGrid";
import DrawForm from "@/components/bingo/DrawForm";
import Toast, { type ToastNote } from "@/components/bingo/Toast";
import { api, errorText } from "@/lib/api";
import { lineName, newLines } from "@/lib/bingo";
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
  const [note, setNote] = useState<ToastNote | null>(null);
  const [flash, setFlash] = useState<{ id: number; positions: number[] } | null>(null);
  const closeNote = useCallback(() => setNote(null), []);

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

  /** Runs a change to the card; `told` says what happened, given the card before and after. */
  async function run(
    key: string,
    call: () => Promise<{ card: BingoCard }>,
    told: (before: BingoCard | null, after: BingoCard) => Omit<ToastNote, "id">,
  ) {
    setBusy(key);
    setError("");
    const before = view?.card ?? null;
    try {
      const { card } = await call();
      setView((v) => v && { ...v, card });
      setRedrawing(false);
      setNote({ id: Date.now(), ...told(before, card) });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const draw = (region: string, size: number) => {
    if (view?.card && !confirm("Draw a new card? The squares you've checked off on this one will be gone.")) return;
    run(
      "draw",
      () => api(`/trips/${id}/bingo`, "POST", { region, size }),
      (_, after) => ({ title: "New card drawn", detail: `${after.size} × ${after.size}, from the ${after.region} library.` }),
    );
  };

  const mark = (cell: BingoCell, done: boolean) =>
    run(
      cell.id,
      () => api(`/trips/${id}/bingo/cells/${cell.id}`, "PATCH", { action: done ? "complete" : "undo" }),
      (before, after) => {
        if (!done) return { title: "Undone", detail: cell.task.title };
        const finished = newLines(before?.lines ?? [], after.lines);
        if (finished.length) setFlash({ id: Date.now(), positions: finished.flat() });
        if (after.completed === after.cells.length) {
          return { big: true, title: "Card complete!", detail: "Every square is done. What a trip." };
        }
        if (finished.length) {
          return {
            big: true,
            title: finished.length === 1 ? "Bingo!" : `Double Bingo!`,
            detail: `${finished.map((l) => lineName(l, after.size)).join(" and ")} done.`,
          };
        }
        return { title: "Checked off", detail: cell.task.title };
      },
    );

  const swap = (cell: BingoCell) =>
    run(
      cell.id,
      () => api(`/trips/${id}/bingo/cells/${cell.id}`, "PATCH", { action: "replace" }),
      (_, after) => ({ title: "Task swapped", detail: `New: ${after.cells[cell.position].task.title}` }),
    );

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

  const { card, regions, suggestedRegion, viewer } = view;
  // The card's region; before a card, the library that matches the destination, or the destination itself.
  const libraryRegion = card?.region ?? suggestedRegion ?? trip.destination;
  // Each finished line, and who checked off its last square.
  const finished = (card?.lines ?? []).map((line) => {
    const last = line
      .map((p) => card!.cells[p])
      .reduce((a, b) => ((a.completedAt ?? "") >= (b.completedAt ?? "") ? a : b));
    return { name: lineName(line, card!.size), by: last.completedBy };
  });

  return (
    <main className="mx-auto grid max-w-240 gap-8 px-4 pt-4 pb-16">
      <Link href={`/trips/${trip.id}`} className="justify-self-start">
        Back to the trip
      </Link>

      <header className="grid gap-2">
        <h1>Travel Bingo</h1>
        <p className="max-w-[60ch] text-muted">
          {card
            ? `${card.region} · ${card.size} × ${card.size} card${card.createdBy ? `, drawn by ${card.createdBy}` : ""}. Anyone in the group can check a square off; only whoever did, or an admin, can undo it. A full row, column or diagonal is a Bingo.`
            : `Draw a card of things to do in ${trip.destination}, then check them off as your group does them. A full row, column or diagonal is a Bingo.`}
        </p>
        {/* A quiet way into the task library; admins manage it from the trips page too. */}
        <p className="text-[14px] text-muted">
          Know something to do in {libraryRegion}?{" "}
          <Link href={`/trips/bingo/tasks?region=${encodeURIComponent(libraryRegion)}`}>
            {viewer.admin ? "Add it to the library" : "Suggest a task"}
          </Link>
        </p>
      </header>

      {card ? (
        <>
          <section className="flex flex-wrap items-center gap-x-6 gap-y-3" aria-live="polite">
            <p className="text-[22px] leading-[1.2] font-extrabold">
              {card.completed} of {card.cells.length} done
            </p>
          </section>

          {finished.length > 0 && (
            <section className="sign grid gap-1 px-7 pt-5 pb-4 max-sm:px-5" aria-label="Bingos">
              <p className="text-[26px] leading-[1.1] font-extrabold">
                {card.completed === card.cells.length
                  ? "Card complete!"
                  : finished.length === 1
                    ? "Bingo!"
                    : `${finished.length} Bingos!`}
              </p>
              <ul className="grid gap-0.5 text-[15px]">
                {finished.map((f) => (
                  <li key={f.name}>
                    {f.name}
                    {f.by && <span className="sign-body-quiet">, finished by {f.by}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <BingoGrid card={card} viewer={viewer} flash={flash} busy={busy} onMark={mark} onSwap={swap} />
          {errorLine}

          <section className="grid justify-items-start gap-3 border-t border-line pt-6">
            <h2>Change the card</h2>
            <p className="max-w-[60ch] text-muted">
              Swap a single square with its &ldquo;Swap task&rdquo; link, or draw a whole new card.
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
                {viewer.admin ? "start one by adding tasks" : "start one by suggesting tasks"}
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
      <Toast note={note} onClose={closeNote} />
    </main>
  );
}
