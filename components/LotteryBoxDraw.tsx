"use client";

import { useEffect, useRef, useState } from "react";
import type { LotteryBoxCategory, LotteryBoxResult, LotteryBoxView } from "@/lib/lottery-box-types";

type Phase = "idle" | "spinning" | "settling";
type PresentReveal = (box: LotteryBoxView) => Promise<void>;
const CELL_HEIGHT = 112;
const REPEATS = 3;
const reelColumns = ["", "mx-auto max-w-40 grid-cols-1", "mx-auto max-w-80 grid-cols-2", "grid-cols-3", "grid-cols-4 max-sm:grid-cols-2", "grid-cols-5 max-sm:grid-cols-3"];

function ActivityIcon({ category, empty = false }: { category: LotteryBoxCategory | null; empty?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="size-11 max-sm:size-9" aria-hidden="true">
      {empty ? <path d="M15 24h18" /> : category === "Food" ? <>
        <path d="M12 8v11m6-11v11M9 8v11a6 6 0 0 0 12 0V8M15 25v15M35 8c-6 5-8 12-8 18h8M35 8v32" />
      </> : category === "Outdoors" ? <>
        <path d="m24 5-12 16h6L9 32h12v10h6V32h12l-9-11h6L24 5Z" />
      </> : category === "Culture" ? <>
        <path d="m6 17 18-10 18 10H6ZM9 39h30M7 43h34M13 21v13m11-13v13m11-13v13" />
      </> : category === "Adventure" ? <>
        <path d="m5 39 15-26 7 12 5-8 12 22H5ZM15 22l5 4 4-4M20 13V5h10l-3 4 3 4H20" />
      </> : category === "Relaxation" ? <>
        <path d="M10 21h24v10a9 9 0 0 1-9 9h-6a9 9 0 0 1-9-9V21ZM34 22h3a5 5 0 0 1 0 10h-3M7 43h31M16 6c-5 5 5 6 0 11M25 6c-5 5 5 6 0 11" />
      </> : category === "Sightseeing" ? <>
        <path d="M24 43s13-12 13-24a13 13 0 1 0-26 0c0 12 13 24 13 24Z" /><circle cx="24" cy="19" r="5" />
      </> : <>
        <path d="M13 8h22l5 8-5 24H13L8 16l5-8Z" /><path d="M19 19a5 5 0 1 1 8 4c-2 1-3 2-3 5" /><circle cx="24" cy="33" r="1" fill="currentColor" stroke="none" />
      </>}
    </svg>
  );
}

