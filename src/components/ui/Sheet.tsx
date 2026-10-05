"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Smaller line under the title. */
  subtitle?: string;
  /** Pinned to the bottom of the sheet, for the main action. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

let openSheets = 0;

/**
 * Bottom sheet. Closes on backdrop tap, Escape, or a swipe down on the handle.
 * It follows the visual viewport, so when the on-screen keyboard opens the
 * sheet and its footer sit above it and the focused field is scrolled into view.
 */
export function Sheet({ open, onClose, title, subtitle, footer, children, className }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    openSheets += 1;
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    // Keep the sheet inside what is actually visible. On iOS the keyboard
    // covers the bottom of the layout viewport without resizing it.
    const vv = window.visualViewport;
    const fit = () => {
      const el = frame.current;
      if (!el || !vv) return;
      el.style.height = `${vv.height}px`;
      el.style.top = `${vv.offsetTop}px`;
      const active = document.activeElement;
      if (active instanceof HTMLElement && panel.current?.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) {
        active.scrollIntoView({ block: "nearest" });
      }
    };
    fit();
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    const onFocus = (e: FocusEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) window.setTimeout(() => t.scrollIntoView({ block: "nearest" }), 250);
    };
    const panelEl = panel.current;
    panelEl?.addEventListener("focusin", onFocus);
    return () => {
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
      panelEl?.removeEventListener("focusin", onFocus);
      openSheets -= 1;
      if (openSheets === 0) document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, dy: 0 };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !panel.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    panel.current.style.transform = `translateY(${drag.current.dy}px)`;
    panel.current.style.transition = "none";
  };
  const onPointerUp = () => {
    if (!drag.current || !panel.current) return;
    const far = drag.current.dy > 90;
    drag.current = null;
    panel.current.style.transition = "transform 200ms var(--ease-out)";
    panel.current.style.transform = "";
    if (far) onClose();
  };

  return createPortal(
    <div ref={frame} className="fixed inset-x-0 top-0 z-50 flex h-dvh items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="animate-fade-in absolute inset-0 cursor-default bg-scrim"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          "animate-sheet-up relative flex max-h-[92%] w-full max-w-[480px] flex-col rounded-t-[28px] border border-b-0 border-line bg-surface outline-none",
          className,
        )}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none justify-center pt-2.5 pb-1.5"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="h-1 w-9 rounded-full bg-line-strong" />
        </div>
        {title ? (
          <div className="shrink-0 px-5 pt-1.5 pb-3">
            <h2 id={titleId} className="t-h2">
              {title}
            </h2>
            {subtitle ? <p className="t-sub mt-1">{subtitle}</p> : null}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-line px-5 pt-3 pb-[calc(12px+var(--safe-b))]">{footer}</div>
        ) : (
          <div className="shrink-0 pb-[var(--safe-b)]" />
        )}
      </div>
    </div>,
    document.body,
  );
}
