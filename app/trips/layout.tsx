"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
      <header className="mx-auto flex max-w-240 flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Link href="/trips" className="sign sign-small">
            TripTogether
          </Link>
          <Link href="/trips/gasoline-intelligence" className="btn btn-quiet">
            Gasoline Intelligence
          </Link>
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2 text-muted">
          <span className="truncate">{me?.name}</span>
          <button className="btn btn-quiet" onClick={logOut}>
            Log out
          </button>
        </div>
      </header>
      {children}
    </MeContext>
  );
}
