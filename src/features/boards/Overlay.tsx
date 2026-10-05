"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/components/ui";

let openOverlays = 0;

export interface OverlayProps {
  onClose: () => void;
  label: string;
  children: ReactNode;
  className?: string;
  /** Pinned to the bottom, above the safe area. */
  footer?: ReactNode;
}

/**
 * A full screen layer over the app, tab bar included. For looking at one
 * thing with nothing else on screen. Escape closes it.
 */
export function Overlay({ onClose, label, children, className, footer }: OverlayProps) {
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
    <div
      ref={panel}
      data-layer
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-bg text-ink outline-none"
    >
      <div className={cn("no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain", className)}>{children}</div>
      {footer ? <div className="shrink-0 border-t border-hair bg-bg px-5 pt-3 pb-[calc(var(--safe-b)+12px)]">{footer}</div> : null}
    </div>,
    document.body,
  );
}
