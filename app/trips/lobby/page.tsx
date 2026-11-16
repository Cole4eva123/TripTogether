"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import LobbyCard from "@/components/lobby/LobbyCard";
import PublishForm from "@/components/lobby/PublishForm";
import LobbyFiltersBar from "@/components/lobby/LobbyFilters";
import { api, errorText } from "@/lib/api";
import { hasEnded } from "@/lib/dates";
import type { LobbyFilters, LobbyPostView, LobbyView, Trip } from "@/lib/types";

export default function LobbyPage() {
  const [lobby, setLobby] = useState<LobbyView | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  // The reader's own trip the other trips are compared against, by trip id.
  const [againstTripId, setAgainstTripId] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<LobbyFilters["sort"]>("closest");
  const [error, setError] = useState("");
  const generation = useRef(0);

  // The comparison and the search are made on the server, against the trip the reader picked, so the cards
  // and the request always talk about the same trip.
  const load = useCallback(async (against?: string, q?: string, filters?: Partial<LobbyFilters>) => {
    const revision = ++generation.current;
    const search = new URLSearchParams();
    if (against) search.set("against", against);
    if (q) search.set("q", q);
    if (filters?.from) search.set("from", filters.from);
    if (filters?.to) search.set("to", filters.to);
    if (filters?.sort && filters.sort !== "closest") search.set("sort", filters.sort);
    const [next, own] = await Promise.all([
      api<LobbyView>(`/lobby${search.size ? `?${search}` : ""}`),
      api<{ trips: Trip[] }>("/trips"),
    ]);
    if (revision !== generation.current) return;
    setLobby(next);
    window.dispatchEvent(new CustomEvent("lobby:pending", { detail: next.pendingRequestCount ?? 0 }));
    setTrips(own.trips);
    setAgainstTripId((current) => {
      if (own.trips.some((trip) => trip.id === current)) return current;
      // The trip with a request waiting on it is the one the reader cares about, so it is the one shown.
      const waiting = next.mine.find((post) =>
        next.requests.some((request) => request.role === "owner" && request.request.tripId === post.tripId && request.request.status === "pending"),
      );
      return waiting?.tripId ?? own.trips[0]?.id ?? "";
    });
    setError("");
  }, []);

  // The lobby is looked at while waiting for an answer, so it keeps itself up to date.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { await load(againstTripId || undefined, query, { from, to, sort }); }
      catch (e) { if (alive) setError(errorText(e)); }
      if (alive) timer = setTimeout(poll, 5000);
    };
    void poll();
    return () => { alive = false; generation.current += 1; clearTimeout(timer); };
  }, [load, againstTripId, query, from, to, sort]);

  const reviewRequests = useCallback(async () => {
    const target = lobby?.requests.find(item => item.role === "owner" && item.request.status === "pending")?.request.tripId;
    setQuery(""); setFrom(""); setTo(""); setSort("closest");
    if (target) setAgainstTripId(target);
    try { await load(target, "", {from:"",to:"",sort:"closest"}); }
    catch(e) { setError(errorText(e)); }
    requestAnimationFrame(() => document.getElementById(target ? `lobby-trip-${target}` : "your-group")?.scrollIntoView({block:"start",behavior:"smooth"}));
  }, [lobby,load]);
  useEffect(() => {
    const review = () => { void reviewRequests(); };
    window.addEventListener("lobby:review-requests",review);
    return () => window.removeEventListener("lobby:review-requests",review);
  },[reviewRequests]);

  const mine = lobby?.mine ?? [];
  const others = lobby?.others ?? [];
  const selected = mine.find((post) => post.tripId === againstTripId) ?? mine[0];
  const publishedTripIds = lobby?.publishedTripIds ?? mine.map(post => post.tripId);
  const unpublished = trips.filter((trip) => !hasEnded(trip.endDate) && !publishedTripIds.includes(trip.id));
  const comparisonTrip = trips.find(trip => trip.id === againstTripId);
  // A post copies the trip's details when it's published, so a plan changed since then leaves the post out
  // of date. The card says so, and the publisher can bring it up to date.
  const isStale = (post: LobbyPostView) => {
    const original = trips.find((trip) => trip.id === post.tripId);
    if (!original) return false;
    return (["origin", "destination", "startDate", "endDate"] as const).some(
      (field) => original[field] !== post[field],
    );
  };

  // Everybody else's trips that answer the filters. The server has already filtered them by the search, the
  // dates and the order, because the search reads the place list and a place can be written in another
  // language.
  //
  // The reader's own trips are in the sidebar, not here, so a trip is never shown twice.
  const othersShown = others;

  async function remove(tripId: string) {
    await api(`/lobby/${tripId}`, "DELETE");
    await load(againstTripId || undefined, query, { from, to, sort });
  }

  async function refresh(tripId: string) {
    await api(`/lobby/${tripId}`, "PATCH");
    await load(againstTripId || undefined, query, { from, to, sort });
  }

  const reload = () => load(againstTripId || undefined, query, { from, to, sort });

  return (
    <main className="mx-auto grid w-full max-w-[1280px] gap-7 rounded-2xl bg-paper/65 px-6 pt-5 pb-16 max-sm:px-4">
      <header className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-green/15 bg-white/85 px-6 py-5 shadow-[inset_3px_0_0_var(--color-green)]">
        <div className="grid gap-2.5">
          <p className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">A little company goes a long way</p>
          <h1 className="text-[32px] font-extrabold tracking-[-0.035em] text-asphalt max-sm:text-[29px]">Shared lobby</h1>
          <p className="max-w-[56ch] text-[14px] leading-relaxed text-muted">Find a route that fits. Meet the people to share it with.</p>
        </div>
        <span className="mb-0.5 inline-flex items-center gap-2 text-[12px] text-muted"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-green"/>A space for fellow travelers</span>
      </header>
      {!!lobby?.pendingRequestCount && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green/25 bg-white px-5 py-4">
        <p className="text-[14px]"><span className="mr-2 inline-flex min-w-6 justify-center rounded-full bg-green/10 px-2 py-0.5 font-bold text-green">{lobby.pendingRequestCount}</span>{lobby.pendingRequestCount===1 ? "Someone wants to join your trip." : "New travelers are waiting to join your trips."}</p>
        <button className="link-btn text-[13px]" onClick={()=>void reviewRequests()}>Review requests</button>
      </div>}
      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-red bg-white p-4">
          <p className="text-red">{error}</p>
          <button className="link-btn" onClick={() => reload().catch((e) => setError(errorText(e)))}>Try again</button>
        </div>
      )}
      {!lobby ? <p role="status" className="text-muted">{error ? "The lobby could not be loaded." : "Loading the lobby…"}</p> : (
        <div className="grid grid-cols-[minmax(0,290px)_minmax(0,1fr)] items-start gap-7 max-md:grid-cols-1">
          <section id="your-group" aria-labelledby="your-group-heading" className="grid min-w-0 gap-4">
            <h2 id="your-group-heading" className="text-[17px] font-bold tracking-[-0.015em]">Your trips</h2>
            {trips.length > 1 && (
              <div className="grid gap-2 rounded-xl border border-line/60 bg-white p-4">
                <label htmlFor="matching-trip" className="text-[12px] font-semibold text-muted">Compare with this trip</label>
                <select id="matching-trip" value={againstTripId} onChange={(event) => setAgainstTripId(event.target.value)}>
                  {trips.map((trip) => {
                    const pending = lobby.requests.filter((r) => r.role === "owner" && r.request.tripId === trip.id && r.request.status === "pending").length;
                    return <option key={trip.id} value={trip.id}>{`${trip.destination} · ${trip.startDate}${pending ? ` · ${pending} pending` : ""}`}</option>;
                  })}
                </select>
              </div>
            )}
            {/* Every trip the reader has shared, one card each. A reader with two trips in the lobby sees
                both of them here, so either can be managed and both sets of requests can be answered. */}
            {mine.map((post) => (
              <LobbyCard
                key={post.id}
                post={post}
                requests={lobby.requests}
                onChanged={reload}
                onUnpublish={post.publishedByMe ? remove : undefined}
                onRefresh={post.publishedByMe && isStale(post) ? refresh : undefined}
              />
            ))}
            {unpublished.length > 0 ? (
              selected ? (
                <details className="rounded-xl border border-line bg-white p-4">
                  <summary className="cursor-pointer text-[15px] font-bold">Share another trip</summary>
                  <div className="pt-4"><PublishForm trips={trips} publishedTripIds={publishedTripIds} onPublished={reload} /></div>
                </details>
              ) : <PublishForm trips={trips} publishedTripIds={publishedTripIds} onPublished={reload} />
            ) : !selected && (
              <div className="grid gap-3 rounded-xl border border-line bg-white p-5">
                <p className="text-[13px] leading-relaxed text-muted">{publishedTripIds.length ? "Your published trips are outside these filters." : "Create a trip with your destination and dates to share it with everyone."}</p>
                {!publishedTripIds.length && <Link href="/trips" className="btn justify-self-start">Go to your trips</Link>}
              </div>
            )}
          </section>

          <section aria-labelledby="discover-heading" className="grid min-w-0 gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="discover-heading" className="text-[17px] font-bold tracking-[-0.015em]">Everyone else&apos;s trips</h2>
              <span className="text-[14px] text-muted">{`${othersShown.length} ${othersShown.length === 1 ? "trip" : "trips"}`}</span>
            </div>

            <LobbyFiltersBar query={query} from={from} to={to} sort={sort}
              onQuery={setQuery} onFrom={setFrom} onTo={setTo} onSort={setSort}
              onReset={() => { setQuery(""); setFrom(""); setTo(""); setSort("closest"); }} />

            <p className="text-[12px] text-muted">{sort === "soonest" ? "Departure date, earliest first. Ended trips appear last." : sort === "soonest-end" ? "Return date, earliest first. Ended trips appear last." : comparisonTrip ? `Compared with your ${comparisonTrip.destination} trip. Overlapping dates appear first.` : "Departure date, earliest first. Create a trip to compare plans."}</p>
            {othersShown.length ? (
              <ul className="grid grid-cols-2 items-start gap-5 max-[1199px]:grid-cols-1">
                {othersShown.map((post) => (
                  <li key={post.id}>
                    <LobbyCard post={post} requests={lobby.requests} onChanged={reload} />
                  </li>
                ))}
              </ul>
            ) : <p className="rounded-xl border border-line bg-white p-6 text-muted">{query.trim() || from || to ? "No trips match your filters. Try a different place or date." : "Nobody else has shared an upcoming trip yet."}</p>}
          </section>
        </div>
      )}
    </main>
  );
}
