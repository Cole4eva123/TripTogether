"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "@/lib/api";
import { BINGO_SIZES, DEFAULT_SIZE } from "@/lib/bingo";
import type { BingoChallenge, BingoRegion, BingoTask } from "@/lib/bingo-types";

type Library = { regions: BingoRegion[]; tasks: BingoTask[]; isAdmin: boolean };

/**
 * Admins only: build a challenge from one city's library (click tasks to fill the squares in order, click a filled
 * square to empty it), publish it for every group, and withdraw the ones on offer.
 */
export default function ChallengesPage() {
  const [region, setRegion] = useState("");
  const [lib, setLib] = useState<Library | null>(null);
  const [published, setPublished] = useState<BingoChallenge[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [size, setSize] = useState<number>(DEFAULT_SIZE);
  const [picked, setPicked] = useState<BingoTask[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      Promise.all([
        api<Library>(`/bingo/tasks?region=${encodeURIComponent(region)}`),
        api<{ challenges: BingoChallenge[] }>("/bingo/challenges"),
      ]).then(([l, c]) => {
        setLib(l);
        setPublished(c.challenges);
        if (!region && l.regions[0]) setRegion(l.regions[0].region);
      }),
    [region],
  );

  useEffect(() => {
    load().catch((e) => setError(errorText(e)));
  }, [load]);

  /** Runs a write, then reloads; returns whether it went through. */
  async function act(call: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await call();
      await load();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const squares = size * size;
  // A picked task leaves its square (the later ones move up); another fills the next empty square, if there is one.
  const toggle = (task: BingoTask) =>
    setPicked((p) => {
      if (p.some((t) => t.id === task.id)) return p.filter((t) => t.id !== task.id);
      return p.length < squares ? [...p, task] : p;
    });

  const publish = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { region, title, description, size, taskIds: picked.map((t) => t.id) };
    if (await act(() => api("/bingo/challenges", "POST", body))) {
      setTitle("");
      setDescription("");
      setPicked([]);
    }
  };

  const withdraw = (c: BingoChallenge) => {
    if (confirm(`Withdraw "${c.title}"? Groups already playing it keep their cards.`)) act(() => api(`/bingo/challenges/${c.id}`, "DELETE"));
  };

  if (lib && !lib.isAdmin)
    return (
      <main className="mx-auto grid max-w-240 gap-4 px-4 pt-4 pb-16">
        <h1>Bingo challenges</h1>
        <p className="text-muted">Only admins can publish challenges.</p>
      </main>
    );

  return (
    <main className="mx-auto grid max-w-240 gap-8 px-4 pt-4 pb-16">
      <Link href="/trips/bingo/tasks" className="justify-self-start">
        Back to the task library
      </Link>
      <header className="grid gap-2">
        <h1>Bingo challenges</h1>
        <p className="max-w-[60ch] text-muted">
          A challenge is a card of one city&rsquo;s tasks in fixed squares. Every group can take it on, and plays one
          challenge at a time.
        </p>
      </header>

      {error && (
        <p className="font-semibold text-red" role="alert">
          {error}
        </p>
      )}

      <form onSubmit={publish} className="grid gap-6 border-t border-line pt-6">
        <h2>New challenge</h2>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-4 max-sm:grid-cols-1">
          <label className="grid gap-1">
            City
            <select
              value={region}
              onChange={(e) => {
                setRegion(e.target.value);
                setPicked([]);
              }}
            >
              {lib?.regions.map((r) => (
                <option key={r.region}>{r.region}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
          </label>
          <label className="grid gap-1">
            Size
            <select
              value={size}
              onChange={(e) => {
                const n = Number(e.target.value);
                setSize(n);
                setPicked((p) => p.slice(0, n * n));
              }}
            >
              {BINGO_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} × {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="grid gap-1">
          Description (optional)
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        </label>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-10 max-md:grid-cols-1">
          <section className="grid content-start gap-2">
            <h3>{region} library</h3>
            <p className="text-[14px] text-muted">Click a task to put it in the next empty square.</p>
            <ul>
              {lib?.tasks.map((t) => {
                const at = picked.findIndex((p) => p.id === t.id);
                return (
                  <li key={t.id} className="border-b border-line">
                    <button
                      type="button"
                      className="flex w-full items-baseline gap-3 py-2 text-left disabled:opacity-60"
                      disabled={at < 0 && picked.length === squares}
                      onClick={() => toggle(t)}
                      aria-pressed={at >= 0}
                    >
                      <span className="w-6 shrink-0 font-bold text-green">{at >= 0 ? at + 1 : ""}</span>
                      <span className={at >= 0 ? "font-bold" : ""}>{t.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="grid content-start gap-2">
            <h3>
              The card, {picked.length} of {squares} squares
            </h3>
            <p className="text-[14px] text-muted">Click a filled square to empty it.</p>
            <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
              {Array.from({ length: squares }, (_, i) => {
                const task = picked[i];
                return (
                  <li key={i} className="grid">
                    <button
                      type="button"
                      disabled={!task}
                      onClick={() => task && toggle(task)}
                      className={`grid aspect-square content-start gap-1 rounded-md border-2 p-1.5 text-left text-[12px] leading-[1.25] ${task ? "border-green bg-white" : "border-dashed border-line text-muted"}`}
                    >
                      <span className="font-bold">{i + 1}</span>
                      {task && <span className="line-clamp-4">{task.title}</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <div>
          <button className="btn" disabled={busy || picked.length < squares || !title.trim()}>
            Publish challenge
          </button>
        </div>
      </form>

      <section className="grid gap-3 border-t border-line pt-6">
        <h2>On offer</h2>
        {published.length === 0 && <p className="text-muted">No challenges are on offer.</p>}
        <ul>
          {published.map((c) => (
            <li key={c.id} className="flex items-baseline justify-between gap-4 border-b border-line py-2.5">
              <span>
                <span className="font-bold">{c.title}</span>
                <span className="text-muted">
                  , {c.region}, {c.size} × {c.size}
                  {c.createdBy ? `, by ${c.createdBy}` : ", a starter"}
                </span>
              </span>
              <button className="link-btn" disabled={busy} onClick={() => withdraw(c)}>
                Withdraw
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
