"use client";

import { forwardRef, useId, useImperativeHandle, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

export type AnimatedDisclosureHandle = { open: boolean };
type Props = { title: string; children: ReactNode; className?: string; summaryClassName?: string };
const bodyBase = "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none";
const bodyOpen = "grid-rows-[1fr] opacity-100";
const bodyClosed = "grid-rows-[0fr] opacity-0";
const triggerStyle = "flex cursor-pointer items-center justify-between gap-2 py-1 text-left text-[13px] font-semibold text-green";

/** Keeps the content mounted while height animates, and opens invalid required fields before focus. */
const AnimatedDisclosure = forwardRef<AnimatedDisclosureHandle, Props>(function AnimatedDisclosure({ title, children, className = "", summaryClassName = "" }, ref) {
  const [open, setOpen] = useState(false);
  const id = useId();
  useImperativeHandle(ref, () => ({ get open() { return open; }, set open(value: boolean) { setOpen(value); } }), [open]);
  return <div className={className} onInvalidCapture={() => { flushSync(() => setOpen(true)); }}>
    <button type="button" aria-expanded={open} aria-controls={id} className={`${triggerStyle} w-full ${summaryClassName}`} onClick={() => setOpen(value => !value)}>
      <span>{title}</span>
      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : "rotate-0"}`}>
        <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
    <div id={id} aria-hidden={!open} inert={!open} className={`${bodyBase} ${open ? bodyOpen : bodyClosed}`}>
      <div className="min-h-0 overflow-hidden"><div className="pt-3">{children}</div></div>
    </div>
  </div>;
});
export default AnimatedDisclosure;

let mapDisclosureId = 0;
/** The map owns its popup DOM; use the same animation and keyboard-accessible button there. */
export function createMapDisclosure(title: string, content: HTMLElement): HTMLElement {
  const root = document.createElement("div"), button = document.createElement("button"), body = document.createElement("div");
  const clip = document.createElement("div"), padding = document.createElement("div"), arrow = document.createElement("span");
  const id = `fuel-map-distance-${++mapDisclosureId}`;
  let open = false;
  root.className = "mt-2";
  button.type = "button";
  button.className = `${triggerStyle} w-full`;
  button.setAttribute("aria-expanded", "false");button.setAttribute("aria-controls", id);
  button.append(document.createTextNode(title));
  arrow.textContent = "⌄";arrow.setAttribute("aria-hidden", "true");
  arrow.className = "inline-block transition-transform duration-200 motion-reduce:transition-none";button.append(arrow);
  body.id = id;body.className = `${bodyBase} ${bodyClosed}`;body.inert = true;body.setAttribute("aria-hidden", "true");
  clip.className = "min-h-0 overflow-hidden";padding.className = "pt-2";
  padding.append(content);clip.append(padding);body.append(clip);root.append(button, body);
  button.addEventListener("click", event => {
    event.stopPropagation();open = !open;
    button.setAttribute("aria-expanded", String(open));body.setAttribute("aria-hidden", String(!open));body.inert = !open;
    body.className = `${bodyBase} ${open ? bodyOpen : bodyClosed}`;
    arrow.style.transform = open ? "rotate(180deg)" : "rotate(0deg)";
  });
  return root;
}
