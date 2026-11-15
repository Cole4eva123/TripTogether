"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "@/lib/api";
import type { BingoRegion, BingoTask } from "@/lib/bingo-types";

type Library = { regions: BingoRegion[]; tasks: BingoTask[]; mine: BingoTask[]; isAdmin: boolean };

const STATUS: Record<BingoTask["status"], string> = {
  pending: "Waiting for review",
  approved: "In the library",
  rejected: "Turned down",
};

/** The Bingo task library: browse a region's tasks, send new ones in, and see what became of yours. */
export default function TaskLibraryPage() {
  const router = useRouter();
  const region = useSearchParams().get("region") ?? "";
  const [lib, setLib] = useState<Library | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      api<Library>(`/bingo/tasks?region=${encodeURIComponent(region)}`).then((l) => {
        setLib(l);
        setError("");
      }),
    [region],
  );

  useEffect(() => {
    load().catch((e) => setError(errorText(e)));
  }, [load]);

  const known = lib?.regions.some((r) => r.region === region);

  return (
    <main className="mx-auto grid max-w-240 gap-10 px-4 pt-4 pb-16">
      <header className="grid gap-2">
        <h1>Bingo task library</h1>
        <p className="max-w-[60ch] text-muted">
          Things to do in each place, sent in by travelers. Groups draw their Bingo cards from here. A new task joins
          the library once an admin has looked at it.
        </p>
        {lib?.isAdmin && (
          <p>
            <Link href="/trips/bingo/review" className="link-btn">
              Review the tasks people sent in
            </Link>
          </p>
        )}
      </header>

      {error && (
        <p className="font-semibold text-red" role="alert">
          {error}
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-14 max-md:grid-cols-1 max-md:gap-10">
        <section className="grid content-start gap-4">
          <h2>Browse a region</h2>
          <div className="grid max-w-[40ch] gap-1.5">
            <label htmlFor="browse-region">Region</label>
            <select
              id="browse-region"
              value={known ? region : ""}
              onChange={(e) =>
                router.replace(e.target.value ? `?region=${encodeURIComponent(e.target.value)}` : "?", { scroll: false })
              }
            >
              <option value="">Choose a region</option>
              {lib?.regions.map((r) => (
                <option key={r.region} value={r.region}>
                  {r.region} · {r.taskCount} tasks
                </option>
              ))}
            </select>
          </div>
          {lib && region && !known && (
            <p className="max-w-[60ch] text-muted">
              There are no tasks for {region} yet. Send in the first ones, and once they&rsquo;re approved, groups
              going there can draw a card.
            </p>
          )}
          {lib && known && (
            <ol className="grid gap-0">
              {lib.tasks.map((t) => (
                <li key={t.id} className="grid gap-0.5 border-b border-line py-3">
                  <span className="font-bold">{t.title}</span>
                  {t.description && <span className="text-muted">{t.description}</span>}
                  {t.submittedBy && <span className="text-[13px] text-muted">Sent in by {t.submittedBy}</span>}
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="grid content-start gap-9">
          <section className="grid gap-3">
            <h2>Send in a task</h2>
            <TaskForm
              key={region}
              regions={lib?.regions ?? []}
              initialRegion={region}
              onSent={() => load().catch((e) => setError(errorText(e)))}
            />
          </section>

          {!!lib?.mine.length && (
            <section className="grid gap-3">
              <h2>What you sent in</h2>
              <ul className="w-full">
                {lib.mine.map((t) => (
                  <li key={t.id} className="grid gap-0.5 border-b border-line py-2.5">
                    <span className="font-bold">{t.title}</span>
                    <span className="text-[14px] text-muted">
                      {t.region} ·{" "}
                      <span className={t.status === "rejected" ? "text-red" : t.status === "approved" ? "text-green" : ""}>
                        {STATUS[t.status]}
                      </span>
                    </span>
                    {t.status === "rejected" && t.reviewNote && (
                      <span className="text-[14px] text-muted">&ldquo;{t.reviewNote}&rdquo;</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}

/** The form that sends a task in for review. */
function TaskForm({
  regions,
  initialRegion,
  onSent,
}: {
  regions: BingoRegion[];
  initialRegion: string;
  onSent: () => void;
}) {
  const [region, setRegion] = useState(initialRegion);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSent("");
    try {
      const { task } = await api<{ task: BingoTask }>("/bingo/tasks", "POST", { region, title, description });
      setTitle("");
      setDescription("");
      setSent(`Thanks. It joins the ${task.region} library once an admin approves it.`);
      onSent();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-1.5">
        <label htmlFor="task-region">City or area</label>
        <input
          id="task-region"
          list="task-regions"
          value={region}
          maxLength={60}
          required
          onChange={(e) => setRegion(e.target.value)}
          placeholder="Chicago"
        />
        <datalist id="task-regions">
          {regions.map((r) => (
            <option key={r.region} value={r.region} />
          ))}
        </datalist>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="task-title">The task</label>
        <input
          id="task-title"
          value={title}
          maxLength={120}
          required
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Watch the sunrise at Navy Pier"
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="task-description">Tips (optional)</label>
        <textarea
          id="task-description"
          rows={2}
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Get to the end of the pier before the sun comes up."
        />
      </div>
      {error && (
        <p className="font-semibold text-red" role="alert">
          {error}
        </p>
      )}
      {sent && (
        <p className="font-semibold text-green" role="status">
          {sent}
        </p>
      )}
      <div>
        <button className="btn" disabled={busy}>
          Send it in
        </button>
      </div>
    </form>
  );
}
