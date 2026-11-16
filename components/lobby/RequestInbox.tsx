"use client";

import { api } from "@/lib/api";
import type { RequestItem } from "@/lib/types";
import { dates, useRun } from "./shared";

/**
 * The people waiting to join the reader's trips, at the top of the lobby. Every member of a trip sees them; only
 * its organizer gets the buttons.
 */
export default function RequestInbox({ items, onChanged }: { items: RequestItem[]; onChanged: () => Promise<void> }) {
  const { busy, error, run } = useRun();
  const answer = (id: string, action: "accept" | "decline") =>
    run(async () => { await api(`/join-requests/${id}`, "PATCH", { action }); await onChanged(); });

  return (
    <section id="requests" aria-labelledby="requests-heading" className="scroll-mt-4 rounded-xl border-2 border-line bg-white">
      <h2 id="requests-heading" className="flex items-center gap-2 px-5 pt-4">
        Requests to join
        <span className="grid min-h-6 min-w-6 place-items-center rounded-full bg-lane px-1.5 text-[13px] leading-none font-extrabold">{items.length}</span>
      </h2>
      <ul>
        {items.map(({ request, trip, mayAnswer }) => (
          <li key={request.id} className="flex flex-wrap items-start gap-x-4 gap-y-3 border-line px-5 py-4 not-first:border-t">
            <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-green text-[18px] font-extrabold text-white uppercase">
              {request.applicantName.trim().charAt(0) || "?"}
            </span>
            <div className="grid min-w-0 flex-[1_1_260px] gap-1 wrap-anywhere">
              <p>
                <strong>{request.applicantName}</strong> wants to join <strong>{trip.destination}</strong>
              </p>
              <p className="text-[14px] text-muted">
                {dates(trip.startDate, trip.endDate)}
                {request.score > 0 && `, their own trip matches ${request.score} out of 100`}
              </p>
              {request.message && <p className="mt-1 border-l-4 border-line pl-3 text-[15px] whitespace-pre-wrap">{request.message}</p>}
            </div>
            {mayAnswer ? (
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-small" disabled={busy} onClick={() => answer(request.id, "accept")}>Let them join</button>
                <button className="btn btn-small btn-quiet" disabled={busy} onClick={() => answer(request.id, "decline")}>Decline</button>
              </div>
            ) : (
              <p className="text-[14px] text-muted">The organizer answers this one.</p>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="px-5 pb-4 text-[14px] font-semibold text-red">{error}</p>}
    </section>
  );
}
