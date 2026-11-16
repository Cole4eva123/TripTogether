"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { barWithin } from "@/lib/dates";
import type { JoinRequest, LobbyPostView, MatchBasis, RequestItem } from "@/lib/types";
import { dates, useRun } from "./shared";

/** Why a request closed, as its trip's members and its applicant read it. */
const closedText: Record<NonNullable<JoinRequest["closedBy"]>, string> = {
  answerer: "Request declined",
  asked: "Request withdrawn",
  gone: "Closed: the trip left the lobby",
};

/** What rides on the sign's tab: whose trip it is, or how close it is to the reader's own. */
function tabFor(post: LobbyPostView) {
  if (post.mine) return post.organizedByMe ? "You organize this" : "You're in this";
  if (post.ended) return "Ended";
  if (!post.basis) return null;
  if (post.datesClash) return "No shared days";
  return (
    <>
      <span className="sr-only">Match score </span>
      {post.score}
      <span className="ml-2 font-semibold tracking-normal">{post.label}</span>
    </>
  );
}

/**
 * A trip in the lobby: a guide sign, with what the reader can do about it on a plate hung underneath. On another
 * group's trip the sign's tab carries the match score, where the reader's own trips carry their invite code.
 */
export default function LobbyCard({ post, requests, onChanged }: {
  post: LobbyPostView;
  requests: RequestItem[];
  onChanged: () => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState("");
  const { busy, error, run } = useRun();

  const here = requests.filter((item) => item.request.tripId === post.tripId);
  const closed = here.filter((item) => item.request.status === "declined");
  const pending = post.myRequest?.status === "pending" ? post.myRequest : null;
  const tab = tabFor(post);

  const withdraw = (id: string) =>
    run(async () => { await api(`/join-requests/${id}`, "PATCH", { action: "withdraw" }); await onChanged(); });

  const unpublish = () => {
    if (!confirm("Take this trip out of the lobby? Requests still waiting will be closed.")) return;
    void run(async () => { await api(`/lobby/${post.tripId}`, "DELETE"); await onChanged(); });
  };

  async function send(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      await api("/join-requests", "POST", { postId: post.id, message: message.trim() });
      setAsking(false);
      setMessage("");
      await onChanged();
    });
  }

  return (
    <article aria-label={`${post.destination} trip`} className="grid min-w-0 content-start pt-9 wrap-anywhere">
      <div className={`sign relative grid gap-1 px-[30px] pt-6 pb-5 max-sm:px-6 ${post.ended ? "[--bg:var(--color-muted)]" : ""}`}>
        {tab && <span className="sign-tab">{tab}</span>}
        <h3 className="text-[30px] leading-[1.05] font-extrabold">{post.destination}</h3>
        <p className="text-[16px] font-semibold">From {post.origin}</p>
        <p className="text-[16px] font-semibold">
          {dates(post.startDate, post.endDate)}
          <span className="ml-3 font-normal">{`${post.members.length} ${post.members.length === 1 ? "traveler" : "travelers"}`}</span>
        </p>
      </div>

      <div className="mx-3 grid gap-4 rounded-b-xl border-2 border-t-0 border-line bg-white p-5">
        {post.mine && <p className="text-[14px] text-muted">{post.members.map((m) => m.name).join(", ")}</p>}
        {!post.mine && post.basis && <Overlap post={post} basis={post.basis} />}
        {post.note && <p className="border-l-4 border-line pl-3 text-[15px] whitespace-pre-wrap">{post.note}</p>}

        {post.mine ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href={`/trips/${post.tripId}`} className="btn btn-small">Open the trip</Link>
            <Link href={`/trips/${post.tripId}/chat`} className="btn btn-small btn-quiet">Chat</Link>
            {post.organizedByMe && <button className="link-btn text-[14px]" disabled={busy} onClick={unpublish}>Remove from lobby</button>}
          </div>
        ) : post.ended ? (
          <p className="text-[14px] text-muted">This trip is over.</p>
        ) : pending ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-[15px] font-bold">Waiting for the organizer&apos;s answer</p>
            <button className="link-btn text-[14px]" disabled={busy} onClick={() => withdraw(pending.id)}>Withdraw request</button>
          </div>
        ) : asking ? (
          <form onSubmit={send} className="grid gap-2">
            <label htmlFor={`message-${post.id}`} className="text-[14px]">Say hello (optional)</label>
            <textarea id={`message-${post.id}`} rows={2} maxLength={500} value={message} disabled={busy} onChange={(event) => setMessage(event.target.value)} placeholder="Who you are and what you're looking for." />
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-small" disabled={busy}>{busy ? "Sending…" : "Send request"}</button>
              <button type="button" className="btn btn-small btn-quiet" disabled={busy} onClick={() => setAsking(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <div>
            <button className="btn btn-small" onClick={() => setAsking(true)}>{post.myRequest ? "Ask again" : "Ask to join"}</button>
          </div>
        )}

        {/* Requests that ended without anyone joining. Members see everyone's; an applicant sees their own, so
            "turned down" reads differently from "the trip left the lobby". */}
        {closed.length > 0 && (
          <details className="text-[14px] text-muted">
            <summary className="cursor-pointer">{`Closed requests (${closed.length})`}</summary>
            <ul className="grid gap-1 pt-2">
              {closed.map(({ request, role }) => (
                <li key={request.id}>
                  {role === "member" && <span className="font-semibold text-asphalt">{request.applicantName}: </span>}
                  {closedText[request.closedBy ?? "answerer"]}
                </li>
              ))}
            </ul>
          </details>
        )}
        {error && <p role="alert" className="text-[14px] font-semibold text-red">{error}</p>}
      </div>
    </article>
  );
}

/**
 * The reader's trip and this one as two bars on the same stretch of days, with the days they share marked in
 * centre-line yellow. The sentence above says the same thing, so the drawing is hidden from screen readers.
 */
function Overlap({ post, basis }: { post: LobbyPostView; basis: MatchBasis }) {
  const axis = {
    startDate: post.startDate < basis.startDate ? post.startDate : basis.startDate,
    endDate: post.endDate > basis.endDate ? post.endDate : basis.endDate,
  };
  const pct = ({ left, width }: { left: number; width: number }) => ({ left: `${left}%`, width: `${width}%` });
  const shared = basis.overlapDays > 0;
  const rows = [
    { name: "This trip", colour: "bg-green", range: post },
    { name: `Your ${basis.destination} trip`, colour: "bg-asphalt", range: basis },
  ];
  return (
    <div className="grid gap-2">
      <p className="text-[15px] font-bold">
        {shared
          ? `${basis.overlapDays} ${basis.overlapDays === 1 ? "day" : "days"} together, ${dates(basis.overlapStart, basis.overlapEnd)}`
          : "No days in common"}
      </p>
      <div aria-hidden className="relative grid gap-1.5 py-1.5">
        {shared && (
          <span
            className="absolute inset-y-0 min-w-1.5 rounded-sm bg-lane/40"
            style={pct(barWithin({ startDate: basis.overlapStart, endDate: basis.overlapEnd }, axis))}
          />
        )}
        {rows.map((row) => (
          <span key={row.name} className="relative h-2.5 rounded-full bg-paper">
            <span className={`absolute inset-y-0 min-w-1.5 rounded-full ${row.colour}`} style={pct(barWithin(row.range, axis))} />
          </span>
        ))}
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
        {rows.map((row) => (
          <span key={row.name} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${row.colour}`} />
            {row.name}
          </span>
        ))}
      </p>
      {shared && post.reasons.length > 0 && <p className="text-[13px] text-muted">{post.reasons.join(". ")}.</p>}
    </div>
  );
}
