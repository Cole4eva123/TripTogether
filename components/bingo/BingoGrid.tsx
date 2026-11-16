"use client";

import { useEffect, useRef } from "react";
import type { BingoCard, BingoCell, BingoView } from "@/lib/bingo-types";

/**
 * The card as a grid. A square that's done turns into a green guide sign; a square on a finished line also gets
 * the road's yellow centre-line colour around it, so a Bingo stands out at a glance. Undo shows only on the
 * squares the viewer may undo: their own, or every one for an admin. The squares in `flash` (a line just
 * finished) pulse once so the new Bingo is easy to find.
 */
export default function BingoGrid({
  card,
  viewer,
  flash,
  busy,
  onMark,
}: {
  card: BingoCard;
  viewer: BingoView["viewer"];
  flash: { id: number; positions: number[] } | null;
  busy: string | null; // the id of the square waiting on the server
  onMark: (cell: BingoCell, done: boolean) => void;
}) {
  const onLine = new Set(card.lines.flat());
  const squares = useRef(new Map<number, HTMLLIElement>());

  useEffect(() => {
    if (!flash || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    flash.positions.forEach((p, i) =>
      squares.current.get(p)?.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }],
        { duration: 450, delay: i * 90, iterations: 2, easing: "ease-in-out" },
      ),
    );
  }, [flash]);
  return (
    // Bigger cards keep a usable square size on a phone and scroll sideways instead.
    <div className="max-w-full overflow-x-auto pb-2">
      <ol
        className="grid gap-2.5 max-sm:gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${card.size}, minmax(0, 1fr))`,
          minWidth: card.size > 3 ? `${card.size * 120}px` : undefined,
        }}
        aria-label={`${card.size} by ${card.size} Bingo card`}
      >
        {card.cells.map((cell) => {
          const done = cell.completedAt !== null;
          const line = onLine.has(cell.position);
          return (
            <li
              key={cell.id}
              ref={(el) => {
                if (el) squares.current.set(cell.position, el);
                else squares.current.delete(cell.position);
              }}
              className={
                done
                  ? "sign grid min-h-40 content-between gap-2 p-4 max-sm:min-h-32 max-sm:p-3"
                  : "grid min-h-40 content-between gap-2 rounded-xl border-2 border-line bg-white p-4 max-sm:min-h-32 max-sm:p-3"
              }
              style={line ? { outline: "4px solid var(--color-lane)", outlineOffset: "2px" } : undefined}
            >
              <div className="grid gap-1">
                <p className="text-[16px] leading-[1.25] font-bold max-sm:text-[14px]">{cell.task.title}</p>
                {cell.task.description && (
                  <p className={`text-[13px] leading-[1.35] max-sm:hidden ${done ? "text-white/80" : "text-muted"}`}>
                    {cell.task.description}
                  </p>
                )}
              </div>
              <div className="grid justify-items-start gap-1 text-[13px]">
                {done ? (
                  <>
                    <span className="text-white/80">Done by {cell.completedBy}</span>
                    {(viewer.admin || cell.completedById === viewer.id) && (
                      <button
                        className="link-btn text-white"
                        disabled={busy === cell.id}
                        onClick={() => onMark(cell, false)}
                      >
                        Undo
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    className="btn btn-small max-sm:px-2.5"
                    disabled={busy === cell.id}
                    onClick={() => onMark(cell, true)}
                  >
                    Done
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
