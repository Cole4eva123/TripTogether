"use client";

import { useEffect, useRef, useState } from "react";

export default function OneClickPlanButton() {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  function cancelTimer() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }
  function show() {
    if (timer.current !== null || open) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      setOpen(true);
    }, 1000);
  }
  function hide() {
    cancelTimer();
    setOpen(false);
  }
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  return <div
    ref={wrapper}
    className="relative grid"
    onPointerEnter={event => { if (event.pointerType !== "touch") show(); }}
    onPointerLeave={() => { if (!wrapper.current?.contains(document.activeElement)) hide(); }}
    onFocus={show}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) hide(); }}
    onKeyDown={event => { if (event.key === "Escape") hide(); }}
  >
    <button className="btn" type="submit" value="auto" aria-describedby={open ? "one-click-plan-help" : undefined} onClick={hide}>
      One-click plan
    </button>
    {open && <div id="one-click-plan-help" role="tooltip" className="absolute inset-x-0 bottom-full z-20 pb-3">
      <div className="relative rounded-xl border-2 border-green bg-paper px-4 py-3 text-[13px] leading-relaxed text-asphalt shadow-lg">
        <p>Plan fuel and rest stops around your selected 1–3 hour interval, balancing prices, vehicle range, membership discounts, detours and preferred facilities.</p>
        <span aria-hidden="true" className="absolute -bottom-[7px] left-7 h-3 w-3 rotate-45 border-r-2 border-b-2 border-green bg-paper" />
      </div>
    </div>}
  </div>;
}
