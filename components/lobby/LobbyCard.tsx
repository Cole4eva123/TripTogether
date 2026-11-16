"use client";

import Link from "next/link";
import { useState } from "react";
import { requestLabel } from "@/lib/lobby-labels";
import { api, errorText } from "@/lib/api";
import type { LobbyPostView, RequestItem } from "@/lib/types";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const day = (value: string) => new Date(`${value}T00:00:00Z`);
// A range of days. A missing end means a single day, and a missing start means there is nothing to show.
const dates = (start: string, end: string) => {
  if (!start) return "";
  if (!end || end === start) return dateFmt.format(day(start));
  return dateFmt.formatRange(day(start), day(end));
};

export default function LobbyCard({ post, requests, onChanged, onUnpublish, onRefresh }: {
  post: LobbyPostView;
  requests: RequestItem[];
  onChanged: () => Promise<void>;
  onUnpublish?: (tripId: string) => Promise<void>;
  onRefresh?: (tripId: string) => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // The comparison against the reader's own trip is worked out on the server, so the card and the request it
  // sends always talk about the same trip and the same days.
  const basis = post.basis;
  const overlapDays = basis?.overlapDays ?? 0;
  const hasOverlap = overlapDays > 0;

  // The requests about this trip. The owner sees the ones waiting to be answered; an applicant sees the
  // one they made.
  const here = requests.filter((request) => request.request.tripId === post.tripId);
  const waiting = here.filter((request) => request.role === "owner" && request.request.status === "pending");
  const mine = here.find((request) => request.role === "applicant");
  const closed = here.filter((request) => request.request.status === "declined");

  // Where the reader stands with this trip:
  //   "owner"    — they are in it, so they answer the requests about it and take it down if they published it;
  //   "in"       — they were let in, so the trip and its chat are theirs;
  //   "outside"  — they are not in it, so they may ask to join it.
  //
  // Everybody in a trip is an owner of that trip: they travel together, so they decide together who else
  // travels with them. Being in the group is what makes somebody an owner, not having put the trip in the
  // lobby. Publishing is a separate thing: only the publisher may take the trip down again.
  //
  // The publisher is a member too, so they are an owner as well. The only difference between the two is
  // what they may do with the publication itself.
  const accepted = here.find((request) => request.role === "applicant" && request.request.status === "accepted");
  const stand = post.mine ? "owner" : accepted ? "in" : "outside";

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await action(); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  function respond(id: string, action: "accept" | "decline" | "withdraw") {
    return run(async () => { await api(`/join-requests/${id}`, "PATCH", { action }); await onChanged(); });
  }

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      await api("/join-requests", "POST", { postId: post.id, message: message.trim() });
      setAsking(false);
      setMessage("");
      await onChanged();
    });
  }

  return (
    <article id={`lobby-trip-${post.tripId}`} data-mine={post.mine} aria-label={`${post.destination} trip`} className={`relative grid min-w-0 content-start gap-4 rounded-xl border bg-white p-5 shadow-[0_2px_8px_rgba(35,39,43,0.025)] transition-colors hover:border-green/35 [overflow-wrap:anywhere] max-sm:p-5 ${waiting.length ? "border-green/50" : "border-line/60"}`}>
      {(post.mine || waiting.length > 0 || post.ended) && <div className="flex flex-wrap items-center gap-2">
        {post.publishedByMe && <span className="inline-flex rounded-full bg-paper/80 px-2.5 py-1 text-[10px] font-semibold tracking-[0.02em] text-muted">Your trip</span>}
        {post.mine && !post.publishedByMe && <span className="inline-flex rounded-full bg-paper/80 px-2.5 py-1 text-[10px] font-semibold tracking-[0.02em] text-muted">You&apos;re in this trip</span>}
        {waiting.length > 0 && <span className="inline-flex rounded-full bg-green/10 px-2.5 py-1 text-[10px] font-semibold text-green">{`${waiting.length} ${waiting.length === 1 ? "request" : "requests"}`}</span>}
        {post.ended && <span className="inline-flex rounded-full bg-paper/80 px-2.5 py-1 text-[10px] font-semibold tracking-[0.02em] text-muted">Trip ended</span>}
      </div>}
      <div className="grid grid-cols-[10px_minmax(0,1fr)] gap-x-3 gap-y-3">
        <div aria-hidden="true" className="relative row-span-2 my-2 w-2"><span className="absolute inset-y-1 left-[3px] border-l border-line"/><span className="absolute top-0 h-2 w-2 rounded-full border border-muted bg-white"/><span className="absolute bottom-0 h-2 w-2 rounded-full bg-green"/></div>
        <div className="grid min-w-0 gap-0.5"><p className="text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">From</p><p className="text-[16px] leading-snug font-semibold text-asphalt">{post.origin}</p></div>
        <div className="grid min-w-0 gap-0.5"><p className="text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">To</p><h3 className="text-[25px] leading-tight font-extrabold tracking-[-0.025em] text-green">{post.destination}</h3></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-y border-line/40 py-3">
        <p className="text-[13px] font-medium text-asphalt">{dates(post.startDate, post.endDate)}</p>
        <p className="text-[12px] text-muted">{`${post.members.length} ${post.members.length === 1 ? "traveler" : "travelers"}`}</p>
      </div>
      {post.note && <p className="border-l-2 border-line/50 pl-3 text-[13px] leading-relaxed whitespace-pre-wrap text-muted">{post.note}</p>}

      {!post.mine && basis && (
        <div className="grid gap-1">
          {hasOverlap ? (
            <p className="text-[12px] font-semibold text-green">
              {`${overlapDays} ${overlapDays === 1 ? "day" : "days"} in common · ${dates(basis.overlapStart, basis.overlapEnd)}`}
            </p>
          ) : (
            <p className="text-[12px] font-medium text-muted">Your dates don&apos;t overlap.</p>
          )}
          <p className="text-[12px] text-muted">{`Compared with your ${basis.destination} trip.`}</p>
          {hasOverlap && post.reasons.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 pt-1">
              {post.reasons.map((reason) => <li key={reason} className="inline-flex rounded-full bg-paper/80 px-2.5 py-1 text-[10px] font-semibold tracking-[0.02em] text-muted">{reason}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* The people waiting to join this trip. Everybody in the group answers them: they travel together,
          so they decide together who travels with them. */}
      {post.mine && waiting.map((item) => (
        <RequestRow key={item.request.id} item={item} busy={busy} onRespond={respond} />
      ))}

      {/* What the reader can do about this trip. It depends on where they stand with it, not on whether
          they are one of its members: someone who was let in is a member now, and still needs to be told so
          and given a way into the trip and its chat. */}
      {stand === "owner" || stand === "in" ? (
        <div className="grid gap-3 border-t border-line/60 pt-4">
          <p className="text-[14px] font-semibold">You&apos;re in this trip.</p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/trips/${post.tripId}`} className="btn btn-small rounded-lg text-[13px]">Open the trip</Link>
            <Link href={`/trips/${post.tripId}/chat`} className="btn btn-small rounded-lg text-[13px] btn-quiet">Open the chat group</Link>
          </div>
        </div>
      ) : post.ended ? (
        <div className="border-t border-line pt-4">
          <p className="text-[14px] text-muted">That trip is already over.</p>
        </div>
      ) : mine?.request.status === "pending" ? (
        <div className="grid gap-3 border-t border-line/60 pt-4">
          <p className="text-[14px] font-semibold">Waiting for an answer.</p>
          <button className="link-btn justify-self-start" disabled={busy} onClick={() => respond(mine.request.id, "withdraw")}>Withdraw request</button>
        </div>
      ) : asking ? (
        <form onSubmit={send} className="grid gap-3 border-t border-line pt-4">
          <label htmlFor={`message-${post.id}`} className="text-[14px] font-bold">Say hello (optional)</label>
          <textarea id={`message-${post.id}`} rows={2} maxLength={500} value={message} disabled={busy} onChange={(event) => setMessage(event.target.value)} placeholder="Tell them who you are and what you're looking for." />
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-small rounded-lg text-[13px]" disabled={busy}>{busy ? "Sending…" : "Send request"}</button>
            <button type="button" className="btn btn-small rounded-lg text-[13px] btn-quiet" disabled={busy} onClick={() => setAsking(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="border-t border-line pt-4">
          <button className="btn btn-small rounded-lg text-[13px] justify-self-start" onClick={() => setAsking(true)}>
            {mine ? "Ask again" : "Ask to join"}
          </button>
        </div>
      )}
      {/* The requests about this trip that are closed. The owner sees the ones that were turned down; the
          applicant sees their own, so they can tell "turned down" from "the trip left the lobby" from
          "they were let in and then left the trip themselves". */}
      {(post.mine || mine) && closed.length > 0 && (
        <details className="border-t border-line pt-3 text-[14px]">
          <summary className="cursor-pointer text-muted">{`Closed requests (${closed.length})`}</summary>
          <div className="grid gap-3 pt-3">{closed.map((item) => <RequestRow key={item.request.id} item={item} busy={busy} onRespond={respond} />)}</div>
        </details>
      )}
      {error && <p role="alert" className="text-[14px] text-red">{error}</p>}

      {post.mine && post.publishedByMe && (onUnpublish || onRefresh) && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {onRefresh && <button className="btn btn-small rounded-lg text-[13px]" disabled={busy} onClick={() => run(() => onRefresh(post.tripId))}>Sync changed trip</button>}
          {onUnpublish && <button className="btn btn-small rounded-lg text-[13px] btn-quiet" disabled={busy} onClick={() => run(() => onUnpublish(post.tripId))}>Remove from lobby</button>}
        </div>
      )}
    </article>
  );
}

function RequestRow({ item, busy, onRespond }: {
  item: RequestItem;
  busy: boolean;
  onRespond: (id: string, action: "accept" | "decline" | "withdraw") => Promise<void>;
}) {
  const { request } = item;
  const pending = request.status === "pending";
  const status = pending ? "Wants to join your trip"
    : request.status === "accepted" ? "In your trip"
    : request.closedBy === "left" ? "Left the trip again"
    : request.closedBy === "gone" ? "Closed: the trip left the lobby"
    : request.closedBy === "asked" ? "Request withdrawn"
    : "Request declined";
  return (
    <div className="grid gap-3 border-t border-line/60 pt-4">
      <p className="text-[11px] font-semibold tracking-wide text-muted">{requestLabel(request.id)}</p>
      <p className="text-[14px] font-semibold">{status}</p>
      {request.message && <p className="text-[14px] whitespace-pre-wrap text-muted">{request.message}</p>}
      {pending && item.role === "owner" && (
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-small rounded-lg text-[13px]" disabled={busy} onClick={() => onRespond(request.id, "accept")}>Let them join</button>
          <button className="btn btn-small rounded-lg text-[13px] btn-quiet" disabled={busy} onClick={() => onRespond(request.id, "decline")}>Decline</button>
        </div>
      )}
    </div>
  );
}