/** Cosmetic reels only: every final symbol comes from the server's shared reveal. */
export default function LotteryBoxDraw({ box, isOwner, busy, onDraw }: {
  box: LotteryBoxView;
  isOwner: boolean;
  busy: boolean;
  onDraw: (present: PresentReveal) => Promise<boolean>;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<LotteryBoxResult | null>(null);
  const tracks = useRef<(HTMLDivElement | null)[]>([]);
  const locked = useRef(false);
  const mounted = useRef(false);
  const motionEnabled = useRef(true);
  const keepPosition = useRef(false);
  const finishSettle = useRef<(() => void) | null>(null);
  const finishDelay = useRef<(() => void) | null>(null);
  const symbols: (LotteryBoxCategory | null)[] = [null, ...box.settings.preferences];
  const symbolCount = symbols.length;
  const slotCount = box.settings.maxStops;
  const finalOffset = symbolCount * REPEATS * CELL_HEIGHT;
  const animating = phase !== "idle";
  const revealed = box.status === "revealed";
  const result = preview ?? box.result;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      finishDelay.current?.();
      finishSettle.current?.();
    };
  }, []);

  useEffect(() => {
    if (phase !== "spinning" || !motionEnabled.current) return;
    const reels = tracks.current.slice(0, slotCount);
    const animations = reels.map((track, index) => track?.animate([
      { transform: "translateY(0)" },
      { transform: `translateY(-${symbolCount * CELL_HEIGHT}px)` },
    ], { duration: 420 + index * 85, iterations: Infinity, easing: "linear" }));
    return () => {
      reels.forEach((track, index) => {
        if (track) track.style.transform = keepPosition.current ? getComputedStyle(track).transform : "translateY(0)";
        animations[index]?.cancel();
      });
    };
  }, [phase, symbolCount, slotCount]);

  useEffect(() => {
    if (phase !== "settling") return;
    let cancelled = false;
    const reels = tracks.current.slice(0, slotCount);
    const animations = motionEnabled.current ? reels.map((track, index) => track?.animate([
      { transform: getComputedStyle(track).transform },
      { transform: `translateY(-${finalOffset}px)` },
    ], { duration: 700 + index * 220, easing: "cubic-bezier(0.12, 0.75, 0.18, 1)", fill: "forwards" })) : [];

    void Promise.allSettled(animations.map((animation) => animation?.finished)).then(() => {
      if (cancelled) return;
      reels.forEach((track) => { if (track) track.style.transform = `translateY(-${finalOffset}px)`; });
      finishSettle.current?.();
      finishSettle.current = null;
    });
    return () => {
      cancelled = true;
      animations.forEach((animation) => animation?.cancel());
    };
  }, [phase, finalOffset, slotCount]);

  async function spin() {
    if (locked.current || busy || revealed || !isOwner || !box.eligibleCount) return;
    locked.current = true;
    keepPosition.current = false;
    motionEnabled.current = !window.matchMedia("(prefers-reduced-motion: reduce)").matches && typeof tracks.current[0]?.animate === "function";
    setPreview(null);
    setPhase("spinning");
    const minimumSpin = new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, motionEnabled.current ? 1200 : 0);
      finishDelay.current = () => { window.clearTimeout(timer); resolve(); };
    });

    try {
      await onDraw(async (next) => {
        await minimumSpin;
        if (!mounted.current) return;
        keepPosition.current = true;
        await new Promise<void>((resolve) => {
          finishSettle.current = resolve;
          setPreview(next.result);
          setPhase("settling");
        });
      });
    } finally {
      finishDelay.current?.();
      finishDelay.current = null;
      locked.current = false;
      if (mounted.current) setPhase("idle");
    }
  }

  const status = phase === "spinning" ? "Taking the scenic route…" : phase === "settling" ? "Your stops are falling into place…" : revealed ? `${box.result?.stops.length ?? 0} stops unlocked. Your route is ready.` : !box.eligibleCount ? "Every great detour starts with an idea." : isOwner ? "Your next adventure is one pull away." : "Your organizer has the keys to this surprise.";

  return (
    <section className="relative isolate overflow-hidden rounded-2xl border-2 border-green-dark bg-green p-2 shadow-[0_7px_0_var(--color-green-dark)]" aria-labelledby="draw-machine-heading" aria-busy={animating}>
      <div className="rounded-xl border-2 border-white/80 px-5 pt-5 pb-4 max-sm:px-3">
        <div className="mb-4 flex items-center justify-between gap-3 text-white">
          <div>
            <p className="mb-1 text-[11px] font-bold tracking-[0.18em] text-white/75 uppercase">The scenic route club</p>
            <h2 id="draw-machine-heading" className="text-[28px] leading-[1.1] font-extrabold max-sm:text-[24px]">Mystery miles</h2>
          </div>
          <span className="grid size-12 shrink-0 place-items-center rounded-full border-2 border-white/80 text-[24px]" aria-hidden="true">↗</span>
        </div>

        <div className="mb-4 flex justify-between px-1" aria-hidden="true">
          {Array.from({ length: 13 }, (_, index) => <span key={index} className={`size-1.5 rounded-full bg-lane ${animating ? "motion-safe:animate-pulse" : "opacity-80"}`} />)}
        </div>

        <div className="rounded-xl border border-white/20 bg-asphalt p-3 shadow-inner max-sm:p-2">
          <div className={`grid w-full gap-2 ${reelColumns[slotCount]}`} aria-hidden="true">
            {Array.from({ length: slotCount }, (_, index) => {
              const stop = result?.stops[index];
              return (
                <div key={index} className="min-w-0">
                  <p className="mb-1.5 text-center text-[10px] font-bold tracking-[0.12em] text-white/70 uppercase">Stop {String(index + 1).padStart(2, "0")}</p>
                  <div className="relative h-28 overflow-hidden rounded-md border-2 border-steel bg-paper text-green shadow-inner">
                    <div
                      ref={(element) => { tracks.current[index] = element; }}
                      className={animating ? "will-change-transform" : undefined}
                      style={revealed && !animating ? { transform: `translateY(-${finalOffset}px)` } : undefined}
                    >
                      {Array.from({ length: REPEATS }, (_, repeat) => symbols.map((category, symbolIndex) => (
                        <div key={`${repeat}-${symbolIndex}`} className="grid h-28 place-items-center"><ActivityIcon category={category} /></div>
                      )))}
                      <div className="grid h-28 place-items-center"><ActivityIcon category={stop?.category ?? null} empty={!stop} /></div>
                    </div>
                    <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-asphalt/15 via-transparent to-asphalt/15" />
                    <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-green/10" />
                  </div>
                  <p className="mt-2 min-h-8 text-center text-[11px] leading-[1.3] font-semibold text-white/85 wrap-anywhere">{revealed && !animating ? stop?.category ?? "Not needed" : "Sealed"}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-2" aria-hidden="true"><span className="size-1.5 rounded-full bg-lane" /><span className="grow border-t-2 border-dashed border-lane/70" /><span className="text-[18px] leading-none text-lane">→</span></div>
        </div>

        <p className="mt-4 min-h-6 text-center text-[14px] font-semibold text-white" role="status">{status}</p>
        {revealed ? (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-md border border-white/40 px-3 py-3 text-[16px] font-bold text-white"><span aria-hidden="true">✓</span> Adventure unlocked</div>
        ) : isOwner ? (
          <button className="group mt-4 flex min-h-15 w-full cursor-pointer items-center justify-center gap-4 rounded-md border-2 border-lane bg-lane px-4 py-2 text-[18px] font-extrabold text-asphalt shadow-[0_3px_0_var(--color-asphalt)] transition-[transform,box-shadow,background-color] hover:bg-white active:translate-y-0.5 active:shadow-none disabled:cursor-default disabled:opacity-60 motion-reduce:transition-none" disabled={busy || animating || !box.eligibleCount} onClick={() => void spin()}>
            <svg viewBox="0 0 36 36" className="size-8 shrink-0 transition-transform group-hover:-rotate-12 group-active:rotate-12 motion-reduce:transform-none motion-reduce:transition-none" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M7 30h20M11 29v-7h12v7M17 22 25 9" /><circle cx="27" cy="6" r="4" fill="currentColor" /></svg>
            {animating ? "Finding your detour…" : "Pull the lever"}
          </button>
        ) : <p className="mt-4 rounded-md border border-white/35 px-3 py-3 text-center text-[14px] text-white/85">Add your ideas below. The organizer will pull for everyone.</p>}

        <p className="mt-3 text-center text-[12px] text-white/75">{revealed ? "Same surprise, shared by the whole group." : `${box.eligibleCount} matching ideas · Up to ${slotCount} stops · One shared surprise`}</p>
      </div>
      {!revealed && <div className="border-t border-white/20 bg-green-dark px-4 py-3 text-center text-[12px] text-white/80">{!box.eligibleCount ? "Add a matching hidden idea below, or reset the box with different limits." : "Each window is a possible stop. Budget and time decide how many fit."}</div>}
    </section>
  );
}
