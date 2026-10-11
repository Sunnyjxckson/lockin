"use client";

import { useRef, type PointerEvent } from "react";

export const SWIPE_DISTANCE = 64;
const LOCK = 10;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

interface Drag {
  id: number;
  x: number;
  y: number;
  t: number;
  dx: number;
  locked: boolean;
}

/**
 * Horizontal swipe on touch and pen. `onSwipe(1)` is a swipe left (the next
 * quote), `onSwipe(-1)` a swipe right. The element follows the finger once the
 * move is clearly sideways, so a vertical scroll is never taken. Release past
 * the distance, or fast enough, and it slides away, then `onSwipe` runs and the
 * caller draws the next card. Spread the result on the element, which should
 * have `touch-action: pan-y`. A mouse does not drag: it has the buttons and
 * the arrow keys.
 */
export function useSwipe(onSwipe: (dir: 1 | -1) => void, enabled = true) {
  const drag = useRef<Drag | null>(null);
  // True while a card is sliding away, so a second drag cannot start under it.
  const leaving = useRef(false);

  const reset = (el: HTMLElement, animate: boolean) => {
    el.style.transition = animate ? "transform 180ms var(--ease-out), opacity 180ms var(--ease-out)" : "none";
    el.style.transform = "";
    el.style.opacity = "";
  };

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (!enabled || leaving.current || e.pointerType === "mouse" || !e.isPrimary) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, dx: 0, locked: false };
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.locked) {
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
      if (Math.abs(dx) > Math.abs(dy) * 1.2) {
        d.locked = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } else {
        drag.current = null;
        return;
      }
    }
    d.dx = dx;
    const el = e.currentTarget;
    el.style.transition = "none";
    el.style.transform = `translateX(${dx * 0.85}px)`;
    el.style.opacity = String(Math.max(0.35, 1 - Math.abs(dx) / 420));
  };

  const finish = (e: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const el = e.currentTarget;
    if (!d.locked) return;
    const speed = Math.abs(d.dx) / Math.max(1, e.timeStamp - d.t);
    const far = Math.abs(d.dx) >= SWIPE_DISTANCE || (Math.abs(d.dx) >= 28 && speed > 0.45);
    if (cancelled || !far) {
      reset(el, !prefersReducedMotion());
      return;
    }
    const dir: 1 | -1 = d.dx < 0 ? 1 : -1;
    if (prefersReducedMotion()) {
      reset(el, false);
      onSwipe(dir);
      return;
    }
    el.style.transition = "transform 130ms var(--ease-out), opacity 130ms var(--ease-out)";
    el.style.transform = `translateX(${-dir * 120}px)`;
    el.style.opacity = "0";
    leaving.current = true;
    window.setTimeout(() => {
      leaving.current = false;
      reset(el, false);
      onSwipe(dir);
    }, 130);
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: PointerEvent<HTMLElement>) => finish(e, false),
    onPointerCancel: (e: PointerEvent<HTMLElement>) => finish(e, true),
  };
}
