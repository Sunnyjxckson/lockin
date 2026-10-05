"use client";

// The day as a vertical timeline. Blocks can be dragged to move and pulled by
// the grip on their bottom edge to resize. All of it runs on pointer events:
//
// - Mouse: drag starts after a few pixels of movement.
// - Touch: press and hold a block for a moment to pick it up, so an ordinary
//   swipe over a block still scrolls the page. Once a block is picked up the
//   page does not scroll under the finger. The grip resizes at once.
// - A plain tap opens the block for editing, which does everything dragging
//   does without dragging.
//
// While a block is being resized the preview already shows the flexible
// blocks after it shifting, using the same pure function the save uses.

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/components/ui";
import type { DayBlock } from "@/lib/blocks";
import { haptics } from "@/lib/haptics";
import { formatDuration, formatTime, timeFromMinutes } from "@/lib/logic/dates";
import {
  DAY_END,
  formatCountdown,
  layoutLanes,
  MIN_BLOCK,
  moveBlock,
  resizeBlock,
  snap,
  spanOf,
  timelineRange,
  timerState,
  type ShiftResult,
} from "@/lib/logic/schedule";
import { CALENDAR_ICON, KIND_ICON } from "./kinds";

export const PX_PER_MIN = 1.3;
const GUTTER = 52;
const SNAP = 5;
const HOLD_MS = 230;
const SLOP = 8;

export interface TimelineProps {
  blocks: readonly DayBlock[];
  /** Seconds since midnight in New York when this day is today, else null. */
  nowSeconds: number | null;
  /** Ids to draw with the warning edge. */
  flagged: ReadonlySet<string>;
  /** Free time blocks whose alert has been cleared. */
  cleared: ReadonlySet<string>;
  disabled?: boolean;
  onOpen: (block: DayBlock) => void;
  /** A drag finished. `result` is set for a resize and says what shifted. */
  onCommit: (after: DayBlock[], result: ShiftResult | null) => void;
  /** An empty spot was tapped. */
  onAddAt: (minute: number) => void;
}

type Mode = "pending" | "move" | "resize";

interface Gesture {
  id: string;
  pointerId: number;
  mode: Mode;
  touch: boolean;
  startY: number;
  startScroll: number;
  lastY: number;
  s: number;
  e: number;
  timer: number | null;
  moved: boolean;
}

interface Draft {
  id: string;
  mode: "move" | "resize";
  s: number;
  e: number;
}

