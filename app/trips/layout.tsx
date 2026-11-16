"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import TripNav from "@/components/TripNav";
import { MeContext } from "@/components/me";
import { api, ApiError, errorText } from "@/lib/api";
import type { User } from "@/lib/types";

export default function TripsLayout({ children }: LayoutProps<"/trips">) {
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);

  useEffect(() => {
    api<{ user: User }>("/auth/me").then(
      ({ user }) => setMe(user),
      (e) => (e instanceof ApiError && e.status === 401 ? router.replace("/login") : alert(errorText(e))),
    );
  }, [router]);

  function logOut() {
    // Full page load for the same reason as in AuthForm: drop every page's state along with the session.
    api("/auth/logout", "POST").then(
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- the full load is the point
      () => window.location.assign("/login"),
      (e) => alert(errorText(e)),
    );
  }

  return (
    <MeContext value={me}>
      {/* The brand goes back to your trips, which is the front page. The lobby sits on the right of it,
          next to your name, so the one place worth going to is the one thing you can reach from anywhere. */}
      <header className="mx-auto flex max-w-240 flex-wrap items-center gap-x-4 gap-y-2 p-4">
        <Link href="/trips" className="sign sign-small">
          TripTogether
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-4">
          {/* The nav marks the page you're on, which it can only know at runtime. */}
          <Suspense fallback={<div className="min-w-[140px]" />}>
            <TripNav />
          </Suspense>
          <div className="flex min-w-0 items-center gap-2 text-muted">
            <span className="truncate">{me?.name}</span>
            <button className="btn btn-quiet whitespace-nowrap" onClick={logOut}>
              Log out
            </button>
          </div>
        </div>
      </header>
      {children}
    </MeContext>
  );
}
