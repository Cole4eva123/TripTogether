"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import PlaceField from "@/components/PlaceField";
import { api, errorText } from "@/lib/api";
import type { BingoRegion, BingoTask } from "@/lib/bingo-types";

type Library = { regions: BingoRegion[]; tasks: BingoTask[]; mine: BingoTask[]; isAdmin: boolean; pendingCount: number };

const STATUS: Record<BingoTask["status"], string> = {
  pending: "Waiting for review",
  approved: "In the library",
  rejected: "Turned down",
};

/**
 * The Bingo task library. Every region is a button at the top, so any one is a click away. Members browse it and
 * suggest tasks, which wait for review; admins also add tasks straight in, rewrite them, take them out, and see
 * how many suggestions are waiting.
 */
export default function TaskLibraryPage() {
  const router = useRouter();
  const asked = useSearchParams().get("region") ?? "";
  const [lib, setLib] = useState<Library | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      api<Library>(`/bingo/tasks?region=${encodeURIComponent(asked)}`).then((l) => {
        setLib(l);
        setError("");
      }),
    [asked],
  );

  useEffect(() => {
    load().catch((e) => setError(errorText(e)));
  }, [load]);

  // Open on the first region when none was asked for, so the page never starts empty.
  const first = lib?.regions[0]?.region;
  useEffect(() => {
    if (!asked && first) router.replace(`?region=${encodeURIComponent(first)}`, { scroll: false });
  }, [asked, first, router]);

  const region = asked;
  const known = lib?.regions.some((r) => r.region === region);
  const reload = () => load().catch((e) => setError(errorText(e)));
  const admin = !!lib?.isAdmin;

  return (
    <main className="mx-auto grid max-w-240 gap-8 px-4 pt-4 pb-16">
      <header className="grid gap-3">
        <h1>Bingo task library</h1>
        <p className="max-w-[60ch] text-muted">
          {admin
            ? "Things to do in each place. Bingo challenges are built from these. As an admin, you can add tasks straight in, rewrite them, or take them out."
            : "Things to do in each place, sent in by travelers. Bingo challenges are built from these. Suggest a task and it joins the library once an admin approves it."}
        </p>
        {admin && (
          <p className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/trips/bingo/challenges">Build a challenge</Link>
            {lib.pendingCount > 0 ? (
              <Link href="/trips/bingo/review" className="btn btn-small">
                {lib.pendingCount === 1 ? "1 suggestion" : `${lib.pendingCount} suggestions`} waiting for review
              </Link>
            ) : (
              <Link href="/trips/bingo/review" className="link-btn">
                Review queue: nothing waiting
              </Link>
            )}
          </p>
        )}
      </header>

      {error && (
        <p className="font-semibold text-red" role="alert">
          {error}
        </p>
      )}

      {lib && (
        <nav aria-label="Regions" className="flex flex-wrap gap-2">
          {lib.regions.map((r) => (
            <Link
              key={r.region}
              href={`?region=${encodeURIComponent(r.region)}`}
              replace
              scroll={false}
              aria-current={r.region === region ? "page" : undefined}
              className={r.region === region ? "btn btn-small" : "btn btn-quiet btn-small"}
            >
              {r.region} · {r.taskCount}
            </Link>
          ))}
        </nav>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-14 max-md:grid-cols-1 max-md:gap-10">
        <section className="grid content-start gap-4">
          <h2>{region && known ? `${region} · ${lib?.tasks.length} tasks` : "Tasks"}</h2>
          {lib && region && !known && (
            <p className="max-w-[60ch] text-muted">
              There are no tasks for {region} yet.{" "}
              {admin
                ? "Add the first ones, then build a challenge from them."
                : "Suggest the first ones, and once they're approved, an admin can build a challenge from them."}
            </p>
          )}
          {lib && known && (
            <ol className="grid gap-0">
              {lib.tasks.map((t) => (
                <TaskRow key={t.id} task={t} admin={admin} onChanged={reload} />
              ))}
            </ol>
          )}
        </section>

        <aside className="grid content-start gap-9">
          <section className="grid gap-3">
            <h2>{admin ? "Add a task" : "Suggest a task"}</h2>
            <p className="text-[14px] text-muted">
              {admin ? "It goes straight into the library." : "An admin looks at it before it joins the library."}
            </p>
            <TaskForm key={region} initialRegion={region} admin={admin} onSent={reload} />
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

/** One task of the library. An admin can rewrite it in place or take it out. */
function TaskRow({
  task,
  admin,
  onChanged,
}: {
  task: BingoTask;
  admin: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm(`Take "${task.title}" out of the ${task.region} library? Cards that already have it keep it.`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/bingo/tasks/${task.id}`, "DELETE");
      onChanged();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <li className="grid gap-1 border-b border-line py-3">
      {editing ? (
        <TaskForm
          initialRegion={task.region}
          admin
          editing={task}
          onSent={() => {
            setEditing(false);
            onChanged();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <span className="font-bold">{task.title}</span>
          {task.description && <span className="text-muted">{task.description}</span>}
          {task.submittedBy && <span className="text-[13px] text-muted">Sent in by {task.submittedBy}</span>}
          {admin && (
            <span className="flex flex-wrap gap-4 text-[14px]">
              <button className="link-btn" disabled={busy} onClick={() => setEditing(true)}>
                Edit
              </button>
              <button className="link-btn text-red" disabled={busy} onClick={remove}>
                Take out
              </button>
            </span>
          )}
        </>
      )}
      {error && (
        <p className="font-semibold text-red" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

/** Adds a task (an admin's goes straight in, a member's waits for review), or rewrites one when `editing`. */
function TaskForm({
  initialRegion,
  admin,
  editing,
  onSent,
  onCancel,
}: {
  initialRegion: string;
  admin: boolean;
  editing?: BingoTask;
  onSent: () => void;
  onCancel?: () => void;
}) {
  const [region, setRegion] = useState(initialRegion);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const [busy, setBusy] = useState(false);
  const id = editing ? `edit-${editing.id}` : "task";

  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSent("");
    try {
      const body = { region, title, description };
      if (editing) {
        await api(`/bingo/tasks/${editing.id}`, "PATCH", body);
      } else {
        const { task } = await api<{ task: BingoTask }>("/bingo/tasks", "POST", body);
        setTitle("");
        setDescription("");
        setSent(
          task.status === "approved"
            ? `Added to the ${task.region} library.`
            : `Thanks. It joins the ${task.region} library once an admin approves it.`,
        );
      }
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
        <label htmlFor={`${id}-region`}>City</label>
        <PlaceField id={`${id}-region`} value={region} onChange={setRegion} placeholder="Chicago" />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-title`}>The task</label>
        <input
          id={`${id}-title`}
          value={title}
          maxLength={120}
          required
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Watch the sunrise at Navy Pier"
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-description`}>Tips (optional)</label>
        <textarea
          id={`${id}-description`}
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
      <div className="flex flex-wrap gap-3">
        <button className={editing ? "btn btn-small" : "btn"} disabled={busy}>
          {editing ? "Save" : admin ? "Add it" : "Send it in"}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-quiet btn-small" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