function hourLabel(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h < 12 ? "AM" : "PM"}`;
}

export function Timeline({ blocks, nowSeconds, flagged, cleared, disabled = false, onOpen, onCommit, onAddAt }: TimelineProps) {
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  /** True when the last gesture moved something, so its click is not a tap. */
  const dragged = useRef(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const blocksRef = useRef(blocks);
  useEffect(() => {
    blocksRef.current = blocks;
  });

  const range = useMemo(() => timelineRange(blocks), [blocks]);
  const height = (range.e - range.s) * PX_PER_MIN;
  const y = (minute: number) => (minute - range.s) * PX_PER_MIN;

  // What to draw: the real blocks, or the preview while dragging.
  const shown = useMemo(() => {
    if (!draft) return blocks.slice();
    if (draft.mode === "move") return moveBlock(blocks, draft.id, draft.s);
    return resizeBlock(blocks, draft.id, draft.e).blocks;
  }, [blocks, draft]);
  const lanes = useMemo(() => layoutLanes(draft?.mode === "move" ? shown.filter((b) => b.id !== draft.id) : shown), [shown, draft]);
  const original = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);

  const setBoth = (d: Draft | null) => {
    draftRef.current = d;
    setDraft(d);
  };

  // While a block is held, the page must not scroll under the finger. A
  // touchmove listener can only stop the scroll if it is not passive, which
  // React's own handlers are, so it is attached by hand.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const stop = (e: TouchEvent) => {
      const g = gesture.current;
      if (g && g.mode !== "pending" && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, []);

  function track(g: Gesture) {
    const dy = g.lastY - g.startY + (window.scrollY - g.startScroll);
    const delta = snap(dy / PX_PER_MIN, SNAP);
    const len = g.e - g.s;
    let next: Draft;
    if (g.mode === "move") {
      const s = Math.max(range.s, Math.min(DAY_END - len, snap(g.s + delta, SNAP)));
      next = { id: g.id, mode: "move", s, e: s + len };
    } else {
      const e = Math.max(g.s + MIN_BLOCK, Math.min(DAY_END, snap(g.e + delta, SNAP)));
      next = { id: g.id, mode: "resize", s: g.s, e };
    }
    const prev = draftRef.current;
    if (!prev || prev.s !== next.s || prev.e !== next.e || prev.mode !== next.mode) setBoth(next);
  }

  function begin(g: Gesture, mode: "move" | "resize") {
    g.mode = mode;
    if (g.timer !== null) window.clearTimeout(g.timer);
    g.timer = null;
    haptics.tap();
    setBoth({ id: g.id, mode, s: g.s, e: g.e });
  }

  // Dragging near the top or bottom of the screen scrolls the page.
  useEffect(() => {
    if (!draft) return;
    let frame = 0;
    const step = () => {
      const g = gesture.current;
      if (g && g.mode !== "pending") {
        const edge = 110;
        const bottom = window.innerHeight - 150;
        let dy = 0;
        if (g.lastY < edge) dy = -Math.ceil((edge - g.lastY) / 8);
        else if (g.lastY > bottom) dy = Math.ceil((g.lastY - bottom) / 8);
        if (dy !== 0) {
          const before = window.scrollY;
          window.scrollBy(0, dy);
          if (window.scrollY !== before) track(g);
        }
      }
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft !== null]);

  function end(commit: boolean) {
    const g = gesture.current;
    gesture.current = null;
    if (g?.timer != null) window.clearTimeout(g.timer);
    const d = draftRef.current;
    setBoth(null);
    if (!g || !d || !commit) return;
    const base = blocksRef.current;
    if (d.mode === "move") {
      if (d.s !== g.s) onCommit(moveBlock(base, d.id, d.s), null);
    } else if (d.e !== g.e) {
      const result = resizeBlock(base, d.id, d.e);
      onCommit(result.blocks, result);
    }
  }

  function onDown(e: React.PointerEvent, block: DayBlock, mode: "move" | "resize") {
    if (disabled || gesture.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    dragged.current = false;
    const span = spanOf(block);
    const touch = e.pointerType !== "mouse";
    const g: Gesture = {
      id: block.id,
      pointerId: e.pointerId,
      mode: "pending",
      touch,
      startY: e.clientY,
      startScroll: window.scrollY,
      lastY: e.clientY,
      s: span.s,
      e: span.e,
      timer: null,
      moved: false,
    };
    gesture.current = g;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Not every browser allows capture here. Dragging still works without it.
    }
    if (mode === "resize") {
      e.stopPropagation();
      begin(g, "resize");
    } else if (touch) {
      g.timer = window.setTimeout(() => {
        if (gesture.current === g && g.mode === "pending" && !g.moved) begin(g, "move");
      }, HOLD_MS);
    }
  }

  function onMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    g.lastY = e.clientY;
    const far = Math.abs(e.clientY - g.startY) > (g.touch ? SLOP : 4);
    if (g.mode === "pending") {
      if (!far) return;
      if (g.touch) {
        // Moved before the hold finished: this is a scroll, not a drag.
        g.moved = true;
        if (g.timer !== null) window.clearTimeout(g.timer);
        g.timer = null;
        return;
      }
      begin(g, "move");
    }
    track(g);
  }

  function onUp(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    // A plain tap is left to the click that follows, so that click cannot
    // land on whatever the tap just opened.
    if (g.mode === "pending") {
      dragged.current = g.moved;
      end(false);
      return;
    }
    const d = draftRef.current;
    dragged.current = !!d && (d.s !== g.s || d.e !== g.e);
    end(true);
  }

  const hours: number[] = [];
  for (let m = range.s; m <= range.e; m += 60) hours.push(m);
  const nowMin = nowSeconds !== null ? nowSeconds / 60 : null;
  const nowInView = nowMin !== null && nowMin >= range.s && nowMin <= range.e;

  return (
    <div
      ref={root}
      className="relative select-none"
      style={{ height: height + 12, WebkitTouchCallout: "none" }}
      onContextMenu={(e) => e.preventDefault()}
      data-timeline
    >
      {/* hour lines; tapping an empty spot starts a new block there */}
      <div
        className="absolute inset-0"
        onClick={(e) => {
          if (disabled || draftRef.current) return;
          const box = e.currentTarget.getBoundingClientRect();
          const minute = range.s + (e.clientY - box.top) / PX_PER_MIN;
          onAddAt(Math.max(range.s, Math.min(DAY_END - 15, Math.floor(minute / 15) * 15)));
        }}
      >
        {hours.map((m) => (
          <div key={m} className="absolute right-0 left-0" style={{ top: y(m) }}>
            <span className="t-caption absolute top-[-7px] left-0 w-[42px] text-right leading-none text-ink-2">{m === DAY_END ? "12 AM" : hourLabel(m)}</span>
            <span className="absolute right-0 block h-px bg-hair" style={{ left: GUTTER }} />
          </div>
        ))}
      </div>

      {/* now, in the gaps: it sits under the blocks, and a live block draws its own line */}
      {nowInView && nowMin !== null ? (
        <div className="pointer-events-none absolute right-0 left-0 z-[5]" style={{ top: y(nowMin) }} data-now-line>
          <span className="absolute right-0 block h-[2px] -translate-y-px rounded-full bg-accent" style={{ left: GUTTER - 2 }} />
        </div>
      ) : null}

      {/* blocks */}
      {/* the layer lets taps through to the gaps. Only the blocks take them. */}
      <div className="pointer-events-none absolute top-0 right-0 bottom-0" style={{ left: GUTTER + 4 }}>
        {shown.map((b) => {
          const span = spanOf(b);
          const dragging = draft?.id === b.id;
          const lane = dragging && draft.mode === "move" ? { lane: 0, lanes: 1 } : (lanes.get(b.id) ?? { lane: 0, lanes: 1 });
          const top = y(span.s);
          const h = Math.max(20, (span.e - span.s) * PX_PER_MIN - 3);
          const was = original.get(b.id);
          const shifted = !!draft && !dragging && !!was && (was.start !== b.start || was.end !== b.end);
          const timer = nowSeconds !== null ? timerState(b, nowSeconds) : null;
          const live = timer?.phase === "live" && !dragging;
          const past = timer?.phase === "over";
          const alert = b.kind === "free" && past && !cleared.has(b.id) && (timer?.overBy ?? 0) <= 30 * 60;
          const Icon = b.source === "calendar" ? CALENDAR_ICON : KIND_ICON[b.kind];
          const tall = h >= 46;
          const tiny = h < 30;
          // Under about 45 minutes there is one line of text, and under 35 no room for a grip that is not also the tap target.
          const line = h < 62;
          const grip = h >= 44 && !disabled;
          const warn = flagged.has(b.id);
          // One look per state. Live is the gradient. Fixed blocks are solid tiles with a rail
          // and a lock, flexible ones are glass. A block that is over is only an outline.
          const look = dragging
            ? "z-30 cursor-grabbing border border-ink bg-surface-3 shadow-float transition-none"
            : live
              ? "grad shadow-glow z-10 cursor-pointer border border-transparent"
              : alert
                ? "z-10 cursor-pointer border border-warn-line bg-warn-soft"
                : past
                  ? "z-10 cursor-pointer border border-tile-line"
                  : b.flexible
                    ? "glass z-10 cursor-pointer"
                    : "tile z-10 cursor-pointer";
          const main = live ? "text-accent-ink" : past && !alert && !dragging ? "text-ink-2" : "text-ink";
          const quiet = live ? "text-accent-ink-2" : "text-ink-2";
          const box = {
            top,
            height: h,
            left: `calc(${(lane.lane / lane.lanes) * 100}% + ${lane.lane > 0 ? 2 : 0}px)`,
            width: `calc(${100 / lane.lanes}% - ${lane.lanes > 1 ? 2 : 0}px)`,
          };
          const move = "transition-[top,height,left,width,box-shadow,background-color] duration-150 ease-out motion-reduce:transition-none";
          return (
            <Fragment key={b.id}>
            {/* glass lets the page through, so a plate of the page color keeps the hour lines out of the block */}
            {!dragging ? <div className={cn("absolute bg-bg", move, tiny ? "rounded-[10px]" : "rounded-[16px]")} style={box} aria-hidden /> : null}
            <div
              role="button"
              tabIndex={0}
              aria-label={`${b.block_name}, ${formatTime(b.start)} to ${formatTime(b.end)}${b.flexible ? "" : ", fixed"}. Edit`}
              data-block={b.id}
              data-name={b.block_name}
              data-live={live ? "" : undefined}
              onPointerDown={(e) => onDown(e, b, "move")}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={() => end(false)}
              onClick={() => {
                if (!dragged.current && !disabled) onOpen(b);
                dragged.current = false;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen(b);
                }
              }}
              className={cn(
                "pointer-events-auto absolute overflow-hidden text-left outline-offset-2",
                tiny ? "rounded-[10px]" : "rounded-[16px]",
                move,
                look,
                !dragging && !live && !alert && (warn ? "border-warn" : shifted ? "border-ink-2" : null),
              )}
              style={box}
            >
              {!b.flexible && !live ? <span className={cn("absolute top-0 bottom-0 left-0 w-[3px]", past ? "bg-ink-3" : "bg-ink-2")} aria-hidden /> : null}
              {/* where now is inside the block that is live */}
              {live && timer && !line ? <span className="pointer-events-none absolute right-0 left-0 h-[2px] -translate-y-px bg-accent-ink" style={{ top: `${timer.progress * 100}%` }} aria-hidden /> : null}
              <div className={cn("relative flex h-full min-w-0 gap-2.5 pr-3", b.flexible || live ? "pl-3.5" : "pl-4", tiny || !grip ? "items-center" : line ? "items-start pt-2" : "items-start pt-2.5")}>
                {!tiny && lane.lanes === 1 ? <Icon size={16} strokeWidth={1.75} className={cn("shrink-0", !line && "mt-[2px]", quiet)} aria-hidden /> : null}
                <div className={cn("min-w-0 flex-1", line && "flex items-baseline gap-2")}>
                  <p className={cn("truncate font-medium tracking-[-0.01em]", main, tiny ? "text-[13px]" : "text-[15px] leading-tight")}>{b.block_name}</p>
                  {line && (lane.lanes > 1 || (b.kind === "free" && live)) && !dragging ? null : (
                    <p className={cn("t-caption truncate", line ? "shrink-0" : "mt-1", dragging || shifted ? "text-ink" : quiet)}>
                      {formatTime(b.start)} to {formatTime(b.end)}
                      {tall && lane.lanes === 1 ? `, ${formatDuration(span.e - span.s)}` : ""}
                    </p>
                  )}
                </div>
                {b.kind === "free" && live && timer ? (
                  <span className="tabular shrink-0 self-center text-[20px] leading-none font-medium tracking-[-0.03em] text-accent-ink" data-countdown>
                    {formatCountdown(timer.remaining)}
                  </span>
                ) : alert ? (
                  <span className="t-label shrink-0 self-center text-warn">Time is up</span>
                ) : live ? (
                  <span className={cn("t-label shrink-0 text-accent-ink", line && "self-center")} aria-label="Now">
                    Now
                  </span>
                ) : !b.flexible && !tiny ? (
                  <Lock size={13} strokeWidth={1.75} className={cn("shrink-0", !line && "mt-[3px]", quiet)} aria-label="Fixed" />
                ) : null}
              </div>
              {/* the resize grip */}
              {grip ? (
                <div
                  data-grip={b.id}
                  aria-hidden
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => onDown(e, b, "resize")}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={() => end(false)}
                  className="absolute bottom-0 left-1/2 flex h-[22px] w-[88px] -translate-x-1/2 cursor-ns-resize touch-none items-end justify-center pb-[5px]"
                >
                  <span className={cn("h-[3px] w-7 rounded-full", live ? "bg-accent-ink-2" : dragging && draft.mode === "resize" ? "bg-ink" : past ? "bg-ink-3" : "bg-ink-2")} />
                </div>
              ) : null}
            </div>
            </Fragment>
          );
        })}
      </div>

      {/* the time in the gutter: now, or the time being dragged to */}
      {draft ? (
        <div
          className="pointer-events-none absolute left-0 z-40 w-[46px] rounded-full bg-ink py-[4px] text-center text-[11px] leading-none font-medium text-bg"
          style={{ top: y(draft.mode === "move" ? draft.s : draft.e) - 10 }}
        >
          {formatTime(timeFromMinutes(draft.mode === "move" ? draft.s : draft.e)).replace(" ", "")}
        </div>
      ) : nowInView && nowMin !== null ? (
        <div className="pointer-events-none absolute left-0 z-20" style={{ top: y(nowMin) - 10 }}>
          <span className="grad block w-[46px] rounded-full py-[4px] text-center text-[11px] leading-none font-medium">
            {formatTime(timeFromMinutes(Math.floor(nowMin))).replace(" ", "")}
          </span>
        </div>
      ) : null}
    </div>
  );
}
