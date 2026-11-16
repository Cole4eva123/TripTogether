import Link from "next/link";

export default function GasolineIntelligenceLink({
  href = "/trips/gasoline-intelligence",
  compact = false,
  className = "",
}: { href?: string; compact?: boolean; className?: string }) {
  return <Link
    href={href}
    className={`btn gap-2 border-white/20 bg-[linear-gradient(115deg,#0a6e4f_0%,#0e7490_50%,#4338ca_100%)] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_4px_12px_rgb(10_110_79/0.16)] transition-[translate,box-shadow,filter] duration-200 hover:-translate-y-0.5 hover:border-white/30 hover:brightness-105 hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_6px_18px_rgb(67_56_202/0.22)] active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${compact ? "btn-small" : ""} ${className}`}
  >
    <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className="h-4 w-4 shrink-0">
      <path d="m8 3 1.8 5.2L15 10l-5.2 1.8L8 17l-1.8-5.2L1 10l5.2-1.8L8 3Z" />
      <path d="m16 1 .8 2.2L19 4l-2.2.8L16 7l-.8-2.2L13 4l2.2-.8L16 1Z" />
    </svg>
    Gasoline Intelligence
  </Link>;
}
