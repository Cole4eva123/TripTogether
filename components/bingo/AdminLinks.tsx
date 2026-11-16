"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * A small line for admins at the foot of the trips page: the way into the Bingo task library, where they add,
 * rewrite and take out tasks, and into the challenges they publish, and how many suggestions wait for review. Members see nothing.
 */
export default function BingoAdminLinks() {
  const [pending, setPending] = useState<number | null>(null); // null until known, or when not an admin

  useEffect(() => {
    api<{ isAdmin: boolean; pendingCount: number }>("/bingo/tasks").then(
      (l) => setPending(l.isAdmin ? l.pendingCount : null),
      () => setPending(null), // it's only a shortcut: say nothing if it can't load
    );
  }, []);

  if (pending === null) return null;
  return (
    <p className="mt-16 border-t border-line pt-4 text-[14px] text-muted">
      Admin: <Link href="/trips/bingo/tasks">Bingo task library</Link>
      {" · "}
      <Link href="/trips/bingo/challenges">Bingo challenges</Link>
      {pending > 0 && (
        <>
          {" · "}
          <Link href="/trips/bingo/review">
            {pending === 1 ? "1 suggestion" : `${pending} suggestions`} to review
          </Link>
        </>
      )}
    </p>
  );
}
