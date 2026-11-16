"use client";

import { useEffect, useRef, useState } from "react";
import { isDay } from "@/lib/validate";

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * A date field for the lobby's filters: typed as YYYY-MM-DD, or picked from a month calendar. It reports a value
 * only once it is a real day (or empty), so the lobby never asks the server about a half-typed date.
 */
export default function LobbyDate({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const initial = isDay(value) ? new Date(`${value}T12:00:00Z`) : new Date();
  const [month, setMonth] = useState(initial.getUTCMonth());
  const [year, setYear] = useState(initial.getUTCFullYear());
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  // A click outside closes the calendar.
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const invalid = !!draft && !isDay(draft);

  function move(delta: number) {
    const d = new Date(Date.UTC(year, month + delta, 1));
    setMonth(d.getUTCMonth());
    setYear(d.getUTCFullYear());
  }

  function pick(date: string) {
    setDraft(date);
    onChange(date);
    setOpen(false);
  }

  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return (
    <div
      ref={root}
      className="relative grid min-w-0 gap-1.5"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <label htmlFor={id} className="text-[12px] font-semibold text-muted">
        {label}
      </label>
      <div
        className={`flex min-w-0 items-center rounded-lg border bg-white focus-within:ring-2 focus-within:ring-green/15 ${invalid ? "border-red" : "border-line/70"}`}
      >
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="YYYY-MM-DD"
          value={draft}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            if (!e.target.value || isDay(e.target.value)) onChange(e.target.value);
          }}
          className="min-h-10 w-full min-w-0 border-0 bg-transparent px-3 text-[13px] focus:outline-none"
        />
        <button
          ref={trigger}
          type="button"
          aria-label={`Choose ${label.toLowerCase()}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-md text-green hover:bg-green/10"
        >
          <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M7 2v6m10-6v6M3 11h18" />
          </svg>
        </button>
      </div>
      {invalid && (
        <p id={`${id}-error`} role="alert" className="text-[11px] text-red">
          Use a valid date: YYYY-MM-DD.
        </p>
      )}
      {open && (
        <div
          role="dialog"
          aria-label={`${label} calendar`}
          className="absolute top-full left-0 z-30 mt-2 w-[268px] rounded-xl border border-line bg-white p-3 shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <button type="button" aria-label="Previous month" className="h-8 w-8 rounded hover:bg-paper" onClick={() => move(-1)}>
              ‹
            </button>
            <span aria-live="polite" className="text-[13px] font-bold">
              {monthNames[month]} {year}
            </span>
            <button type="button" aria-label="Next month" className="h-8 w-8 rounded hover:bg-paper" onClick={() => move(1)}>
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-[12px]">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <span key={d} className="pb-2 text-[10px] text-muted">
                {d}
              </span>
            ))}
            {Array.from({ length: firstWeekday }, (_, i) => (
              <span key={`blank${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const day = i + 1;
              const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              return (
                <button
                  key={day}
                  type="button"
                  aria-label={date}
                  aria-pressed={value === date}
                  onClick={() => {
                    pick(date);
                    trigger.current?.focus();
                  }}
                  className={`h-8 rounded-md ${value === date ? "bg-green text-white" : "hover:bg-paper"}`}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <button type="button" className="link-btn mt-3 text-[12px]" onClick={() => pick("")}>
            Clear date
          </button>
        </div>
      )}
    </div>
  );
}
