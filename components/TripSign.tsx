import Link from "next/link";
import type { Trip } from "@/lib/types";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const day = (d: string) => new Date(`${d}T00:00:00Z`);

/**
 * A trip drawn as a highway guide sign: destination in big letters, the invite code on a tab above it like an exit
 * number. With `href` it's a link in a list (h2); without, it heads the trip's own page (h1).
 */
export default function TripSign({ trip, href }: { trip: Trip; href?: string }) {
  const Title = href ? "h2" : "h1";
  const body = (
    <>
      <span className="sign-tab">
        <span className="sr-only">Invite code </span>
        {trip.inviteCode}
      </span>
      <span className="absolute top-[22px] right-[30px] text-[44px] leading-none font-extrabold max-sm:right-[22px] max-sm:text-[36px]" aria-hidden>
        ↑
      </span>
      <Title className="text-[clamp(30px,7vw,44px)] leading-[1.05] font-extrabold tracking-[-0.01em] wrap-anywhere">{trip.destination}</Title>
      <span className="text-[18px] font-semibold">From {trip.origin}</span>
      <span className="text-[18px] font-semibold">
        {dateFmt.formatRange(day(trip.startDate), day(trip.endDate))}
        <span className="ml-4 font-normal max-sm:ml-0 max-sm:block">
          {trip.memberCount} {trip.memberCount === 1 ? "traveler" : "travelers"}
        </span>
      </span>
    </>
  );
  return href ? (
    <Link href={href} className="sign sign-trip">
      {body}
    </Link>
  ) : (
    <div className="sign sign-trip">{body}</div>
  );
}
