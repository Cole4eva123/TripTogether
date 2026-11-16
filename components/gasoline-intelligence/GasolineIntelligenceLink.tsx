"use client";

import Link from "next/link";
import { useEffect, useRef, type PointerEvent } from "react";

export default function GasolineIntelligenceLink({
  href = "/trips/gasoline-intelligence",
  compact = false,
  className = "",
}: { href?: string; compact?: boolean; className?: string }) {
  const rippleLayer = useRef<HTMLSpanElement>(null);
  const animations = useRef(new Set<Animation>());
  const lastRipple = useRef({ time: 0, x: 0, y: 0 });

  useEffect(() => {
    const active = animations.current;
    return () => { for (const animation of active) animation.cancel(); };
  }, []);

  function ripple(event: PointerEvent<HTMLAnchorElement>, entering = false) {
    if (event.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const layer = rippleLayer.current;
    if (!layer) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left, y = event.clientY - bounds.top, time = performance.now();
    const previous = lastRipple.current;
    if (!entering && (time - previous.time < 420 || Math.hypot(x - previous.x, y - previous.y) < 22)) return;
    lastRipple.current = { time, x, y };

    const size = Math.hypot(bounds.width, bounds.height) * 2;
    const wave = document.createElement("span");
    wave.className = "absolute rounded-full bg-[radial-gradient(circle,transparent_35%,rgb(255_255_255/0.32)_60%,transparent_72%)]";
    Object.assign(wave.style, { width: `${size}px`, height: `${size}px`, left: `${x - size / 2}px`, top: `${y - size / 2}px` });
    layer.append(wave);
    const animation = wave.animate([
      { transform: "scale(0.04)", opacity: 1 },
      { transform: "scale(1)", opacity: 0 },
    ], { duration: 1800, easing: "cubic-bezier(0.4, 0, 0.2, 1)" });
    animations.current.add(animation);
    const remove = () => { wave.remove(); animations.current.delete(animation); };
    animation.onfinish = remove;
    animation.oncancel = remove;
  }

  return <Link
    href={href}
    onPointerEnter={event => ripple(event, true)}
    onPointerMove={event => ripple(event)}
    className={`btn group relative isolate gap-2 overflow-hidden border-white/20 bg-[linear-gradient(115deg,#0a6e4f_0%,#0e7490_50%,#4338ca_100%)] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_4px_12px_rgb(10_110_79/0.16)] ${compact ? "btn-small" : ""} ${className}`}
  >
    <span ref={rippleLayer} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]" />
    <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className="relative z-10 h-4 w-4 shrink-0">
      <path d="m8 3 1.8 5.2L15 10l-5.2 1.8L8 17l-1.8-5.2L1 10l5.2-1.8L8 3Z" />
      <path d="m16 1 .8 2.2L19 4l-2.2.8L16 7l-.8-2.2L13 4l2.2-.8L16 1Z" />
    </svg>
    <span className="relative z-10 bg-[linear-gradient(100deg,#fde68a_0%,#a7f3d0_35%,#a5f3fc_65%,#f0abfc_100%)] bg-clip-text transition-colors duration-500 group-hover:text-transparent group-focus-visible:text-transparent motion-reduce:transition-none">Gasoline Intelligence</span>
  </Link>;
}
