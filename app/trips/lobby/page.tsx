"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import LobbyCard from "@/components/lobby/LobbyCard";
import LobbyFiltersBar from "@/components/lobby/LobbyFilters";
import PublishForm from "@/components/lobby/PublishForm";
import RequestInbox from "@/components/lobby/RequestInbox";
import { useMe } from "@/components/me";
import { api, errorText } from "@/lib/api";
import { hasEnded } from "@/lib/dates";
import type { LobbyFilters, LobbyView, Trip } from "@/lib/types";

/** How often the lobby is fetched again while its tab is in view, in milliseconds. */
const POLL_MS = 15_000;
/** How long the search waits after the last keystroke before asking the server. */
const SEARCH_WAIT_MS = 300;

export default function LobbyPage() {
  const me = useMe();
  const [lobby, setLobby] = useState<LobbyView | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  // The reader's own trip the others are compared with; "" lets the server pick the best fit for each.
  const [against, setAgainst] = useState("");
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<LobbyFilters["sort"]>("closest");
  const [error, setError] = useState("");
  const generation = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed.trim()), SEARCH_WAIT_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  // The comparison and the search are made on the server (they read the gazetteer). A newer request makes an
  // older one's answer stale, so only the latest is kept.
  const load = useCallback(async () => {
    const revision = ++generation.current;
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries({ against, q: query, from, to, sort })) if (value) search.set(key, value);
    const next = await api<LobbyView>(`/lobby?${search}`);
    if (revision !== generation.current) return;
    setLobby(next);
    setError("");
    window.dispatchEvent(new CustomEvent("lobby:pending", { detail: next.pendingRequestCount }));
  }, [against, query, from, to, sort]);

  const reload = useCallback(() => load().catch((e) => setError(errorText(e))), [load]);

  // The reader's own trips change on other pages, which remount this one, so they are read once.
  useEffect(() => {
    api<{ trips: Trip[] }>("/trips").then((own) => setTrips(own.trips), (e) => setError(errorText(e)));
  }, []);

  // Arriving from the nav's "review requests" link: the inbox exists only once the lobby has loaded.
  const loaded = lobby !== null;
  useEffect(() => {
    if (loaded && location.hash === "#requests") document.getElementById("requests")?.scrollIntoView({ behavior: "smooth" });
  }, [loaded]);

  // The lobby is looked at while waiting for an answer, so it keeps itself up to date, but only while it's in view.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    // Coming back into view polls at once, so each run replaces whatever timer is waiting.
    const poll = async () => {
      if (!document.hidden) await reload();
      clearTimeout(timer);
      if (alive) timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    document.addEventListener("visibilitychange", poll);
    return () => {
      alive = false;
      generation.current += 1;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [reload]);

  function resetFilters() {
    setTyped(""); setFrom(""); setTo(""); setSort("closest"); setAgainst("");
  }

  const mine = lobby?.mine ?? [];
  const others = lobby?.others ?? [];
  const waiting = lobby?.requests.filter((item) => item.role === "member" && item.request.status === "pending") ?? [];
  const upcoming = trips.filter((trip) => !hasEnded(trip.endDate));
  // Only a trip's organizer shares it, and only once.
  const shareable = upcoming.filter((trip) => trip.ownerId === me?.id && !mine.some((post) => post.tripId === trip.id));

  return (
    <main className="mx-auto grid w-full max-w-[1280px] gap-8 px-4 pt-4 pb-16">
      <header className="grid gap-2">
        <h1>Shared lobby</h1>
        <p className="max-w-[60ch] text-muted">Trips other groups have shared, compared with yours. Ask to join one, or share your own.</p>
      </header>
      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-red bg-white p-4">
          <p className="text-red">{error}</p>
          <button className="link-btn" onClick={reload}>Try again</button>
        </div>
      )}
      {!lobby ? <p role="status" className="text-muted">{error ? "The lobby could not be loaded." : "Loading the lobby…"}</p> : (
        <>
          {waiting.length > 0 && <RequestInbox items={waiting} onChanged={reload} />}
          <div className="grid grid-cols-[minmax(0,340px)_minmax(0,1fr)] items-start gap-10 max-md:grid-cols-1">
            <section aria-labelledby="yours-heading" className="grid min-w-0 gap-4">
              <h2 id="yours-heading">Your trips in the lobby</h2>
              {mine.map((post) => <LobbyCard key={post.id} post={post} requests={lobby.requests} onChanged={reload} />)}
              {shareable.length > 0 ? (
                <details open={!mine.length} className="rounded-xl border-2 border-line bg-white p-5">
                  <summary className="cursor-pointer font-bold">{mine.length ? "Share another trip" : "Share a trip"}</summary>
                  <div className="pt-4"><PublishForm trips={shareable} onPublished={reload} /></div>
                </details>
              ) : !mine.length && (
                <div className="grid gap-3 rounded-xl border-2 border-line bg-white p-5">
                  <p className="text-muted">Organize a trip of your own, then share it here so others can ask to join.</p>
                  <Link href="/trips" className="btn btn-small justify-self-start">Go to your trips</Link>
                </div>
              )}
            </section>

            <section aria-labelledby="others-heading" className="grid min-w-0 gap-4">
              <h2 id="others-heading" className="flex flex-wrap items-baseline justify-between gap-2">
                Everyone else&apos;s trips
                <span className="text-[15px] font-normal text-muted">{`${others.length} ${others.length === 1 ? "trip" : "trips"}`}</span>
              </h2>
              <LobbyFiltersBar query={typed} from={from} to={to} sort={sort} against={against} trips={upcoming}
                onQuery={setTyped} onFrom={setFrom} onTo={setTo} onSort={setSort} onAgainst={setAgainst} onReset={resetFilters} />
              {others.length ? (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] items-start gap-x-6 gap-y-4">
                  {others.map((post) => (
                    <li key={post.id}><LobbyCard post={post} requests={lobby.requests} onChanged={reload} /></li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border-2 border-line bg-white p-6 text-muted">
                  {query || from || to ? "No trips match your filters. Try a different place or dates." : "Nobody else has shared a trip yet."}
                </p>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
