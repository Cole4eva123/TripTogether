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
    <section className="itinerary" aria-labelledby="itinerary-heading">
      <h2 id="itinerary-heading">Itinerary</h2>
      <ol className="road">
        {days.map((day) => (
          <li key={day.date} className="road-stop">
            <span className={day.n ? "marker" : "marker marker-off"} aria-hidden>
              {day.n ?? "!"}
            </span>
            <h3>
              {day.n ? `Day ${day.n}` : "Outside the trip dates"}
              <span className="day-date">{dayLabel(day.date)}</span>
            </h3>

            {day.items.length > 0 && (
              <ul className="plans">
                {day.items.map((item) =>
                  open === item.id ? (
                    <li key={item.id}>{form(day.n ? day.date : trip.startDate, item)}</li>
                  ) : (
                    <li key={item.id} className="plan">
                      <span className="plan-time">{timeLabel(item.time)}</span>
                      <div className="plan-body">
                        <p className="plan-title">{item.title}</p>
                        {item.place && <p>{item.place}</p>}
                        {item.note && <p className="plan-note">{item.note}</p>}
                        <p className="plan-by">Added by {item.addedBy}</p>
                      </div>
                      <div className="plan-actions">
                        <button className="link-btn" onClick={() => setOpen(item.id)}>
                          Edit
                        </button>
                        <button className="link-btn link-danger" onClick={() => remove(item)}>
                          Remove
                        </button>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}

            {day.n === null && (
              <p className="hint">The trip dates changed. Move these plans to a trip day, or remove them.</p>
            )}
            {day.n !== null && open === `new:${day.date}` && form(day.date)}
            {day.n !== null && open !== `new:${day.date}` && (
              <button className="btn btn-quiet btn-small" onClick={() => setOpen(`new:${day.date}`)}>
                {day.items.length ? "Add another plan" : "Add a plan"}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
