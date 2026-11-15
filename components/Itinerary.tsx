"use client";

import { useState } from "react";
import PlanForm from "@/components/PlanForm";
import { api, errorText } from "@/lib/api";
import { dayLabel, planDays } from "@/lib/itinerary";
import type { PlanItem, Trip } from "@/lib/types";

const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
const timeLabel = (t: string | null) => (t ? timeFmt.format(new Date(`1970-01-01T${t}:00Z`)) : "Any time");

/** The trip's days drawn as a road, a marker post per day, each day's plans beside it. */
export default function Itinerary({
  trip,
  items,
  onChange,
}: {
  trip: Trip;
  items: PlanItem[];
  onChange: () => Promise<void>;
}) {
  // Which form is open: "new:<date>" to add on that day, or an item id to edit it.
  const [open, setOpen] = useState<string | null>(null);
  const days = planDays(trip, items);

  async function done() {
    setOpen(null);
    await onChange().catch((e) => alert(errorText(e)));
  }

  async function remove(item: PlanItem) {
    if (!confirm(`Remove "${item.title}" from the itinerary?`)) return;
    try {
      await api(`/trips/${trip.id}/items/${item.id}`, "DELETE");
      await onChange();
    } catch (e) {
      alert(errorText(e));
    }
  }

  const form = (date: string, item?: PlanItem) => (
    <PlanForm tripId={trip.id} date={date} days={days} item={item} onDone={done} onCancel={() => setOpen(null)} />
  );

  return (
    <section className="grid content-start gap-7" aria-labelledby="itinerary-heading">
      <h2 id="itinerary-heading">Itinerary</h2>
      <ol className="road road-itinerary">
        {days.map((day) => (
          <li key={day.date} className="relative grid justify-items-start gap-3 pb-9">
            <span className={day.n ? "marker" : "marker marker-off"} aria-hidden>
              {day.n ?? "!"}
            </span>
            <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[22px] leading-[1.2] font-extrabold">
              {day.n ? `Day ${day.n}` : "Outside the trip dates"}
              <span className="text-[16px] font-semibold text-muted">{dayLabel(day.date)}</span>
            </h3>

            {day.items.length > 0 && (
              <ul className="grid w-full gap-2">
                {day.items.map((item) =>
                  open === item.id ? (
                    <li key={item.id}>{form(day.n ? day.date : trip.startDate, item)}</li>
                  ) : (
                    <li
                      key={item.id}
                      className="grid grid-cols-[80px_minmax(0,1fr)_auto] gap-x-3.5 gap-y-1 rounded-md border border-line bg-white px-3.5 py-3 max-sm:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      <span className="font-bold tabular-nums">{timeLabel(item.time)}</span>
                      <div className="grid gap-0.5 wrap-anywhere max-sm:col-span-full max-sm:row-start-2">
                        <p className="font-bold">{item.title}</p>
                        {item.place && <p>{item.place}</p>}
                        {item.note && <p className="whitespace-pre-line">{item.note}</p>}
                        <p className="text-[14px] text-muted">Added by {item.addedBy}</p>
                      </div>
                      <div className="flex items-start gap-3.5">
                        <button className="link-btn" onClick={() => setOpen(item.id)}>
                          Edit
                        </button>
                        <button className="link-btn text-red" onClick={() => remove(item)}>
                          Remove
                        </button>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}

            {day.n === null && (
              <p className="text-[14px] text-muted">The trip dates changed. Move these plans to a trip day, or remove them.</p>
            )}
            {day.n !== null && open === `new:${day.date}` && form(day.date)}
            {day.n !== null && open !== `new:${day.date}` && (
              <button className="link-btn text-[15px] no-underline hover:underline" onClick={() => setOpen(`new:${day.date}`)}>
                + {day.items.length ? "Add another plan" : "Add a plan"}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
