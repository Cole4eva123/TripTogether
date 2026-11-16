"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, errorText } from "@/lib/api";
import type { BingoTask } from "@/lib/bingo-types";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** Admins only: the tasks people sent in, waiting to be approved into the library or turned down. */
export default function ReviewPage() {
  const [tasks, setTasks] = useState<BingoTask[] | null>(null);
  const [error, setError] = useState("");
  const [notAdmin, setNotAdmin] = useState(false);

  const load = useCallback(
    () =>
      api<{ tasks: BingoTask[] }>("/bingo/review").then(
        ({ tasks }) => {
          setTasks(tasks);
          setError("");
        },
        (e) => (e instanceof ApiError && e.status === 403 ? setNotAdmin(true) : setError(errorText(e))),
      ),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="mx-auto grid max-w-240 gap-8 px-4 pt-4 pb-16">
      <Link href="/trips/bingo/tasks" className="justify-self-start">
        Back to the task library
      </Link>
      <header className="grid gap-2">
        <h1>Review tasks</h1>
        <p className="max-w-[60ch] text-muted">
          Approve a task to add it to its region&rsquo;s library, where challenges are built from. Turn it down if
          it&rsquo;s unsafe, not really in that place, or already there under another name.
        </p>
      </header>

      {notAdmin && <p className="max-w-[60ch] text-muted">Only admins can review tasks.</p>}
      {error && (
        <p className="font-semibold text-red" role="alert">
          {error}
        </p>
      )}
      {tasks?.length === 0 && <p className="text-muted">Nothing waiting. Every task sent in has been looked at.</p>}
      {!!tasks?.length && (
        <ol className="grid max-w-[70ch] gap-0">
          {tasks.map((t) => (
            <ReviewItem key={t.id} task={t} onDone={() => load()} />
          ))}
        </ol>
      )}
    </main>
  );
}

function ReviewItem({ task, onDone }: { task: BingoTask; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function review(action: "approve" | "reject") {
    setBusy(true);
    setError("");
    try {
      await api(`/bingo/review/${task.id}`, "PATCH", { action, note });
      onDone();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <li className="grid justify-items-start gap-2 border-b border-line py-4">
      <p className="text-[14px] text-muted">
        {task.region} · sent in by {task.submittedBy ?? "someone"} on {dateFmt.format(new Date(task.createdAt))}
      </p>
      <p className="text-[18px] font-bold">{task.title}</p>
      {task.description && <p className="text-muted">{task.description}</p>}
      {rejecting ? (
        <div className="grid w-full gap-2">
          <label htmlFor={`note-${task.id}`}>Why not? (optional, shown to the sender)</label>
          <input id={`note-${task.id}`} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-small" disabled={busy} onClick={() => review("reject")}>
              Turn it down
            </button>
            <button className="btn btn-quiet btn-small" disabled={busy} onClick={() => setRejecting(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button className="btn btn-small" disabled={busy} onClick={() => review("approve")}>
            Approve
          </button>
          <button className="btn btn-quiet btn-small" disabled={busy} onClick={() => setRejecting(true)}>
            Turn down
          </button>
        </div>
      )}
      {error && (
        <p className="font-semibold text-red" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
