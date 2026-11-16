"use client";

import type { BingoChallenge } from "@/lib/bingo-types";

/**
 * The challenges a trip can take on, each a green guide sign that is itself the button: the trip's own city first,
 * the rest under "Other cities". `current` is the one the trip is playing, which isn't offered again.
 */
export default function ChallengeList({
  challenges,
  region,
  current,
  busy,
  onPick,
}: {
  challenges: BingoChallenge[];
  region: string | null;
  current?: string;
  busy: boolean;
  onPick: (challenge: BingoChallenge) => void;
}) {
  const offered = challenges.filter((c) => c.id !== current);
  const groups = [
    { heading: region && `In ${region}`, list: offered.filter((c) => c.region === region) },
    { heading: region && "Other cities", list: offered.filter((c) => c.region !== region) },
  ].filter((g) => g.list.length);
  if (!groups.length) return <p className="text-muted">No other challenges are on offer yet.</p>;

  return (
    <div className="grid gap-6">
      {groups.map((g, i) => (
        <section key={i} className="grid gap-3">
          {g.heading && <h3>{g.heading}</h3>}
          <ul className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
            {g.list.map((c) => (
              <li key={c.id} className="grid">
                <button
                  className="sign grid content-start gap-1 px-6 pt-5 pb-5 text-left hover:[--bg:var(--color-green-dark)] disabled:opacity-60"
                  disabled={busy}
                  onClick={() => onPick(c)}
                >
                  <span className="text-[22px] leading-[1.15] font-extrabold">{c.title}</span>
                  <span className="text-[14px] text-white/80">
                    {c.region}, {c.size} × {c.size}
                  </span>
                  {c.description && <span className="text-[15px]">{c.description}</span>}
                  <span className="mt-3 text-[15px] font-bold underline">Take this on</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
