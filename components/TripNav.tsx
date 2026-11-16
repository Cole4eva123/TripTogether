"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMe } from "@/components/me";
import { api } from "@/lib/api";

/** How often the badge asks for the count of requests waiting for an answer, in milliseconds. */
const POLL_MS = 5000;

/**
 * The link to the shared lobby, with a badge counting the join requests waiting for the reader's answer. The count
 * is polled, and the lobby page also sends it (`lobby:pending`) when an answer there changes it. A rise shows a
 * short notice.
 */
export default function TripNav() {
  const pathname = usePathname();
  const me = useMe();
  const current = pathname.startsWith("/trips/lobby");
  const [count, setCount] = useState(0);
  const [notice, setNotice] = useState(false);
  const previous = useRef<number | null>(null);

  useEffect(() => {
    if (!me) return;
    let alive = true;
    let revision = 0; // bumped by the lobby page's count, so a poll started before it doesn't overwrite it
    let pulling = false;
    let timer: ReturnType<typeof setTimeout>;
    let dismiss: ReturnType<typeof setTimeout>;

    const update = (next: number) => {
      if (!alive) return;
      if (previous.current !== null && next > previous.current) {
        setNotice(true);
        clearTimeout(dismiss);
        dismiss = setTimeout(() => {
          if (alive) setNotice(false);
        }, 6000);
      }
      previous.current = next;
      setCount(next);
      if (!next) setNotice(false);
    };

    const pull = async () => {
      if (pulling) return;
      pulling = true;
      const started = revision;
      try {
        const data = await api<{ pendingRequestCount: number }>("/join-requests");
        if (started === revision) update(data.pendingRequestCount);
      } catch {
        // Keep the count we know through a passing connection error.
      } finally {
        pulling = false;
        if (alive) timer = setTimeout(pull, POLL_MS);
      }
    };

    const changed = (event: Event) => {
      revision++;
      update((event as CustomEvent<number>).detail);
    };
    const focus = () => {
      clearTimeout(timer);
      void pull();
    };

    window.addEventListener("lobby:pending", changed);
    window.addEventListener("focus", focus);
    void pull();
    return () => {
      alive = false;
      clearTimeout(timer);
      clearTimeout(dismiss);
      window.removeEventListener("lobby:pending", changed);
      window.removeEventListener("focus", focus);
    };
  }, [me]);

  const review = () => document.getElementById("requests")?.scrollIntoView({ behavior: "smooth" });

  return (
    <nav className="relative flex min-w-0 items-center">
      <Link
        href={count ? "/trips/lobby#requests" : "/trips/lobby"}
        aria-current={current ? "page" : undefined}
        onClick={(event) => {
          // Already on the lobby: scroll to the requests instead of reloading it.
          if (current && count) {
            event.preventDefault();
            review();
          }
        }}
        className="sign sign-small inline-flex items-center gap-2 whitespace-nowrap hover:brightness-110"
      >
        Shared lobby
        {count > 0 && (
          <span
            data-testid="join-request-count"
            aria-label={`${count} pending join ${count === 1 ? "request" : "requests"}`}
            className="grid min-h-5 min-w-5 place-items-center rounded-full bg-lane px-1.5 text-[11px] leading-none font-extrabold text-asphalt"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
      <span className="sr-only" role="status" aria-live="polite">
        {count ? `${count} pending requests to join your trips` : "No pending join requests"}
      </span>
      {notice && (
        <div
          role="status"
          className="absolute top-full right-0 z-40 mt-3 w-60 rounded-xl border border-green/25 bg-white p-3 text-[13px] text-asphalt shadow-lg"
        >
          New request to join your trip.{" "}
          <Link
            href="/trips/lobby#requests"
            className="link-btn"
            onClick={() => {
              review();
              setNotice(false);
            }}
          >
            Review requests
          </Link>
        </div>
      )}
    </nav>
  );
}
