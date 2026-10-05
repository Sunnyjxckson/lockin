"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

let openOverlays = 0;

export interface OverlayProps {
  onClose: () => void;
  /** Read by screen readers: what this layer is. */
  label: string;
  children: ReactNode;
  /** On the scrolling body. */
  className?: string;
  /** Pinned to the top, under the safe area. It does not scroll, so it needs no fill of its own and the lights run on behind it. */
  header?: ReactNode;
  /** Pinned to the bottom, above the safe area. */
  footer?: ReactNode;
}

/**
 * A full screen layer over the app, tab bar included, for looking at one
 * thing with nothing else on screen (a board item, the look studio). It is
 * `lit`: the page color with the same three lights as the page, so it reads
 * as the app and not as a flat panel. Escape closes it. Anything else that
 * has to cover the whole screen (the focus view, a finish moment) puts `lit`
 * on its own fixed layer.
 */
export function Overlay({ onClose, label, children, className, header, footer }: OverlayProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    openOverlays += 1;
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        // Only the top layer answers, so a sheet or overlay opened from here closes first.
        const layers = document.querySelectorAll("[data-layer]");
        if (layers[layers.length - 1] === panel.current) onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      openOverlays -= 1;
      if (openOverlays === 0 && !document.querySelector('[role="dialog"][aria-modal="true"]:not([data-layer])')) document.body.style.overflow = "";
      previous?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={panel} data-layer role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className="lit animate-fade-in fixed inset-0 z-50 flex flex-col text-ink outline-none">
      {header ? <div className="shrink-0 border-b border-hair px-5 pt-[var(--safe-t)]">{header}</div> : null}
      <div className={cn("no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain", className)}>{children}</div>
      {footer ? <div className="shrink-0 border-t border-hair px-5 pt-3 pb-[calc(var(--safe-b)+12px)]">{footer}</div> : null}
    </div>,
    document.body,
  );
}
