"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LotteryBoxOptionForm, LotteryBoxSetup } from "@/components/LotteryBoxForms";
import LotteryBoxDraw from "@/components/LotteryBoxDraw";
import { useMe } from "@/components/me";
import { api, errorText } from "@/lib/api";
import type { LotteryBoxView } from "@/lib/lottery-box-types";
import { dayLabel } from "@/lib/itinerary";
import type { Member, Trip } from "@/lib/types";

type Data = { trip: Trip; members: Member[]; box: LotteryBoxView | null };
type BoxResponse = { box: LotteryBoxView | null };

export default function LotteryBoxPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [another, setAnother] = useState(false);
  const path = `/trips/${id}/lottery-box`;

  useEffect(() => {
    if (busy) return;
    let cancelled = false;
    let loading = false;
    async function refresh() {
      if (loading) return;
      loading = true;
      try {
        const [tripData, boxData] = await Promise.all([api<{ trip: Trip; members: Member[] }>(`/trips/${id}`), api<BoxResponse>(path)]);
        if (!cancelled) setData({ ...tripData, box: boxData.box });
      } catch (e) {
        if (!cancelled) setError(errorText(e));
      } finally { loading = false; }
    }
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [id, path, busy]);

  async function submit(body: Record<string, unknown>, method = "PATCH", presentReveal?: (box: LotteryBoxView) => Promise<void>) {
    if (busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<BoxResponse>(path, method, { roundId: data?.box?.id, ...body });
      // Hold this page's reveal until the reels land; other members get the same server result by polling.
      if (presentReveal && result.box?.result) await presentReveal(result.box);
      setData((previous) => previous && { ...previous, box: result.box });
      setAnother(false);
      setNotice(body.action === "save" ? "Mystery itinerary added. Open your trip to see the plans." : body.action === "submit" ? "Your idea is sealed until the reveal." : body.action === "reveal" ? "The surprise is ready for everyone." : method === "DELETE" ? "The lottery box was reset." : "Lottery box updated.");
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally { setBusy(false); }
  }

  const box = data?.box;
  const isOwner = data?.trip.ownerId === me?.id;
  return (
    <main className="mx-auto max-w-240 px-4 pt-4 pb-16">
      <Link href={`/trips/${id}`} className="mb-8 inline-block">Back to your trip</Link>
      <header className="mb-8 grid gap-3">
        <p className="text-[14px] font-bold tracking-[0.12em] text-muted uppercase">Take the surprise exit</p>
        <h1 className="sign justify-self-start px-8 py-6">Travel lottery box</h1>
        <p className="max-w-160 text-muted">Let your group pick the possibilities. Let chance pick the route.</p>
      </header>
      {error && <p className="mb-5 font-semibold text-red" role="alert">{error}</p>}
      {notice && <p className="mb-5 font-semibold text-green" role="status">{notice}</p>}
      {!data || !me ? <p role="status">Loading your lottery box…</p> : (
        <div className="grid grid-cols-[minmax(0,1fr)_260px] items-start gap-9 max-md:grid-cols-1">
          <div className="grid min-w-0 gap-6">
            {(!box || another) && (isOwner ? (
              <LotteryBoxSetup key={box?.id ?? "new"} trip={data.trip} previous={box ? { id: box.id, settings: box.settings } : undefined} busy={busy} submit={submit} onCancel={box ? () => setAnother(false) : undefined} />
            ) : <p className="rounded-md border border-line bg-white p-5">Your organizer can open a lottery box. Once it is ready, add your hidden ideas here.</p>)}
            {box && !another && (
              <>
                <section className="grid gap-4 rounded-md border border-line bg-white p-5" aria-labelledby="box-settings">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 id="box-settings">{box.status === "collecting" ? "Your box is collecting ideas" : "Your mystery itinerary"}</h2>
                    <span className="rounded-md bg-paper px-3 py-1 text-[14px] font-bold text-green">{box.status === "collecting" ? "Sealed" : "Revealed"}</span>
                  </div>
                  <p className="wrap-anywhere text-[22px] font-extrabold">{box.settings.destination}</p>
                  <dl className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
                    <div><dt className="text-[14px] text-muted">When</dt><dd>{dayLabel(box.settings.date)}, {box.settings.startTime}</dd></div>
                    <div><dt className="text-[14px] text-muted">Budget per person</dt><dd>${box.settings.budget.toFixed(2)} USD</dd></div>
                    <div><dt className="text-[14px] text-muted">Available time</dt><dd>{box.settings.availableMinutes} minutes</dd></div>
                    <div><dt className="text-[14px] text-muted">Maximum stops</dt><dd>{box.settings.maxStops}</dd></div>
                  </dl>
                  <p className="text-[14px] text-muted">{box.settings.preferences.join(" · ")}</p>
                </section>
                <LotteryBoxDraw key={box.id} box={box} isOwner={isOwner} busy={busy} onDraw={(present) => submit({ action: "reveal" }, "PATCH", present)} />
                {box.status === "collecting" ? (
                  <>
                    <LotteryBoxOptionForm key={box.id} settings={box.settings} busy={busy} submit={submit} />
                    {box.ownOptions.length > 0 && <section className="grid gap-3" aria-labelledby="your-ideas">
                      <h2 id="your-ideas">Your sealed ideas</h2>
                      <ul className="grid gap-2">{box.ownOptions.map((option) => <li key={option.id} className="flex items-start justify-between gap-4 rounded-md border border-line bg-white p-4">
                        <div className="min-w-0 wrap-anywhere"><p className="font-bold">{option.title}</p><p>{option.place}</p><p className="text-[14px] text-muted">{option.category} · ${option.cost.toFixed(2)} · {option.durationMinutes} min</p>{option.note && <p className="whitespace-pre-line text-[14px]">{option.note}</p>}</div>
                        <button className="link-btn text-red disabled:opacity-60" disabled={busy} onClick={() => void submit({ action: "remove", optionId: option.id })}>Remove</button>
                      </li>)}</ul>
                    </section>}
                  </>
                ) : box.result && (
                  <>
                    <p className="font-semibold">${box.result.totalCost.toFixed(2)} per person · {box.result.totalMinutes} minutes including buffers · {box.result.stops.length} stops</p>
                    <ol className="road road-itinerary mt-3">
                      {box.result.stops.map((stop, index) => <li key={stop.id} className="relative pb-7">
                        <span className="marker" aria-hidden>{index + 1}</span>
                        <article className="grid gap-1 rounded-md border border-line bg-white p-4 wrap-anywhere">
                          <p className="text-[14px] font-bold text-green">{stop.time} · {stop.durationMinutes} min</p>
                          <h2>{stop.title}</h2><p>{stop.place}</p>
                          <p className="text-[14px] text-muted">{stop.category} · ${stop.cost.toFixed(2)} per person · {stop.submittedBy ? `Idea from ${stop.addedBy}` : "Demo suggestion"}</p>
                          {stop.note && <p className="whitespace-pre-line text-[14px]">{stop.note}</p>}
                        </article>
                      </li>)}
                    </ol>
                    <div className="flex flex-wrap gap-3">
                      <button className="btn" disabled={busy || box.saved} onClick={() => void submit({ action: "save" })}>{box.saved ? "Added to itinerary" : "Add all stops to itinerary"}</button>
                      <Link href={`/trips/${id}`} className="btn btn-quiet">View trip itinerary</Link>
                    </div>
                    {!!box.revealedOptions?.length && <section className="grid gap-3">
                      <h2>Everyone’s hidden ideas, revealed</h2>
                      <p className="text-[14px] text-muted">All submitted ideas are shown here, including those the draw did not select.</p>
                      <ul className="grid gap-2">{box.revealedOptions.map((option) => <li key={option.id} className="rounded-md border border-line bg-white p-4 wrap-anywhere">
                        <p className="font-bold">{option.title}</p><p>{option.place}</p><p className="text-[14px] text-muted">{option.addedBy} · {option.category} · ${option.cost.toFixed(2)} · {option.durationMinutes} min</p>{option.note && <p className="whitespace-pre-line text-[14px]">{option.note}</p>}
                      </li>)}</ul>
                    </section>}
                    {isOwner && <button className="btn btn-quiet justify-self-start" disabled={busy} onClick={() => setAnother(true)}>Start another box</button>}
                  </>
                )}
                {isOwner && box.status === "collecting" && <button className="link-btn justify-self-start text-red" disabled={busy} onClick={() => {
                  if (confirm("Reset this lottery box and remove everyone's hidden ideas?")) void submit({}, "DELETE");
                }}>Reset this box</button>}
              </>
            )}
          </div>
          <aside className="grid gap-7">
            {box && <section className="grid gap-3">
              <h2>Sealed by your group</h2>
              <ul>{data.members.map((member) => <li key={member.id} className="flex justify-between gap-3 border-b border-line py-2.5"><span className="min-w-0 wrap-anywhere">{member.name}{member.id === me.id ? " (you)" : ""}</span><span className="shrink-0 text-muted">{box.submissions.find((s) => s.memberId === member.id)?.count ?? 0} ideas</span></li>)}</ul>
              <p className="text-[14px] text-muted">Updates every 5 seconds. Hidden ideas stay private until the organizer reveals the box.</p>
            </section>}
            <section className="grid gap-3 border-t border-line pt-4">
              <h2>A little local inspiration</h2>
              <p className="text-[14px] text-muted">Demo suggestions cover Chicago, New York and San Francisco. For other destinations, build the box with your group’s hidden ideas.</p>
              <p className="text-[14px] text-muted">Costs and durations are estimates. Check prices, opening hours and actual travel times. Transport costs are extra.</p>
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}
