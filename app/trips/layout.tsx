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
    api("/auth/logout", "POST").then(() => router.replace("/login"), (e) => alert(errorText(e)));
  }

  return (
    <MeContext value={me}>
      <header className="topbar">
        <Link href="/trips" className="sign sign-small">
          TripTogether
        </Link>
        <div className="topbar-user">
          <span>{me?.name}</span>
          <button className="btn btn-quiet" onClick={logOut}>
            Log out
          </button>
        </div>
      </header>
      {children}
    </MeContext>
  );
}
