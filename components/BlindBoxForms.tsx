"use client";

import type { BlindBoxSettings } from "@/lib/blind-box-types";
import { categories } from "@/lib/blind-box-types";
import type { Trip } from "@/lib/types";

type Submit = (body: Record<string, unknown>, method?: string) => Promise<boolean>;
const fieldClass = "grid content-start gap-1.5";

export function BlindBoxSetup({ trip, previous, busy, submit, onCancel }: {
  trip: Trip; previous?: { id: string; settings: BlindBoxSettings }; busy: boolean; submit: Submit; onCancel?: () => void;
}) {
  const defaults = previous?.settings;
  async function create(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form);
    await submit({ ...body, budget: Number(body.budget), availableMinutes: Number(body.availableMinutes), maxStops: Number(body.maxStops), preferences: form.getAll("preferences"), previousRoundId: previous?.id }, "POST");
  }
  return (
    <form className="grid gap-5 rounded-md border-2 border-green bg-white p-5" onSubmit={create}>
      <h2>{previous ? "Plan another surprise" : "Pack your blind box"}</h2>
      <p className="text-muted">Set the limits, invite hidden ideas, then reveal a mystery itinerary for everyone.</p>
      <fieldset disabled={busy} className="grid gap-4 disabled:opacity-60">
        <div className={fieldClass}>
          <label htmlFor="box-destination">Destination</label>
          <input id="box-destination" name="destination" defaultValue={defaults?.destination ?? trip.destination} required maxLength={120} />
        </div>
        <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
          <div className={fieldClass}>
            <label htmlFor="box-date">Trip day</label>
            <input id="box-date" name="date" type="date" min={trip.startDate} max={trip.endDate} defaultValue={defaults && defaults.date >= trip.startDate && defaults.date <= trip.endDate ? defaults.date : trip.startDate} required />
          </div>
          <div className={fieldClass}>
            <label htmlFor="box-time">Start time</label>
            <input id="box-time" name="startTime" type="time" defaultValue={defaults?.startTime ?? "09:00"} required />
          </div>
          <div className={fieldClass}>
            <label htmlFor="box-budget">Budget per person (USD)</label>
            <input id="box-budget" name="budget" type="number" min="0" max="10000" step="0.01" defaultValue={defaults?.budget ?? 60} required />
          </div>
          <div className={fieldClass}>
            <label htmlFor="box-duration">Available time (minutes)</label>
            <input id="box-duration" name="availableMinutes" type="number" min="15" max="720" step="1" defaultValue={defaults?.availableMinutes ?? 240} required />
          </div>
          <div className={fieldClass}>
            <label htmlFor="box-stops">Maximum stops</label>
            <select id="box-stops" name="maxStops" defaultValue={defaults?.maxStops ?? 3}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-2 font-bold">Activity preferences</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {categories.map((category) => (
              <label key={category} className="flex items-center gap-2 font-normal">
                <input type="checkbox" name="preferences" value={category} defaultChecked={defaults ? defaults.preferences.includes(category) : true} className="min-h-5 w-5 accent-green" />
                {category}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="text-[14px] text-muted">Activity costs only, per person. The schedule includes a 15-minute buffer between stops; check actual travel times yourself. Fewer stops may fit your limits.</p>
        {previous && <p className="text-[14px] text-muted">Starting another box replaces this reveal. Plans already added to the itinerary stay there.</p>}
        <div className="flex flex-wrap gap-3">
          <button className="btn">{busy ? "Packing…" : "Open for hidden ideas"}</button>
          {onCancel && <button type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button>}
        </div>
      </fieldset>
    </form>
  );
}

export function BlindBoxOptionForm({ settings, busy, submit }: { settings: BlindBoxSettings; busy: boolean; submit: Submit }) {
  async function add(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = Object.fromEntries(new FormData(element));
    if (await submit({ action: "submit", option: { ...form, cost: Number(form.cost), durationMinutes: Number(form.durationMinutes) } })) element.reset();
  }
  return (
    <form className="grid gap-4 rounded-md border border-line bg-white p-5" onSubmit={add}>
      <h2>Add a hidden idea</h2>
      <p className="text-muted">An attraction, restaurant or activity in {settings.destination}. Only you can see its details until the reveal. Up to 10 ideas per person.</p>
      <fieldset disabled={busy} className="grid gap-4 disabled:opacity-60">
        <div className={fieldClass}>
          <label htmlFor="option-title">What will we do?</label>
          <input id="option-title" name="title" placeholder="Try a secret neighborhood lunch spot" maxLength={120} required />
        </div>
        <div className={fieldClass}>
          <label htmlFor="option-place">Place</label>
          <input id="option-place" name="place" placeholder="Name or address" maxLength={120} required />
        </div>
        <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
          <div className={fieldClass}>
            <label htmlFor="option-category">Category</label>
            <select id="option-category" name="category">{settings.preferences.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <div className={fieldClass}>
            <label htmlFor="option-cost">Cost per person (USD)</label>
            <input id="option-cost" name="cost" type="number" min="0" max={settings.budget} step="0.01" required />
          </div>
          <div className={fieldClass}>
            <label htmlFor="option-duration">Duration (minutes)</label>
            <input id="option-duration" name="durationMinutes" type="number" min="15" max={settings.availableMinutes} step="1" required />
          </div>
        </div>
        <div className={fieldClass}>
          <label htmlFor="option-note">Note <span className="font-normal text-muted">optional</span></label>
          <textarea id="option-note" name="note" rows={2} maxLength={500} />
        </div>
        <button className="btn justify-self-start">Submit hidden idea</button>
      </fieldset>
    </form>
  );
}
