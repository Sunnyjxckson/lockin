"use client";

// The pieces of the chat screen: the thread, one message, and the composer.

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { ActionButton, Chip, cn } from "@/components/ui";
import { MAX_MESSAGE } from "@/lib/logic/coachChat";
import { addDays, formatDateLong } from "@/lib/logic/dates";
import type { CoachMessage, CoachTrigger, DateStr } from "@/lib/types";

const QUOTE_LINE = /^"(.+)"\s*(.*?)\.?$/;

const CHECKIN_LABEL: Record<Exclude<CoachTrigger, "chat">, string> = {
  post_workout: "After the workout",
  slip: "After a slip",
  missed_item: "Yesterday",
};

/** A coach message. A line that is a quote is set apart: the line, then the name small under it. */
function CoachBody({ body }: { body: string }) {
  const lines = body.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return (
    <div className="flex flex-col gap-2">
      {lines.map((line, i) => {
        const q = QUOTE_LINE.exec(line);
        if (!q || q[2].length > 40) {
          return (
            <p key={i} className="text-[15px] leading-[1.5] text-ink">
              {line}
            </p>
          );
        }
        return (
          <figure key={i} className="border-l border-accent py-0.5 pl-3">
            <blockquote className="text-[17px] leading-[1.35] font-medium tracking-[-0.01em] text-ink">{q[1]}</blockquote>
            {q[2] ? <figcaption className="t-caption mt-1 text-ink-2">{q[2]}</figcaption> : null}
          </figure>
        );
      })}
    </div>
  );
}

function Bubble({ m }: { m: CoachMessage }) {
  if (m.sender === "me") {
    return (
      <li className="flex justify-end" data-from="me">
        <p className="max-w-[82%] rounded-[20px] rounded-br-[8px] bg-ink px-4 py-2.5 text-[15px] leading-[1.45] whitespace-pre-wrap text-bg">{m.body}</p>
      </li>
    );
  }
  return (
    <li className="animate-fade-in flex justify-start" data-from="coach" data-trigger={m.trigger}>
      <div className="tile max-w-[88%] rounded-[20px] rounded-bl-[8px] px-4 py-3">
        {m.trigger !== "chat" ? <p className="t-label mb-2">{CHECKIN_LABEL[m.trigger]}</p> : null}
        <CoachBody body={m.body} />
      </div>
    </li>
  );
}

function dayLabel(date: DateStr, today: DateStr): string {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  return formatDateLong(date);
}

/** The conversation, oldest first, with a small label where the day changes. It keeps the newest message in view. */
export function Thread({ messages, thinking, today }: { messages: CoachMessage[]; thinking: boolean; today: DateStr }) {
  const count = messages.length;
  // The page scrolls, not the list: go to the very end, so the newest message clears the composer.
  useLayoutEffect(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  }, [count, thinking]);

  return (
    <ol className="flex flex-col gap-2.5" aria-label="Conversation" aria-live="polite">
      {messages.map((m, i) => {
        const first = i === 0 || messages[i - 1].date !== m.date;
        return (
          <Fragment key={m.id}>
            {first ? <li className={cn("t-label text-center", i > 0 && "mt-4")}>{dayLabel(m.date, today)}</li> : null}
            <Bubble m={m} />
          </Fragment>
        );
      })}
      {thinking ? (
        <li className="flex justify-start" aria-label="The coach is writing">
          <span className="tile flex h-11 items-center gap-1.5 rounded-[20px] rounded-bl-[8px] px-4" aria-hidden>
            <span className="animate-pulse-dot size-1.5 rounded-full bg-ink-2" />
            <span className="animate-pulse-dot size-1.5 rounded-full bg-ink-2 [animation-delay:160ms]" />
            <span className="animate-pulse-dot size-1.5 rounded-full bg-ink-2 [animation-delay:320ms]" />
          </span>
        </li>
      ) : null}
      {/* Room for the composer, which floats over the end of the page. */}
      <li className="h-[72px]" aria-hidden />
    </ol>
  );
}

/** What to say when nothing comes to mind. One tap sends it. */
export const STARTERS: { label: string; text: string }[] = [
  { label: "Sore", text: "I'm sore from the workout." },
  { label: "Urge", text: "I have an urge right now." },
  { label: "Not feeling it", text: "I don't feel like doing it today." },
  { label: "Tired", text: "I'm tired." },
  { label: "Slipped", text: "I slipped." },
];

/** How much of the bottom of the screen the keyboard covers. On iOS it covers the layout viewport without resizing it. */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const fit = () => {
      const covered = Math.round(window.innerHeight - vv.height - vv.offsetTop);
      setInset(covered > 80 ? covered : 0);
    };
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
    };
  }, []);
  return inset;
}

export interface ComposerProps {
  onSend: (text: string) => void;
  busy: boolean;
  /** Show the starter chips above the field. */
  starters: boolean;
}

/** The message field, floating above the tab bar, or above the keyboard while it is open. */
export function Composer({ onSend, busy, starters }: ComposerProps) {
  const [text, setText] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const inset = useKeyboardInset();

  // Grow with the text, up to about four lines.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [text]);

  const send = (value: string) => {
    const v = value.trim();
    if (!v || busy) return;
    onSend(v);
    setText("");
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 z-30" style={{ bottom: inset > 0 ? `${inset + 8}px` : "calc(var(--tabbar-h) + var(--safe-b))" }}>
      <div className="pointer-events-auto mx-auto w-full max-w-[480px] px-5">
        {starters ? (
          <div className="-mx-5 mb-2.5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Quick messages">
            {STARTERS.map((s) => (
              <Chip key={s.label} on={false} disabled={busy} onClick={() => send(s.text)} className="bg-surface-2">
                {s.label}
              </Chip>
            ))}
          </div>
        ) : null}
        <form
          className="shadow-float flex items-end gap-2 rounded-[26px] border border-line bg-surface-2 py-1.5 pr-1.5 pl-4"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <label htmlFor="coach-message" className="sr-only">
            Message the coach
          </label>
          <textarea
            id="coach-message"
            ref={field}
            rows={1}
            value={text}
            maxLength={MAX_MESSAGE}
            enterKeyHint="send"
            placeholder="What is in the way?"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(text);
              }
            }}
            className="min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2.5 text-[16px] leading-[1.45] text-ink outline-none placeholder:text-ink-3"
          />
          <ActionButton label="Send" size={44} type="submit" disabled={busy || !text.trim()}>
            <ArrowUp size={20} strokeWidth={2} aria-hidden />
          </ActionButton>
        </form>
      </div>
    </div>
  );
}
