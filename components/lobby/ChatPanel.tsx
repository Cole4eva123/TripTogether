"use client";

import { useEffect, useRef, useState } from "react";
import { api, errorText } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";

/** How often the conversation is fetched again, in milliseconds. */
const POLL_MS = 3000;

const timeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** When a message was written, the way a person reads a chat. */
const stamp = (iso: string) => timeFmt.format(new Date(iso));

/**
 * The chat group of a trip. Everyone in the trip is in it, and the other people's words arrive on a short
 * poll.
 */
export default function ChatPanel({
  tripId,
  meId,
  onError,
}: {
  tripId: string;
  meId: string;
  onError: (message: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);

  // Poll for the other people's words. A short poll keeps it live enough without a socket.
  useEffect(() => {
    let alive = true;
    const pull = () =>
      api<{ messages: ChatMessage[] }>(`/trips/${tripId}/chat`).then(
        (d) => {
          if (!alive) return;
          // A fetch started before Send may arrive after its POST response.
          // Keep already confirmed messages instead of making them disappear.
          setMessages((current) => {
            const byId = new Map(current.map((message) => [message.id, message]));
            for (const message of d.messages) byId.set(message.id, message);
            return [...byId.values()].sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id));
          });
          setPolling(true);
          setError("");
        },
        (e) => {
          if (!alive) return;
          const text = errorText(e);
          setError(text);
          setPolling(false);
          onError(text);
        },
      );
    // Schedule after completion so slow requests cannot overtake newer responses.
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await pull();
      if (alive) timer = setTimeout(loop, POLL_MS);
    };
    void loop();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [tripId, onError]);

  // Keep the newest line in sight. The scroll happens inside the conversation box, not on the page, so a
  // long talk doesn't drag the whole page down every time a message arrives.
  useEffect(() => {
    const box = listRef.current;
    if (box && followLatest.current) box.scrollTop = box.scrollHeight;
  }, [messages.length]);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    try {
      const { message } = await api<{ message: ChatMessage }>(`/trips/${tripId}/chat`, "POST", { body: text });
      followLatest.current = true;
      setMessages((m) => m.some((item) => item.id === message.id) ? m : [...m, message]);
      setBody("");
    } catch (err) {
      const text2 = errorText(err);
      setError(text2);
      onError(text2);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {/* The conversation, on paper, in its own box that scrolls on its own. */}
      <div
        ref={listRef}
        role="log"
        aria-label="Conversation messages"
        onScroll={() => {
          const box = listRef.current;
          if (box) followLatest.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
        }}
        className="grid max-h-[58vh] gap-4 overflow-y-auto rounded-xl border-2 border-line bg-white p-5"
      >
        {messages.length === 0 && (
          <p className="py-8 text-center text-muted">
            No messages yet. Say hello — this is where the group works out the details.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.senderId === meId;
          return (
            <div key={m.id} className={`grid gap-1 ${mine ? "justify-items-end" : "justify-items-start"}`}>
              <p className="text-[13px] font-bold tracking-wide text-muted uppercase">
                {mine ? "You" : m.senderName}
                <span className="ml-2 font-normal normal-case tracking-normal">{stamp(m.sentAt)}</span>
              </p>
              <p
                className={`max-w-full whitespace-pre-wrap [overflow-wrap:anywhere] rounded-xl border-2 px-4 py-2.5 text-[15px] ${
                  mine ? "border-green bg-green text-white" : "border-line bg-paper text-asphalt"
                }`}
              >
                {m.body}
              </p>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="font-semibold text-red" role="alert">
          {error}
        </p>
      )}

      {/* Say that the conversation keeps itself up to date, so nobody waits for a reply that already arrived. */}
      <p className="text-[13px] text-muted">
        {polling ? "Checking for new messages every few seconds." : "Not checking for new messages right now."}
      </p>

      <form className="grid gap-2" onSubmit={send}>
        <label htmlFor="body" className="text-[15px] font-bold text-asphalt">
          Your message
        </label>
        <textarea
          id="body"
          name="body"
          rows={3}
          maxLength={2000}
          disabled={busy}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="We're free the whole week. Want to split the hotel too?"
        />
        <div>
          <button className="btn" disabled={busy || !body.trim()}>
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
