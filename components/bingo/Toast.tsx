"use client";

import { useEffect, useRef } from "react";

/** A short note after an action. A `big` one is a Bingo: a guide sign that stays up longer. */
export type ToastNote = { id: number; title: string; detail?: string; big?: boolean };

/** Shows one note at the bottom of the screen, then closes itself. A newer note replaces it. */
export default function Toast({ note, onClose }: { note: ToastNote | null; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(onClose, note.big ? 6000 : 2500);
    // Rise in from below; a Bingo also gives a small bounce. Skipped when the system asks for less motion.
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      box.current?.animate(
        note.big
          ? [
              { transform: "translateY(24px) scale(0.9)", opacity: 0 },
              { transform: "translateY(0) scale(1.06)", opacity: 1, offset: 0.6 },
              { transform: "translateY(0) scale(1)", opacity: 1 },
            ]
          : [
              { transform: "translateY(16px)", opacity: 0 },
              { transform: "translateY(0)", opacity: 1 },
            ],
        { duration: note.big ? 500 : 200, easing: "ease-out" },
      );
    }
    return () => clearTimeout(timer);
  }, [note, onClose]);

  return (
    // Always in the page, so screen readers announce what's put in it.
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4" role="status" aria-live="polite">
      {note && (
        <div
          ref={box}
          key={note.id}
          className={
            note.big
              ? "sign pointer-events-auto grid max-w-120 gap-1 px-8 pt-6 pb-5 text-center max-sm:px-6"
              : "pointer-events-auto grid max-w-120 gap-0.5 rounded-lg bg-asphalt px-5 pt-3 pb-2.5 text-white shadow-lg"
          }
          onClick={onClose}
        >
          <p className={note.big ? "text-[28px] leading-[1.1] font-extrabold" : "font-bold"}>{note.title}</p>
          {note.detail && <p className={note.big ? "text-[16px]" : "text-[14px] opacity-80"}>{note.detail}</p>}
        </div>
      )}
    </div>
  );
}
